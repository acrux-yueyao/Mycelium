/**
 * Physics field — per-frame force integration for the live entity list.
 *
 *   Attraction     long-range (180 < d < 500), scaled by compat(a, b).
 *                  SCALED DOWN 0.25× when the pair is actively bonded,
 *                  so the two drift rather than magnetically lock.
 *                  SKIPPED when either side is mid-transformation.
 *   Repulsion      short-range (d < 160), prevents overlap.
 *   Wander         a gentle, slowly-rotating independent heading on each
 *                  entity. Keeps them "alive" even with no neighbors.
 *   Walls          soft spring inward from 100px of the viewport edges.
 *   Center         soft push out of a 190px radius around the tree-hole
 *                  input at screen center.
 *   Damping        velocity × 0.92 per frame → drifting-through-cream feel.
 */
import { compatibility, type CharId } from '../data/characters';
import type { Connection } from './connections';

export interface PhysBody {
  id: string;
  charId: CharId;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** If 'infecting' or 'transforming', pairwise attraction is skipped
   *  so the entity can wander freely while it morphs. */
  infectionState?: 'normal' | 'infecting' | 'transforming' | 'hybrid';
}

const ATTRACT_K = 0.10;
const ATTRACT_MIN = 180;
const ATTRACT_MAX = 500;
const REPEL_R = 160;
const REPEL_K = 0.18;
const WALL_MARGIN = 100;
const WALL_K = 0.06;
const CENTER_R = 190;
const CENTER_K = 0.35;
const DAMPING = 0.92;
// Wander: small independent force that keeps entities drifting on their own.
const WANDER_K = 0.02;
// Bonded pairs: scale their mutual attraction. 1 = full latch, 0 = none.
const BONDED_ATTRACT_SCALE = 0.25;
// Tendril spring stiffness — how firmly a bonded pair is pulled back if
// the body tries to drift past the tendril's rest length. Too high feels
// rigid; too low lets the body escape without the tendril reacting.
const SPRING_K = 0.012;

export function findNearestBody<T extends PhysBody>(
  self: T,
  bodies: T[],
  maxRange: number,
): T | null {
  let nearest: T | null = null;
  let bestD = maxRange;
  for (const b of bodies) {
    if (b.id === self.id) continue;
    const d = Math.hypot(b.x - self.x, b.y - self.y);
    if (d < bestD) {
      bestD = d;
      nearest = b;
    }
  }
  return nearest;
}

// Stable per-entity seed derived from the id string.
function idSeed(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) % 10000 / 10000;
}

// Slowly-rotating independent heading per entity. Using two low-frequency
// sines (not perlin, to stay lib-free) seeded by the entity id so each one
// drifts along its own path.
function wanderForce(id: string, t: number): [number, number] {
  const s = idSeed(id);
  const a =
    Math.sin(t * 0.00031 + s * 7.3) * 2.2 +
    Math.sin(t * 0.00017 + s * 11.1) * 3.4;
  return [Math.cos(a) * WANDER_K, Math.sin(a) * WANDER_K];
}

export function stepField<T extends PhysBody>(
  bodies: T[],
  viewportW: number,
  viewportH: number,
  connections?: Map<string, Connection>,
  now: number = performance.now(),
): T[] {
  if (bodies.length === 0 || viewportW === 0 || viewportH === 0) {
    return bodies;
  }
  const cx = viewportW / 2;
  const cy = viewportH / 2;

  // Pre-index bonded pairs for O(1) lookup inside the nested loop.
  // A pair is "bonded" if it has a live connection in growing/bonded state.
  // Retracting connections no longer exert attraction scaling or springs.
  const bondedPairs = new Set<string>();
  // Tendril-as-spring: once a connection reaches 'bonded', its restLength
  // is captured (in connections.ts). While stretched beyond rest, the
  // tendril pulls the pair back together — the body can't just drift away
  // carrying the tendril. Retracting connections release the spring.
  const bondedSprings = new Map<string, number>();  // pairKey → restLength
  if (connections) {
    for (const c of connections.values()) {
      if (c.state === 'retracting') continue;
      const k = c.a.id < c.b.id ? `${c.a.id}|${c.b.id}` : `${c.b.id}|${c.a.id}`;
      bondedPairs.add(k);
      if (c.state === 'bonded' && c.restLength != null) {
        bondedSprings.set(k, c.restLength);
      }
    }
  }

  return bodies.map((a) => {
    let fx = 0;
    let fy = 0;

    for (const b of bodies) {
      if (a.id === b.id) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = Math.hypot(dx, dy) || 1;
      const nx = dx / d;
      const ny = dy / d;

      const aBusy = a.infectionState === 'infecting' || a.infectionState === 'transforming';
      const bBusy = b.infectionState === 'infecting' || b.infectionState === 'transforming';
      if (!aBusy && !bBusy && d > ATTRACT_MIN && d < ATTRACT_MAX) {
        const pairKey = a.id < b.id ? `${a.id}|${b.id}` : `${b.id}|${a.id}`;
        const scale = bondedPairs.has(pairKey) ? BONDED_ATTRACT_SCALE : 1;
        const f = ATTRACT_K * compatibility(a.charId, b.charId) * scale;
        fx += nx * f;
        fy += ny * f;
      }
      if (d < REPEL_R) {
        const t = (REPEL_R - d) / REPEL_R;
        const f = REPEL_K * t * t * REPEL_R;
        fx -= nx * f;
        fy -= ny * f;
      }

      // Tendril spring: inward pull only when the pair is stretched past
      // the tendril's rest length. Gives the "本体受触手约束" feel —
      // connected bodies can't drift apart freely. If the stretch exceeds
      // STRETCH_RETRACT_FACTOR (in connections.ts) the connection itself
      // will transition to retracting this frame, and the spring goes away.
      const pKey = a.id < b.id ? `${a.id}|${b.id}` : `${b.id}|${a.id}`;
      const rest = bondedSprings.get(pKey);
      if (rest != null && d > rest) {
        const stretch = d - rest;
        const spring = stretch * SPRING_K;
        fx += nx * spring;
        fy += ny * spring;
      }
    }

    // Independent wander: gentle, non-social drift.
    const [wx, wy] = wanderForce(a.id, now);
    fx += wx;
    fy += wy;

    if (a.x < WALL_MARGIN) {
      fx += (WALL_MARGIN - a.x) * WALL_K;
    } else if (a.x > viewportW - WALL_MARGIN) {
      fx -= (a.x - (viewportW - WALL_MARGIN)) * WALL_K;
    }
    if (a.y < WALL_MARGIN) {
      fy += (WALL_MARGIN - a.y) * WALL_K;
    } else if (a.y > viewportH - WALL_MARGIN) {
      fy -= (a.y - (viewportH - WALL_MARGIN)) * WALL_K;
    }

    const dcx = a.x - cx;
    const dcy = a.y - cy;
    const dc = Math.hypot(dcx, dcy) || 1;
    if (dc < CENTER_R) {
      const push = ((CENTER_R - dc) / CENTER_R) * CENTER_K;
      fx += (dcx / dc) * push * CENTER_R * 0.1;
      fy += (dcy / dc) * push * CENTER_R * 0.1;
    }

    const vx = (a.vx + fx) * DAMPING;
    const vy = (a.vy + fy) * DAMPING;
    const x = a.x + vx;
    const y = a.y + vy;

    return {
      ...a,
      vx,
      vy,
      x: Math.max(20, Math.min(viewportW - 20, x)),
      y: Math.max(20, Math.min(viewportH - 20, y)),
    };
  });
}
