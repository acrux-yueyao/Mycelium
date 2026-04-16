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
  /** Stable id derived from sorted (a.id, b.id). */
  id: string;
  a: ConnectionEndpoint;
  b: ConnectionEndpoint;
  /** epoch ms when the connection first formed */
  bornAt: number;
  /** cached compat score so per-frame styling is cheap */
  compat: number;
}

function pairKey(a: string, b: string): string {
  return a < b ? `${a}__${b}` : `${b}__${a}`;
}

function snap(b: PhysBody): ConnectionEndpoint {
  return { id: b.id, charId: b.charId, x: b.x, y: b.y };
}

/**
 * Recompute the connection set from the current bodies. Existing pairs
 * keep their `bornAt`; only new pairs get a fresh timestamp.
 */
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
  color: string;
  width: number;
  opacity: number;
  dash?: string;
}

function hexToRgb(hex: string): [number, number, number] {
  const s = hex.replace('#', '');
  const n = parseInt(s, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex(r: number, g: number, b: number): string {
  const c = (v: number) =>
    Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

function blendColor(a: string, b: string, t: number): string {
  const [ar, ag, ab] = hexToRgb(a);
  const [br, bg, bb] = hexToRgb(b);
  return rgbToHex(ar + (br - ar) * t, ag + (bg - ag) * t, ab + (bb - ab) * t);
}

/**
 * Pick stroke color/width/opacity/dash for a connection based on its
 * compat score. Three bands:
 *   compat > 0.6  → warm (peach/amber), thick, solid
 *   0..0.6        → blend the two characters' main colors
 *   < 0           → cool muted blue-purple, dashed, low opacity
 */
export function tendrilStyle(c: Connection): TendrilStyle {
  if (c.compat < 0) {
    return { color: '#5a4a8a', width: 1.4, opacity: 0.32, dash: '5 7' };
  }
  if (c.compat > 0.6) {
    const t = (c.compat - 0.6) / 0.4;
    return {
      color: '#E89A5C',
      width: 2.0 + t * 1.2,
      opacity: 0.55 + t * 0.25,
    };
  }
  const mixed = blendColor(
    CHARACTERS[c.a.charId].color,
    CHARACTERS[c.b.charId].color,
    0.5,
  );
  return { color: mixed, width: 1.8, opacity: 0.42 };
}
