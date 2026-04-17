/**
 * TendrilLayer — organic hyphae grown between compatible entities.
 *
 * State-driven visual (matches connections.ts state machine):
 *   - growing    pathLength animates 0 → 1 (tendril grows out from A to B)
 *   - bonded     pathLength at 1; little sparkle nodes ride the path
 *   - retracting pathLength animates 1 → 0 (retreats back into the mushroom)
 *
 * Anchors sit on each entity's silhouette edge (not center). Path is an
 * organic cubic bezier with per-pair perpendicular sway so each tendril
 * has its own shape. Stroke is a linear gradient from A's char color
 * to B's char color.
 */
import { motion } from 'framer-motion';
import { tendrilStyle, type Connection } from '../core/connections';

export interface TendrilLayerProps {
  connections: Connection[];
}

export type EntityRef = Connection['a'];
export type { Connection };

const ANCHOR_RADIUS = 72;
const SWAY_MAX = 42;
const GROW_S = 0.7;       // matches GROW_MS / 1000 in connections.ts
const RETRACT_S = 0.65;   // matches RETRACT_MS / 1000

function hashId(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

type Pt = { x: number; y: number };

function bezierAt(t: number, p0: Pt, p1: Pt, p2: Pt, p3: Pt): Pt {
  const u = 1 - t;
  return {
    x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
    y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y,
  };
}

export function TendrilLayer({ connections }: TendrilLayerProps) {
  return (
    <svg className="overlay-layer" width="100%" height="100%" aria-hidden>
      <defs>
        {connections.map((c) => {
          const style = tendrilStyle(c);
          return (
            <linearGradient
              key={`grad-${c.id}`}
              id={`tendril-grad-${c.id}`}
              gradientUnits="userSpaceOnUse"
              x1={c.a.x}
              y1={c.a.y}
              x2={c.b.x}
              y2={c.b.y}
            >
              <stop offset="0%" stopColor={style.colorA} stopOpacity={0.95} />
              <stop offset="100%" stopColor={style.colorB} stopOpacity={0.95} />
            </linearGradient>
          );
        })}
      </defs>

      {connections.map((c) => {
        const dx = c.b.x - c.a.x;
        const dy = c.b.y - c.a.y;
        const d = Math.hypot(dx, dy) || 1;
        const nx = dx / d;
        const ny = dy / d;
        const px = -ny;
        const py = nx;

        const ax = c.a.x + nx * ANCHOR_RADIUS;
        const ay = c.a.y + ny * ANCHOR_RADIUS;
        const bx = c.b.x - nx * ANCHOR_RADIUS;
        const by = c.b.y - ny * ANCHOR_RADIUS;

        const seed = hashId(c.id);
        const sign = seed & 1 ? 1 : -1;
        const sway1 = 18 + (seed % SWAY_MAX);
        const sway2 = 12 + ((seed >> 4) % SWAY_MAX);
        const signLate = (seed >> 2) & 1 ? sign : -sign;

        const p0: Pt = { x: ax, y: ay };
        const p3: Pt = { x: bx, y: by };
        const p1: Pt = {
          x: ax + (bx - ax) * 0.28 + px * sway1 * sign,
          y: ay + (by - ay) * 0.28 + py * sway1 * sign,
        };
        const p2: Pt = {
          x: ax + (bx - ax) * 0.72 + px * sway2 * signLate,
          y: ay + (by - ay) * 0.72 + py * sway2 * signLate,
        };

        const pathD = `M ${p0.x} ${p0.y} C ${p1.x} ${p1.y}, ${p2.x} ${p2.y}, ${p3.x} ${p3.y}`;
        const style = tendrilStyle(c);
        const solid = !style.dash;

        // pathLength animation targets per state. Starts as 0 for the first
        // render; springs to 1 during 'growing'; stays 1 in 'bonded'; drops
        // back to 0 during 'retracting'.
        const targetLen = c.state === 'retracting' ? 0 : 1;
        const animDuration =
          c.state === 'growing' ? GROW_S
          : c.state === 'retracting' ? RETRACT_S
          : 0.2;

        // Sparkle nodes only while bonded (fade out on retract; absent while growing).
        const showNodes = solid && c.state === 'bonded';
        const n1 = bezierAt(0.33, p0, p1, p2, p3);
        const n2 = bezierAt(0.67, p0, p1, p2, p3);
        const nodeR = Math.max(1.8, style.width * 0.9);

        return (
          <g key={c.id}>
            <motion.path
              d={pathD}
              stroke={`url(#tendril-grad-${c.id})`}
              strokeWidth={style.width}
              strokeOpacity={style.opacity}
              strokeDasharray={style.dash}
              strokeLinecap="round"
              fill="none"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: targetLen }}
              transition={{ duration: animDuration, ease: 'easeInOut' }}
            />
            <motion.circle
              cx={n1.x}
              cy={n1.y}
              r={nodeR}
              fill={style.colorA}
              initial={{ opacity: 0 }}
              animate={{ opacity: showNodes ? style.opacity : 0 }}
              transition={{ duration: 0.5 }}
            />
            <motion.circle
              cx={n2.x}
              cy={n2.y}
              r={nodeR}
              fill={style.colorB}
              initial={{ opacity: 0 }}
              animate={{ opacity: showNodes ? style.opacity : 0 }}
              transition={{ duration: 0.5 }}
            />
          </g>
        );
      })}
    </svg>
  );
}
