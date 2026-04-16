/**
 * Connections — pair tracking and tendril styling.
 *
 * Two entities form a Connection when their distance falls below
 * CONNECT_RANGE. The connection survives until the distance exceeds
 * DISCONNECT_RANGE (hysteresis prevents flicker on the boundary).
 *
 * Each connection caches its compatibility score (looked up once on
 * formation) and bornAt time. The tendril layer uses these to color
 * and animate the visual link.
 *
 * Loneliness exposure: any connection where one side is char5 (lonely)
 * accrues "lonely seconds" on the other side, gradually desaturating
 * its sprite via CSS filter (handled in App.tsx).
 */
import { compatibility, CHARACTERS, type CharId } from '../data/characters';
import type { PhysBody } from './field';

const CONNECT_RANGE = 240;
const DISCONNECT_RANGE = 320;

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
}

function pairKey(a: string, b: string): string {
  return a < b ? `${a}__${b}` : `${b}__${a}`;
}

function snap(b: PhysBody): ConnectionEndpoint {
  return { id: b.id, charId: b.charId, x: b.x, y: b.y };
}

export function stepConnections(
  bodies: PhysBody[],
  prev: Map<string, Connection>,
  now: number,
): Map<string, Connection> {
  const next = new Map<string, Connection>();

  for (let i = 0; i < bodies.length; i++) {
    for (let j = i + 1; j < bodies.length; j++) {
      const a = bodies[i];
      const b = bodies[j];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const key = pairKey(a.id, b.id);
      const existing = prev.get(key);

      if (existing) {
        if (d < DISCONNECT_RANGE) {
          next.set(key, {
            ...existing,
            a: snap(a),
            b: snap(b),
          });
        }
      } else if (d < CONNECT_RANGE) {
        next.set(key, {
          id: key,
          a: snap(a),
          b: snap(b),
          bornAt: now,
          compat: compatibility(a.charId, b.charId),
        });
      }
    }
  }
  return next;
}

// === Tendril styling ===

export interface TendrilStyle {
  /** Gradient stop color near endpoint a (sampled from a's character color). */
  colorA: string;
  /** Gradient stop color near endpoint b. */
  colorB: string;
  width: number;
  opacity: number;
  /** SVG stroke-dasharray; undefined = solid. Only negative compat dashes. */
  dash?: string;
}

/**
 * Tendril colors come from the two characters themselves — a gradient
 * from a's color to b's color. Compat drives width / opacity / dash:
 *   compat > 0.6  → thick, bright, solid
 *   0..0.6        → medium, translucent, solid
 *   < 0           → thin, dim, dashed
 * No more warm-amber / cool-indigo overrides — the tendril must visibly
 * belong to the two mushrooms it connects.
 */
export function tendrilStyle(c: Connection): TendrilStyle {
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
