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
  /** Last seen origin / target position, so we can translate the trail
   *  each frame by the endpoints' motion. Prevents "body left, tendril
   *  still in old position" — the whole trail travels with the bodies. */
  lastOriginX: number;
  lastOriginY: number;
  lastTargetX: number;
  lastTargetY: number;
}

const EDGE_RADIUS = 45;          // origin on the visible sprite silhouette
const REACH_DISTANCE = 55;       // tip considered "landed" within this of target center
const INITIAL_SPEED = 0.16;      // px / frame initial velocity (slow exploration)
const ATTRACT_K_FAR = 0.025;     // weak pull while exploring
const ATTRACT_K_NEAR = 0.060;    // firmer pull when within ATTRACT_NEAR_R
const ATTRACT_NEAR_R = 180;
const WOBBLE_K = 0.024;          // wander strength (gentler)
const WOBBLE_FREQ_1 = 1.1;
const WOBBLE_FREQ_2 = 2.3;
const WOBBLE_FREQ_3 = 0.47;      // third frequency → less predictable
const BLOCKER_R = 110;           // repel radius around non-endpoint mushrooms
const BLOCKER_K = 0.22;
const SLOWDOWN_R = 110;          // decelerate into target
const DAMPING = 0.93;
const TRAIL_MIN_STEP = 3.2;      // min px travel before recording a new trail point
const TRAIL_MAX_LEN = 160;       // safety cap

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
  // Probes fan out with a narrower angle than before so they still
  // visibly target the same mushroom rather than drifting off into
  // empty space. Primary launches mostly straight.
  const perpBias = role === 'primary' ? 0.10 : 0.25 + probeIndex * 0.12;
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
    lastOriginX: origin.x,
    lastOriginY: origin.y,
    lastTargetX: target.x,
    lastTargetY: target.y,
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

  // Translate the entire trail (and tip) by the weighted endpoint
  // motion since last frame, so the tendril moves WITH the bodies
  // instead of staying pinned in world space. A trail point's weight
  // is its position-along-trail: origin-end (t=0) moves 100% with
  // the origin, tip-end (t=1) moves 100% with the target, middle
  // points are lerp'd.
  const originDx = origin.x - f.lastOriginX;
  const originDy = origin.y - f.lastOriginY;
  const targetDx = target.x - f.lastTargetX;
  const targetDy = target.y - f.lastTargetY;
  if (originDx !== 0 || originDy !== 0 || targetDx !== 0 || targetDy !== 0) {
    const N = f.trail.length;
    for (let i = 0; i < N; i++) {
      const t = N > 1 ? i / (N - 1) : 0;
      f.trail[i] = {
        x: f.trail[i].x + originDx * (1 - t) + targetDx * t,
        y: f.trail[i].y + originDy * (1 - t) + targetDy * t,
        t: f.trail[i].t,
      };
    }
    // The live tip sits one step past the last trail point; translate
    // it as if at t=1 (fully following the target) since the tip
    // represents "latest reach toward target".
    f.tipX += targetDx;
    f.tipY += targetDy;
  }
  f.lastOriginX = origin.x;
  f.lastOriginY = origin.y;
  f.lastTargetX = target.x;
  f.lastTargetY = target.y;

  // During retract, leave the trail intact — the renderer fades width
  // from the TIP end back toward the origin end, so the ribbon visibly
  // withdraws (tip → origin) as a continuous process instead of
  // popping points off the array.
  if (c.state === 'retracting') return;

  if (!f.reached) {
    // Attraction toward target.
    const tdx = target.x - f.tipX;
    const tdy = target.y - f.tipY;
    const tdist = Math.hypot(tdx, tdy) || 1;
    const tnx = tdx / tdist;
    const tny = tdy / tdist;

    // Smoothly interpolate between far and near attraction strength as
    // tdist crosses ATTRACT_NEAR_R, so the tip's velocity doesn't
    // jerk at the threshold.
    const nearMix = 1 - Math.min(1, tdist / ATTRACT_NEAR_R);
    const attractK = ATTRACT_K_FAR + (ATTRACT_K_NEAR - ATTRACT_K_FAR) * nearMix;
    let fx = tnx * attractK;
    let fy = tny * attractK;

    // Wandering wobble — three incommensurate frequencies, applied as a
    // rotation on the target-heading so wobble biases the direction of
    // approach rather than pointing the tip into empty space.
    const nowS = now / 1000;
    const ang =
      Math.sin(nowS * WOBBLE_FREQ_1 + f.seed * 0.013) * 0.55 +
      Math.sin(nowS * WOBBLE_FREQ_2 + f.seed * 0.029) * 0.35 +
      Math.sin(nowS * WOBBLE_FREQ_3 + f.seed * 0.047) * 0.22;
    // Rotate (tnx, tny) by `ang` radians and push tip along it.
    const ca = Math.cos(ang);
    const sa = Math.sin(ang);
    fx += (tnx * ca - tny * sa) * WOBBLE_K;
    fy += (tnx * sa + tny * ca) * WOBBLE_K;

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

    // Obstacle repulsion from non-endpoint mushrooms. Uses quadratic
    // falloff so the force eases in rather than stepping on, and adds
    // a small perpendicular curl so the tip visibly CURVES AROUND
    // the blocker instead of bouncing off it (no sharp kinks).
    for (const [id, e] of entities) {
      if (id === f.originId || id === f.targetId) continue;
      const ex = f.tipX - e.x;
      const ey = f.tipY - e.y;
      const ed = Math.hypot(ex, ey) || 1;
      if (ed < BLOCKER_R) {
        const t = (BLOCKER_R - ed) / BLOCKER_R;
        const radial = BLOCKER_K * t * t;
        fx += (ex / ed) * radial;
        fy += (ey / ed) * radial;
        // Curl around the side matching the tip's current motion.
        const perpX = -ey / ed;
        const perpY = ex / ed;
        const side = f.tipVx * perpX + f.tipVy * perpY >= 0 ? 1 : -1;
        const curl = BLOCKER_K * t * 0.5;
        fx += perpX * curl * side;
        fy += perpY * curl * side;
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

    // Did we land? Mark reached but DO NOT snap the tip — let the
    // "reached" follow-logic below lerp it smoothly into place.
    const finalDx = target.x - f.tipX;
    const finalDy = target.y - f.tipY;
    const finalDist = Math.hypot(finalDx, finalDy);
    if (finalDist < REACH_DISTANCE) {
      f.reached = true;
      f.reachedAt = now;
      // Damp velocity hard so the tip doesn't overshoot while the
      // lerp pulls it to the silhouette edge.
      f.tipVx *= 0.25;
      f.tipVy *= 0.25;
    }
  } else {
    // After reach: gently ease the tip toward the target's silhouette
    // edge each frame. Lerp (not snap) so that the moment of landing
    // is a smooth curve, not an instant jump.
    const ex = f.tipX - target.x;
    const ey = f.tipY - target.y;
    const ed = Math.hypot(ex, ey) || 1;
    const desiredX = target.x + (ex / ed) * EDGE_RADIUS;
    const desiredY = target.y + (ey / ed) * EDGE_RADIUS;
    f.tipX += (desiredX - f.tipX) * 0.18;
    f.tipY += (desiredY - f.tipY) * 0.18;
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
