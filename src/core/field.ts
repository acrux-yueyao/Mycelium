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
  /** Wall-clock ms of last time this body had an active connection.
   *  Used by stepField to detect long-term isolation and apply a
   *  gentle drift toward the group's centre. */
  lastSocialAt?: number;
  /** Birth timestamp — used as an initial lastSocialAt fallback so
   *  freshly spawned creatures aren't treated as already isolated. */
  bornAt?: number;
  /** Per-creature tendril branching count (1..10). Higher = this
   *  creature wants more parallel filaments on every bond, not just
   *  a single tendril. Flattened from morphology.tendrilCount so
   *  stepConnections can read it without coupling to LiveEntity. */
  tendrilCount?: number;
}

// Attraction is weak and short-ranged now: mushrooms out of close
// contact drift on their own wander rather than gravitating toward
// every compatible neighbor. ATTRACT_MAX keeps it local.
const ATTRACT_K = 0.035;
const ATTRACT_MIN = 180;
const ATTRACT_MAX = 280;
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
// Retract pull — while a connection is retracting, this force ramps
// from 0 to its peak over the retract duration and actively drags both
// bodies toward each other. Tuned so two bodies roughly half-close
// their separation over the 2.2s retract window.
const RETRACT_PULL_K = 0.14;

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
  /** Pair keys (sorted a__b) mapped to wall-clock ms until which the
   *  pair is in post-disconnect cooldown. Pairs in cooldown have
   *  their mutual attraction zeroed, so a just-retracted pair drifts
   *  freely instead of being re-magneted back together. */
  cooldowns?: Map<string, number>,
  now: number = performance.now(),
): T[] {
  if (bodies.length === 0 || viewportW === 0 || viewportH === 0) {
    return bodies;
  }
  const cx = viewportW / 2;
  const cy = viewportH / 2;

  // Pre-index bonded pairs for O(1) lookup inside the nested loop.
  // A pair is "bonded" if it has a live connection in growing/bonded state.
  // Retracting connections no longer exert attraction scaling or springs
  // — they switch to a RETRACT PULL that actively drags the bodies
  // together while the tendril reels in (so the body closes distance
  // in sync with tendril shortening, not left behind in open space).
  const bondedPairs = new Set<string>();
  const bondedSprings = new Map<string, number>();         // pairKey → restLength
  const retractPulls = new Map<string, number>();          // pairKey → pull scalar 0..1
  // Per-body list of normalized partner directions for active
  // (growing / bonded) connections. Used at the end of the step to
  // strip any velocity component that would move the body AWAY from
  // an active tendril — bodies can only glide "toward" or
  // perpendicular to their tendrils, never backward.
  const tetherDirs = new Map<string, Array<{ nx: number; ny: number }>>();
  const addTether = (id: string, nx: number, ny: number) => {
    const list = tetherDirs.get(id);
    if (list) list.push({ nx, ny });
    else tetherDirs.set(id, [{ nx, ny }]);
  };
  if (connections) {
    const bodyById = new Map(bodies.map((b) => [b.id, b]));
    for (const c of connections.values()) {
      const k = c.a.id < c.b.id ? `${c.a.id}|${c.b.id}` : `${c.b.id}|${c.a.id}`;
      if (c.state === 'retracting') {
        const retractElapsedS = c.retractStart != null
          ? (now - c.retractStart) / 1000
          : 0;
        // Ramp from 0 → 1 over the retract duration. RETRACT_S
        // mirrors connections.ts; duplicating to avoid import cycles.
        const retractProgress = Math.min(1, retractElapsedS / 2.2);
        retractPulls.set(k, retractProgress);
        continue;
      }
      bondedPairs.add(k);
      if (c.state === 'bonded' && c.restLength != null) {
        bondedSprings.set(k, c.restLength);
      }
      // Record tether direction for both endpoints (growing + bonded).
      const ab = bodyById.get(c.a.id);
      const bb = bodyById.get(c.b.id);
      if (ab && bb) {
        const dx = bb.x - ab.x;
        const dy = bb.y - ab.y;
        const d = Math.hypot(dx, dy) || 1;
        const nx = dx / d;
        const ny = dy / d;
        addTether(ab.id, nx, ny);
        addTether(bb.id, -nx, -ny);
      }
    }
  }

  // === Cluster drift for isolated bodies ===
  // A body that hasn't had an active connection for ISOLATION_MS
  // gets a gentle pull toward the centroid of the still-social
  // bodies. This realises the vision line "孤立的微生物会缓慢向
  // 群落漂移". We compute the centroid once per step using only
  // social-recent bodies so the isolated ones don't pull each
  // other into their own lonely cluster.
  const ISOLATION_MS = 8_000;
  const ISOLATION_DRIFT = 0.05;
  let sumX = 0;
  let sumY = 0;
  let socialCount = 0;
  for (const b of bodies) {
    const lastSoc = b.lastSocialAt ?? b.bornAt ?? now;
    if (now - lastSoc < ISOLATION_MS) {
      sumX += b.x;
      sumY += b.y;
      socialCount += 1;
    }
  }
  const clusterX = socialCount > 0 ? sumX / socialCount : null;
  const clusterY = socialCount > 0 ? sumY / socialCount : null;

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
        // Pairs that recently finished a connection cycle are in
        // cooldown — zero their mutual attraction so they don't get
        // magneted back together. Gives "菌子找完别的菌是自由的".
        // (connections.ts uses pair keys joined by '__'; field uses
        // '|'. Normalize to the connections.ts format here.)
        const cdKey = a.id < b.id ? `${a.id}__${b.id}` : `${b.id}__${a.id}`;
        const cdUntil = cooldowns?.get(cdKey);
        if (cdUntil != null && now < cdUntil) continue;
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

      const pKey = a.id < b.id ? `${a.id}|${b.id}` : `${b.id}|${a.id}`;

      // Retract pull: while the tendril reels in, both bodies actively
      // close distance toward each other. Ramps from 0 → RETRACT_PULL_K
      // over the retract duration so the bodies noticeably approach
      // as the ribbon shortens. Without this, the body stays where it
      // was and the tendril visually "disappears behind" it.
      const retractProg = retractPulls.get(pKey);
      if (retractProg != null) {
        const pull = RETRACT_PULL_K * retractProg;
        fx += nx * pull;
        fy += ny * pull;
      }

      // Tendril spring: inward pull only when the pair is stretched past
      // the tendril's rest length. Gives the "本体受触手约束" feel —
      // connected bodies can't drift apart freely. If the stretch exceeds
      // STRETCH_RETRACT_FACTOR (in connections.ts) the connection itself
      // will transition to retracting this frame, and the spring goes away.
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

    // Isolation → drift toward cluster centroid. Skip while the body
    // is mid-transformation or itself already social. Strength is
    // tiny so it reads as a slow yearning rather than a magnet.
    if (
      clusterX != null &&
      clusterY != null &&
      a.infectionState !== 'infecting' &&
      a.infectionState !== 'transforming'
    ) {
      const aLastSoc = a.lastSocialAt ?? a.bornAt ?? now;
      if (now - aLastSoc >= ISOLATION_MS) {
        const ddx = clusterX - a.x;
        const ddy = clusterY - a.y;
        const dd = Math.hypot(ddx, ddy) || 1;
        fx += (ddx / dd) * ISOLATION_DRIFT;
        fy += (ddy / dd) * ISOLATION_DRIFT;
      }
    }

    let vx = (a.vx + fx) * DAMPING;
    let vy = (a.vy + fy) * DAMPING;

    // Tether constraint: for every active (growing/bonded) tendril on
    // this body, project out any velocity component pointing AWAY
    // from the partner. Bodies can move toward or perpendicular to
    // their tendrils, but never backward. Implements the user's
    // "菌子跟着触手的方向走，不要反方向移动" requirement.
    const tethers = tetherDirs.get(a.id);
    if (tethers) {
      for (const { nx: tnx, ny: tny } of tethers) {
        const dot = vx * tnx + vy * tny;
        if (dot < 0) {
          vx -= tnx * dot;
          vy -= tny * dot;
        }
      }
    }

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
