/**
 * Filament physics — each connection's exploratory tendril has a live
 * growth tip that advances frame-by-frame rather than being a mask
 * that reveals a pre-computed bezier.
 *
 * A filament's shape is ONLY what the tip actually traced; it's not
 * known in advance. The tip is pulled toward the target with a weak
 * force, slow wandering noise, and repulsion from any non-endpoint
 * mushroom in its way. The result feels like a hypha probing forward,
 * adjusting, occasionally slowing or curling, and eventually touching
 * the far body — rather than a UI path animation.
 */
import type { Connection } from './connections';

export type FilamentRole = 'primary' | 'probe';

export interface TrailPoint {
  x: number;
  y: number;
  /** performance.now() ms when this point was pushed. */
  t: number;
}

export interface Entity {
  id: string;
  x: number;
  y: number;
}

export interface FilamentState {
  id: string;
  connectionId: string;
  role: FilamentRole;
  /** Which entity is the origin (where the filament sprouts from). */
  originId: string;
  /** Which entity is the target. */
  targetId: string;
  /** Peak ribbon width once mature. */
  maxWidth: number;
  /** Sprouting delay in ms from filament birth (connection bornAt). */
  growDelayMs: number;
  /** When this filament was created (connection bornAt). */
  bornAt: number;
  /** Whether sprout delay has elapsed. */
  sprouted: boolean;
  /** Current tip position (the growth front). */
  tipX: number;
  tipY: number;
  /** Current tip velocity. */
  tipVx: number;
  tipVy: number;
  /** Accumulated path the tip has traced, oldest → newest. */
  trail: TrailPoint[];
  /** True once the tip has landed on the target's silhouette. */
  reached: boolean;
  /** ms when reached. */
  reachedAt?: number;
  /** Seed for wobble / variation. */
  seed: number;
  /** Side bias: prefer +1 or -1 perpendicular to the A→B axis. */
  side: 1 | -1;
  /** For probes: when (s into bonded) the ribbon starts fading. */
  decayStartBondedS?: number;
  decayDurationS?: number;
}

const EDGE_RADIUS = 72;          // silhouette edge of a 180px sprite
const REACH_DISTANCE = 80;       // tip considered "landed" within this of target center
const INITIAL_SPEED = 0.35;      // px / frame initial velocity
const ATTRACT_K_FAR = 0.04;      // weak pull while exploring
const ATTRACT_K_NEAR = 0.10;     // firmer pull when within ~180px
const ATTRACT_NEAR_R = 180;
const WOBBLE_K = 0.038;          // wander strength
const WOBBLE_FREQ_1 = 1.3;
const WOBBLE_FREQ_2 = 2.7;
const BLOCKER_R = 110;           // repel radius around non-endpoint mushrooms
const BLOCKER_K = 0.22;
const SLOWDOWN_R = 100;          // decelerate into target
const DAMPING = 0.92;
const TRAIL_MIN_STEP = 3.6;      // min px travel before recording a new trail point
const TRAIL_MAX_LEN = 140;       // safety cap

function hashId(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Create a fresh filament state for a new connection + role + index. */
export function initFilament(
  c: Connection,
  role: FilamentRole,
  probeIndex: number,
  now: number,
  entities: Map<string, Entity>,
  baseMaxWidth: number,
): FilamentState | null {
  const origin = entities.get(c.a.id);
  const target = entities.get(c.b.id);
  if (!origin || !target) return null;

  const dx = target.x - origin.x;
  const dy = target.y - origin.y;
  const dist = Math.hypot(dx, dy) || 1;
  const nx = dx / dist;
  const ny = dy / dist;

  const seed = hashId(`${c.id}-${role}${probeIndex}`);
  const baseSign: 1 | -1 = seed & 1 ? 1 : -1;
  const side: 1 | -1 =
    role === 'primary' ? baseSign : probeIndex === 0 ? (-baseSign as 1 | -1) : baseSign;

  // Sprout from the origin's silhouette edge, heading toward target
  // but slightly perpendicular to break symmetry.
  const tipX = origin.x + nx * EDGE_RADIUS;
  const tipY = origin.y + ny * EDGE_RADIUS;
  const perpX = -ny * side;
  const perpY = nx * side;
  // Probes fan out more aggressively at sprout.
  const perpBias = role === 'primary' ? 0.25 : 0.55 + probeIndex * 0.2;
  const tipVx = nx * INITIAL_SPEED + perpX * INITIAL_SPEED * perpBias;
  const tipVy = ny * INITIAL_SPEED + perpY * INITIAL_SPEED * perpBias;

  const growDelayMs =
    role === 'primary' ? 0 : 200 + probeIndex * 320;

  const maxWidth =
    role === 'primary'
      ? baseMaxWidth
      : baseMaxWidth * (0.32 - probeIndex * 0.1);

  return {
    id: `${c.id}-${role}${probeIndex}`,
    connectionId: c.id,
    role,
    originId: c.a.id,
    targetId: c.b.id,
    maxWidth,
    growDelayMs,
    bornAt: now,
    sprouted: false,
    tipX,
    tipY,
    tipVx,
    tipVy,
    trail: [{ x: tipX, y: tipY, t: now }],
    reached: false,
    seed,
    side,
    decayStartBondedS: role === 'probe' ? 0.7 + probeIndex * 0.35 : undefined,
    decayDurationS: role === 'probe' ? 2.4 : undefined,
  };
}

/** Advance one filament's physics by one frame. */
export function stepFilament(
  f: FilamentState,
  c: Connection,
  entities: Map<string, Entity>,
  now: number,
): void {
  // Wait out sprout delay.
  if (!f.sprouted) {
    if (now - f.bornAt < f.growDelayMs) return;
    f.sprouted = true;
  }

  const origin = entities.get(f.originId);
  const target = entities.get(f.targetId);
  if (!origin || !target) return;

  // During retract, trim the trail from the tip end over RETRACT_S.
  // Width fades happen in the renderer; here we just shrink the path.
  if (c.state === 'retracting') {
    if (c.retractStart != null) {
      const retractElapsedS = (now - c.retractStart) / 1000;
      const retractDurationS = 1.4; // matches RETRACT_S
      const keep = Math.max(0, 1 - retractElapsedS / retractDurationS);
      const desiredLen = Math.max(0, Math.floor(f.trail.length * keep));
      if (desiredLen < f.trail.length) f.trail.length = desiredLen;
    }
    return;
  }

  if (!f.reached) {
    // Attraction toward target.
    const tdx = target.x - f.tipX;
    const tdy = target.y - f.tipY;
    const tdist = Math.hypot(tdx, tdy) || 1;
    const tnx = tdx / tdist;
    const tny = tdy / tdist;

    const attractK = tdist < ATTRACT_NEAR_R ? ATTRACT_K_NEAR : ATTRACT_K_FAR;
    let fx = tnx * attractK;
    let fy = tny * attractK;

    // Wandering wobble (slow, directional).
    const nowS = now / 1000;
    const ang =
      Math.sin(nowS * WOBBLE_FREQ_1 + f.seed * 0.013) * 1.3 +
      Math.sin(nowS * WOBBLE_FREQ_2 + f.seed * 0.029) * 0.75;
    fx += Math.cos(ang) * WOBBLE_K;
    fy += Math.sin(ang) * WOBBLE_K;

    // Soft bias toward the filament's preferred side early on, so
    // probes actually fan out instead of bunching.
    const initialBiasFalloff = Math.max(0, 1 - tdist < 0 ? 0 : (f.trail.length < 10 ? 1 : 0));
    if (initialBiasFalloff > 0) {
      const perpX = -tny * f.side;
      const perpY = tnx * f.side;
      const bias = f.role === 'primary' ? 0.006 : 0.016;
      fx += perpX * bias * initialBiasFalloff;
      fy += perpY * bias * initialBiasFalloff;
    }

    // Obstacle repulsion from non-endpoint mushrooms.
    for (const [id, e] of entities) {
      if (id === f.originId || id === f.targetId) continue;
      const ex = f.tipX - e.x;
      const ey = f.tipY - e.y;
      const ed = Math.hypot(ex, ey) || 1;
      if (ed < BLOCKER_R) {
        const strength = ((BLOCKER_R - ed) / BLOCKER_R) * BLOCKER_K;
        fx += (ex / ed) * strength;
        fy += (ey / ed) * strength;
      }
    }

    // Deceleration envelope when close to target — tip hesitates.
    const slow = tdist < SLOWDOWN_R ? Math.max(0.5, tdist / SLOWDOWN_R) : 1;

    // Integrate.
    f.tipVx = (f.tipVx + fx) * DAMPING;
    f.tipVy = (f.tipVy + fy) * DAMPING;
    f.tipVx *= slow;
    f.tipVy *= slow;
    f.tipX += f.tipVx;
    f.tipY += f.tipVy;

    // Did we land?
    const finalDx = target.x - f.tipX;
    const finalDy = target.y - f.tipY;
    const finalDist = Math.hypot(finalDx, finalDy);
    if (finalDist < REACH_DISTANCE) {
      f.reached = true;
      f.reachedAt = now;
      // Snap tip to target silhouette so the ribbon lands cleanly.
      const snapNx = -finalDx / (finalDist || 1);
      const snapNy = -finalDy / (finalDist || 1);
      f.tipX = target.x + snapNx * EDGE_RADIUS;
      f.tipY = target.y + snapNy * EDGE_RADIUS;
      f.tipVx = 0;
      f.tipVy = 0;
    }
  } else {
    // After reach: keep tip glued to target's silhouette edge so the
    // ribbon's far end follows if the target drifts.
    const ex = f.tipX - target.x;
    const ey = f.tipY - target.y;
    const ed = Math.hypot(ex, ey) || 1;
    f.tipX = target.x + (ex / ed) * EDGE_RADIUS;
    f.tipY = target.y + (ey / ed) * EDGE_RADIUS;
  }

  // Keep first trail point on origin's edge as origin drifts.
  const odx = f.trail[0].x - origin.x;
  const ody = f.trail[0].y - origin.y;
  const od = Math.hypot(odx, ody) || 1;
  f.trail[0] = {
    x: origin.x + (odx / od) * EDGE_RADIUS,
    y: origin.y + (ody / od) * EDGE_RADIUS,
    t: f.trail[0].t,
  };

  // Record trail point when the tip has moved enough.
  const last = f.trail[f.trail.length - 1];
  if (Math.hypot(f.tipX - last.x, f.tipY - last.y) > TRAIL_MIN_STEP) {
    f.trail.push({ x: f.tipX, y: f.tipY, t: now });
    if (f.trail.length > TRAIL_MAX_LEN) {
      // Drop interior points (keep origin + recent): very long trails
      // shouldn't happen in practice but we guard anyway.
      f.trail.splice(1, f.trail.length - TRAIL_MAX_LEN);
    }
  }
}
