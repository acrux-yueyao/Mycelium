/**
 * TendrilLayer — organic hyphae with tapered main line + short side
 * branches tipped with tiny glow dots. Matches the hand-drawn
 * community.png reference: soft, uneven, alive.
 *
 * Implementation:
 *   - Each connection renders a FILLED bezier ribbon, built by sampling
 *     the cubic bezier and offsetting each sample perpendicular by a
 *     per-t width. The main line has a gentle spindle profile (wider
 *     at the mushroom ends, slightly thinner in the middle); branches
 *     taper from the base toward a thin tip.
 *   - 1–3 small branches sprout off the main line at seeded positions.
 *     Each branch ends in a small glow dot.
 *   - Grow/retract: a WHITE stroked <path> (with pathLength animating
 *     0→1 on growing / 1→0 on retracting) is used as a MASK. The
 *     ribbon becomes visible in sync with the animated "drawing"
 *     along the mask's stroke. Staggered delays so branches sprout
 *     AFTER the main line reaches them.
 *   - Negative-compat pairs (the ones that don't quite fit) get a
 *     thin dashed stroked line instead — no branches, no tips.
 */
import { motion } from 'framer-motion';
import { tendrilStyle, type Connection } from '../core/connections';

export interface TendrilLayerProps {
  connections: Connection[];
}

const ANCHOR_RADIUS = 72;   // silhouette edge of a 180px sprite
const SWAY_MAX = 42;

// Timing (keep in sync with connections.ts GROW_MS / RETRACT_MS).
const GROW_S = 2.4;
const RETRACT_S = 1.4;

// Mask stroke width — must exceed the widest ribbon point so nothing
// gets clipped off the sides during grow.
const MASK_STROKE = 48;

// === Organic growth profile ===
//
// Instead of linear pathLength 0→1, the growth tip advances with
// hesitation: slow sprout, mid-flight pauses, tiny pullbacks (as if
// the tip is re-aiming), then cautious deceleration into contact.
// Keyframes were hand-tuned to feel like slime-mold exploration
// rather than a UI loading bar.
const GROW_TIMES =  [0,   0.08, 0.15, 0.30, 0.38, 0.50, 0.58, 0.70, 0.78, 0.88, 0.95, 1.0];
const GROW_VALUES = [0,   0.03, 0.05, 0.20, 0.18, 0.42, 0.40, 0.65, 0.70, 0.85, 0.95, 1.0];

// Retract: a small surprise pullback, then gather gently back to 0.
const RETRACT_TIMES =  [0,   0.12, 0.22, 0.40, 0.60, 0.82, 1.0];
const RETRACT_VALUES = [1.0, 0.92, 0.90, 0.60, 0.35, 0.10, 0.0];

type Pt = { x: number; y: number };
interface BezierPts {
  p0: Pt;
  p1: Pt;
  p2: Pt;
  p3: Pt;
}

function hashId(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function bezierAt(t: number, p0: Pt, p1: Pt, p2: Pt, p3: Pt): Pt {
  const u = 1 - t;
  return {
    x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
    y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y,
  };
}

function bezierTangent(t: number, p0: Pt, p1: Pt, p2: Pt, p3: Pt): Pt {
  const u = 1 - t;
  return {
    x: 3 * u * u * (p1.x - p0.x) + 6 * u * t * (p2.x - p1.x) + 3 * t * t * (p3.x - p2.x),
    y: 3 * u * u * (p1.y - p0.y) + 6 * u * t * (p2.y - p1.y) + 3 * t * t * (p3.y - p2.y),
  };
}

function bezierD(b: BezierPts): string {
  return `M ${b.p0.x} ${b.p0.y} C ${b.p1.x} ${b.p1.y}, ${b.p2.x} ${b.p2.y}, ${b.p3.x} ${b.p3.y}`;
}

// Build a filled tapered ribbon along a cubic bezier. `widthAt(t)` gives
// the total width (not half-width) at parameter t.
function ribbonD(b: BezierPts, widthAt: (t: number) => number, samples = 30): string {
  const fwd: string[] = [];
  const back: string[] = [];
  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    const pt = bezierAt(t, b.p0, b.p1, b.p2, b.p3);
    const tan = bezierTangent(t, b.p0, b.p1, b.p2, b.p3);
    const tl = Math.hypot(tan.x, tan.y) || 1;
    const nx = -tan.y / tl;
    const ny = tan.x / tl;
    const w = widthAt(t) / 2;
    fwd.push(`${(pt.x + nx * w).toFixed(1)},${(pt.y + ny * w).toFixed(1)}`);
    back.unshift(`${(pt.x - nx * w).toFixed(1)},${(pt.y - ny * w).toFixed(1)}`);
  }
  const fp = fwd.map((p, i) => (i === 0 ? `M ${p}` : `L ${p}`)).join(' ');
  const bp = back.map((p) => `L ${p}`).join(' ');
  return `${fp} ${bp} Z`;
}

// Spindle profile: wider at both ends, slightly thinner in the middle.
// shape ranges ~0.65 at t=0.5 up to 1.0 at the anchors.
function mainWidth(max: number, t: number): number {
  const bell = 1 - 0.35 * Math.sin(Math.PI * t);
  return max * bell;
}

// Branch taper: thickest at the root (t=0), thinning to ~15% at the tip.
function branchWidth(max: number, t: number): number {
  return max * (1 - 0.85 * t);
}

interface BranchSpec {
  bez: BezierPts;
  tip: Pt;
  baseWidth: number;
  growDelay: number;  // seconds into the grow phase before this branch appears
  growDuration: number;
}

function makeBranch(
  main: BezierPts,
  tBase: number,
  side: 1 | -1,
  length: number,
  bend: number,
  curl: number,
): { bez: BezierPts; tip: Pt } {
  const base = bezierAt(tBase, main.p0, main.p1, main.p2, main.p3);
  const tan = bezierTangent(tBase, main.p0, main.p1, main.p2, main.p3);
  const tl = Math.hypot(tan.x, tan.y) || 1;
  const tx = tan.x / tl;
  const ty = tan.y / tl;
  const nx = -ty * side;
  const ny = tx * side;
  // Tip pulls out perpendicular + a bit along the tangent direction
  // so it sweeps forward rather than popping straight out.
  const tip: Pt = {
    x: base.x + nx * length * 0.95 + tx * length * curl,
    y: base.y + ny * length * 0.95 + ty * length * curl,
  };
  const p1: Pt = {
    x: base.x + nx * length * 0.25 + tx * length * bend * 0.3,
    y: base.y + ny * length * 0.25 + ty * length * bend * 0.3,
  };
  const p2: Pt = {
    x: tip.x - nx * length * 0.12 + tx * length * bend * 0.2,
    y: tip.y - ny * length * 0.12 + ty * length * bend * 0.2,
  };
  return { bez: { p0: base, p1, p2, p3: tip }, tip };
}

// Given a target pathLength value, find the approximate wall-clock
// fraction of GROW_S at which the hesitation profile first reaches it.
// Used so each branch sprouts exactly when the main tip passes it.
function timeToReach(lengthTarget: number): number {
  for (let i = 1; i < GROW_VALUES.length; i++) {
    if (GROW_VALUES[i] >= lengthTarget) {
      const prevV = GROW_VALUES[i - 1];
      const prevT = GROW_TIMES[i - 1];
      const dV = GROW_VALUES[i] - prevV;
      const dT = GROW_TIMES[i] - prevT;
      if (dV <= 0) return prevT;
      return prevT + dT * ((lengthTarget - prevV) / dV);
    }
  }
  return 1;
}

function pickBranches(main: BezierPts, seed: number, maxWidth: number, compat: number): BranchSpec[] {
  // No branches for negative-compat (reluctant) links, and only a few
  // for middling compat. High compat gets more.
  const count = compat < 0 ? 0 : compat > 0.6 ? 3 : compat > 0.3 ? 2 : 1;
  const spots = [0.28, 0.55, 0.78];
  const result: BranchSpec[] = [];
  for (let i = 0; i < count; i++) {
    const tBase = spots[i] + ((seed >> (i * 3)) & 0x7) / 70 - 0.05;
    const side: 1 | -1 = (seed >> (i * 2 + 1)) & 1 ? 1 : -1;
    const length = 28 + ((seed >> (i * 4 + 2)) & 0xf) * 1.4;
    const bend = 0.4 + ((seed >> (i * 3 + 1)) & 0x7) / 12;
    const curl = 0.08 + ((seed >> (i * 5 + 3)) & 0x7) / 40;
    const { bez, tip } = makeBranch(main, tBase, side, length, bend, curl);
    const baseWidth = mainWidth(maxWidth, tBase) * 0.55;
    // Branch starts growing exactly when the main tip first reaches
    // its base (slightly before, for visual overlap). Its own growth
    // is slow and hesitant but shorter than the main line.
    const growDelay = GROW_S * Math.max(0, timeToReach(tBase) - 0.04);
    const growDuration = GROW_S * 0.35;
    result.push({ bez, tip, baseWidth, growDelay, growDuration });
  }
  return result;
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

        const main: BezierPts = {
          p0: { x: ax, y: ay },
          p1: {
            x: ax + (bx - ax) * 0.28 + px * sway1 * sign,
            y: ay + (by - ay) * 0.28 + py * sway1 * sign,
          },
          p2: {
            x: ax + (bx - ax) * 0.72 + px * sway2 * signLate,
            y: ay + (by - ay) * 0.72 + py * sway2 * signLate,
          },
          p3: { x: bx, y: by },
        };

        const style = tendrilStyle(c);
        const isNegative = c.compat < 0;

        // State-driven animation: keyframe hesitation profile on grow,
        // gentler keyframe pullback on retract, static otherwise.
        const growing = c.state === 'growing';
        const retracting = c.state === 'retracting';
        const mainAnim = growing
          ? { pathLength: GROW_VALUES }
          : retracting
            ? { pathLength: RETRACT_VALUES }
            : { pathLength: 1 };
        const mainTrans = growing
          ? { duration: GROW_S, times: GROW_TIMES, ease: 'easeInOut' as const }
          : retracting
            ? { duration: RETRACT_S, times: RETRACT_TIMES, ease: 'easeInOut' as const }
            : { duration: 0.2 };

        const showDots = c.state === 'bonded' || c.state === 'growing';

        // --- Negative compat: simple wispy dashed stroke, no branches ---
        if (isNegative) {
          return (
            <g key={c.id}>
              <motion.path
                d={bezierD(main)}
                stroke={`url(#tendril-grad-${c.id})`}
                strokeWidth={style.width}
                strokeOpacity={style.opacity}
                strokeDasharray={style.dash}
                strokeLinecap="round"
                fill="none"
                initial={{ pathLength: 0 }}
                animate={mainAnim}
                transition={mainTrans}
              />
            </g>
          );
        }

        // --- Positive compat: tapered filled ribbon + side branches ---
        const mainMaxW = style.width * 1.9;
        const branches = pickBranches(main, seed, mainMaxW, c.compat);
        const ribbonMain = ribbonD(main, (t) => mainWidth(mainMaxW, t));

        return (
          <g key={c.id}>
            <defs>
              <mask id={`reveal-${c.id}`} maskUnits="userSpaceOnUse">
                <rect
                  x={Math.min(ax, bx) - 120}
                  y={Math.min(ay, by) - 120}
                  width={Math.abs(bx - ax) + 240}
                  height={Math.abs(by - ay) + 240}
                  fill="black"
                />
                {/* Main-line reveal with hesitation profile */}
                <motion.path
                  d={bezierD(main)}
                  stroke="white"
                  strokeWidth={MASK_STROKE}
                  strokeLinecap="round"
                  fill="none"
                  initial={{ pathLength: 0 }}
                  animate={mainAnim}
                  transition={mainTrans}
                />
                {/* Each branch's reveal. Branches sprout when the main
                    tip actually reaches their base (computed from
                    timeToReach). Each uses a gentle linear grow so
                    the compound result feels layered and organic. */}
                {branches.map((br, i) => (
                  <motion.path
                    key={`brmask-${i}`}
                    d={bezierD(br.bez)}
                    stroke="white"
                    strokeWidth={MASK_STROKE * 0.55}
                    strokeLinecap="round"
                    fill="none"
                    initial={{ pathLength: 0 }}
                    animate={{ pathLength: retracting ? 0 : 1 }}
                    transition={
                      growing
                        ? { duration: br.growDuration, delay: br.growDelay, ease: [0.22, 0.65, 0.32, 1.0] }
                        : retracting
                          ? { duration: RETRACT_S * 0.7, ease: 'easeIn' }
                          : { duration: 0.2 }
                    }
                  />
                ))}
              </mask>
            </defs>

            <g mask={`url(#reveal-${c.id})`} opacity={style.opacity}>
              <path d={ribbonMain} fill={`url(#tendril-grad-${c.id})`} />
              {branches.map((br, i) => (
                <path
                  key={`br-${i}`}
                  d={ribbonD(br.bez, (t) => branchWidth(br.baseWidth, t))}
                  fill={`url(#tendril-grad-${c.id})`}
                />
              ))}
            </g>

            {/* Tiny glow dots at each branch tip. Fade in when the
                branch's growth is nearly complete; gentle breathing
                while bonded. */}
            {branches.map((br, i) => {
              const tipColor = i % 2 === 0 ? style.colorA : style.colorB;
              const dotDelay = growing
                ? br.growDelay + br.growDuration * 0.85
                : 0;
              return (
                <motion.circle
                  key={`tip-${i}`}
                  cx={br.tip.x}
                  cy={br.tip.y}
                  r={2.4}
                  fill={tipColor}
                  initial={{ opacity: 0, scale: 0.3 }}
                  animate={{
                    opacity: showDots ? style.opacity : 0,
                    scale: showDots ? [0.3, 1.15, 1] : 0.3,
                  }}
                  transition={{
                    duration: 0.6,
                    delay: dotDelay,
                    ease: 'easeOut',
                  }}
                />
              );
            })}
          </g>
        );
      })}
    </svg>
  );
}
