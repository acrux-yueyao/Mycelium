/**
 * Connections — pair tracking, lifecycle state machine, and tendril styling.
 *
 * Lifecycle (so pairs don't stay magnetically latched forever):
 *
 *   (not connected) → growing → bonded → retracting → (cooldown) → ...
 *
 *   growing     first GROW_MS after forming. Tendril grows in (pathLength 0→1).
 *   bonded      the "together" phase. Length is rolled per-compat at formation
 *               (higher compat → longer). Ends when maxLifeMs elapses OR
 *               distance grows past DISCONNECT_RANGE.
 *   retracting  RETRACT_MS of tendril shrinking back. Entity pair is still in
 *               the map so the visual can animate out, but no longer counts as
 *               "an active bond" for infection gating.
 *   cooldown    after a connection fully dissolves, the pair can't re-form
 *               for ~COOLDOWN_BASE_MS ± jitter. Lets them drift past each
 *               other once or twice before re-engaging.
 *
 * Each tick stepConnections also snapshots (a, b) positions from the live
 * bodies so TendrilLayer can render bezier paths following the current
 * entity positions.
 */
import { compatibility, CHARACTERS, type CharId } from '../data/characters';
import type { PhysBody } from './field';

const CONNECT_RANGE = 240;
const DISCONNECT_RANGE = 320;

const GROW_MS = 3500;
const RETRACT_MS = 2200;
// Bonded duration: shorter for repels, longer for kindred spirits.
// Add ±20% jitter per-connection so pairs don't snap in lockstep.
const BONDED_MIN_MS = 5500;
const BONDED_COMPAT_BONUS_MS = 4500;
const LIFETIME_JITTER = 0.2;
// Cooldown window that blocks the same pair from reconnecting.
// After a connection fully retracts, that pair goes "free" for this
// long — no mutual attraction, no reconnection. Lets mushrooms drift
// freely after meeting someone instead of clumping right back.
const COOLDOWN_BASE_MS = 12000;
const COOLDOWN_JITTER_MS = 6000;
// If a bonded pair is pulled past this factor of its rest length,
// the tendril gives up and transitions to retracting — so the body
// is never dragged around while still latched.
const STRETCH_RETRACT_FACTOR = 1.55;

export type ConnState = 'growing' | 'bonded' | 'retracting';

export interface ConnectionEndpoint {
  id: string;
  charId: CharId;
  x: number;
  y: number;
}

export interface Connection {
  id: string;
  a: ConnectionEndpoint;
  b: ConnectionEndpoint;
  bornAt: number;
  compat: number;
  maxLifeMs: number;
  state: ConnState;
  /** wall-clock ms when retract began (set on transition). */
  retractStart?: number;
  /** Distance between bodies captured at growing→bonded transition.
   *  Acts as the spring rest length in stepField, and as the threshold
   *  for stretch-triggered retract. Undefined while growing. */
  restLength?: number;
  /** Mother-tree support connection — injected directly by App.tsx
   *  when an isolated entity is near an aged mother tree. Styled
   *  warmer, lives longer, tolerates more stretch. */
  isSupport?: boolean;
  /** Per-connection override for the stretch-retract threshold.
   *  Defaults to STRETCH_RETRACT_FACTOR = 1.55. Support connections
   *  use a higher value so they don't snap under normal movement. */
  stretchFactor?: number;
  /** Number of parallel tendrils to render for this bond. Derived
   *  from the two bodies' morphology.tendrilCount at creation time
   *  (clamped to 1..4 — purely a visual density knob, not physics).
   *  Default 1 when neither body carries morphology. */
  tendrilCount?: number;
}

export function pairKey(a: string, b: string): string {
  return a < b ? `${a}__${b}` : `${b}__${a}`;
}

function snap(b: PhysBody): ConnectionEndpoint {
  return { id: b.id, charId: b.charId, x: b.x, y: b.y };
}

function rollLifetime(compat: number): number {
  const base = BONDED_MIN_MS + Math.max(0, compat) * BONDED_COMPAT_BONUS_MS;
  const jitter = 1 + (Math.random() * 2 - 1) * LIFETIME_JITTER;
  return base * jitter;
}

function rollCooldown(): number {
  return COOLDOWN_BASE_MS + Math.random() * COOLDOWN_JITTER_MS;
}

/**
 * Step the connection map forward one frame.
 *  - bodies:    current entity positions
 *  - prev:      last frame's connection map
 *  - cooldowns: pair-key → wall-clock ms until which reconnection is blocked.
 *               This map is mutated in place when retract finishes.
 *  - now:       performance.now()
 */
export function stepConnections(
  bodies: PhysBody[],
  prev: Map<string, Connection>,
  cooldowns: Map<string, number>,
  now: number,
): Map<string, Connection> {
  const next = new Map<string, Connection>();

  // First: advance existing connections' states. Keep retracting ones around
  // until their RETRACT_MS elapses, so the tendril can animate out.
  for (const [key, c] of prev) {
    const a = bodies.find((b) => b.id === c.a.id);
    const b = bodies.find((bd) => bd.id === c.b.id);
    if (!a || !b) continue;                                // entity gone
    const d = Math.hypot(a.x - b.x, a.y - b.y);

    // Advance state.
    let state = c.state;
    let retractStart = c.retractStart;
    let restLength = c.restLength;

    if (state === 'growing') {
      if (now - c.bornAt >= GROW_MS) {
        state = 'bonded';
        // Capture the separation at bonded entry as the spring rest length.
        // stepField uses this to apply an inward pull if the bodies try to
        // drift apart further, and connections.ts uses it to trigger a
        // stretch-retract if stretched too hard.
        restLength = d;
      }
    }
    if (state === 'bonded') {
      const aged = now - c.bornAt - GROW_MS;
      const tooFar = d > DISCONNECT_RANGE;
      const timeout = aged >= c.maxLifeMs;
      // Stretch-triggered retract: if the body is pulled hard enough to
      // exceed stretchFactor × restLength, the tendril gives up and
      // starts retracting so the body can move. This is the "先松开，
      // 再移动" behavior. Support connections override stretchFactor
      // so they tolerate more motion before giving up.
      const factor = c.stretchFactor ?? STRETCH_RETRACT_FACTOR;
      const stretched =
        restLength != null && d > restLength * factor;
      if (tooFar || timeout || stretched) {
        state = 'retracting';
        retractStart = now;
      }
    }
    if (state === 'retracting') {
      if (retractStart != null && now - retractStart >= RETRACT_MS) {
        // Fully dissolved → write cooldown, drop from map.
        cooldowns.set(key, now + rollCooldown());
        continue;
      }
    }

    next.set(key, {
      ...c,
      a: snap(a),
      b: snap(b),
      state,
      retractStart,
      restLength,
    });
  }

  // Then: form new connections on pairs newly inside CONNECT_RANGE,
  // respecting per-pair cooldown.
  for (let i = 0; i < bodies.length; i++) {
    for (let j = i + 1; j < bodies.length; j++) {
      const a = bodies[i];
      const b = bodies[j];
      const key = pairKey(a.id, b.id);
      if (next.has(key)) continue;                         // already live
      const cooldownUntil = cooldowns.get(key);
      if (cooldownUntil != null) {
        if (now < cooldownUntil) continue;                 // still resting
        cooldowns.delete(key);
      }
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (d >= CONNECT_RANGE) continue;

      const compat = compatibility(a.charId, b.charId);
      // How many parallel tendrils to render. Only creatures with
      // a morphology reading contribute; others count as 1. Cap at
      // 4 so a pair of very-branchy mushrooms doesn't swamp the
      // layer with 10 overlapping ribbons. Mapped from raw 3..10
      // morphology value down to 1..4 visible tendrils.
      const rawMax = Math.max(a.tendrilCount ?? 1, b.tendrilCount ?? 1);
      const tendrilCount = rawMax <= 1
        ? 1
        : Math.max(1, Math.min(4, Math.round(1 + (rawMax - 3) * 0.5)));
      next.set(key, {
        id: key,
        a: snap(a),
        b: snap(b),
        bornAt: now,
        compat,
        maxLifeMs: rollLifetime(compat),
        state: 'growing',
        tendrilCount,
      });
    }
  }

  // GC stale cooldown entries for pairs that no longer exist as bodies.
  const liveIds = new Set(bodies.map((b) => b.id));
  for (const key of cooldowns.keys()) {
    const [x, y] = key.split('__');
    if (!liveIds.has(x) || !liveIds.has(y)) cooldowns.delete(key);
  }

  return next;
}

/** A pair is "actively bonded" only during growing or bonded states.
 *  Infection gating should treat retracting connections as over. */
export function isActive(c: Connection): boolean {
  return c.state !== 'retracting';
}

// === Tendril styling ===

export interface TendrilStyle {
  colorA: string;
  colorB: string;
  width: number;
  opacity: number;
  dash?: string;
}

// Warm ember tones for mother-tree support tendrils. Used as an
// overlay on the pair colors so the support connection reads as
// warmer and more stable than a regular organic bond, without being
// flashy or different-looking enough to scream "special".
const SUPPORT_WARM_A = '#E8B98E';
const SUPPORT_WARM_B = '#D9A270';

/** Blend two hex colors (accepts #RRGGBB) by t (0 = c1, 1 = c2). */
function mixColor(c1: string, c2: string, t: number): string {
  const h = (s: string) => [
    parseInt(s.slice(1, 3), 16),
    parseInt(s.slice(3, 5), 16),
    parseInt(s.slice(5, 7), 16),
  ];
  const [r1, g1, b1] = h(c1);
  const [r2, g2, b2] = h(c2);
  const mix = (a: number, b: number) => Math.round(a + (b - a) * t);
  const hex = (n: number) => n.toString(16).padStart(2, '0');
  return `#${hex(mix(r1, r2))}${hex(mix(g1, g2))}${hex(mix(b1, b2))}`;
}

export function tendrilStyle(c: Connection): TendrilStyle {
  // Mother-tree support: warm ember gradient that softly biases
  // toward the pair's own colors, thicker and higher-opacity than
  // baseline so it reads as "stable presence".
  if (c.isSupport) {
    const baseA = CHARACTERS[c.a.charId].color;
    const baseB = CHARACTERS[c.b.charId].color;
    return {
      colorA: mixColor(baseA, SUPPORT_WARM_A, 0.65),
      colorB: mixColor(baseB, SUPPORT_WARM_B, 0.65),
      width: 2.6,
      opacity: 0.78,
    };
  }
  const colorA = CHARACTERS[c.a.charId].color;
  const colorB = CHARACTERS[c.b.charId].color;
  if (c.compat < 0) {
    return { colorA, colorB, width: 1.3, opacity: 0.3, dash: '5 7' };
  }
  if (c.compat > 0.6) {
    const t = (c.compat - 0.6) / 0.4;
    return {
      colorA,
      colorB,
      width: 2.2 + t * 1.3,
      opacity: 0.6 + t * 0.2,
    };
  }
  return { colorA, colorB, width: 1.8, opacity: 0.48 };
}
