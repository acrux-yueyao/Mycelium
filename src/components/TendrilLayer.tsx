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
import { probePhase, type ExplorationProbe } from '../core/probes';
import { CHARACTERS, type CharId } from '../data/characters';

export interface TendrilLayerProps {
  connections: Connection[];
  /** Exploratory probes (V2a — mushrooms always searching). */
  probes?: ExplorationProbe[];
  /** Entity positions keyed by id, so probes can track their origin. */
  entityById?: Map<string, { x: number; y: number; charId: CharId }>;
}

// Linearly interpolate a value-vs-time keyframe sequence at t in [0, 1].
function interpKeyframes(t: number, times: number[], values: number[]): number {
  if (t <= times[0]) return values[0];
  const last = times.length - 1;
  if (t >= times[last]) return values[last];
  for (let i = 1; i < times.length; i++) {
    if (t <= times[i]) {
      const dt = times[i] - times[i - 1];
      const dv = values[i] - values[i - 1];
      return values[i - 1] + dv * ((t - times[i - 1]) / dt);
    }
  }
  return values[last];
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

// === Dynamic width over time ===
//
// The tendril's thickness is NOT a static taper. Each path sample has
// an age — the wall-clock time since the growth tip first reached it.
// Fresh points are thin (like a fiber just extruded). As time passes,
// they fill out toward their mature width. During bonded the whole
// structure keeps breathing subtly. During retract everything thins.
const MATURE_S = 2.2;             // time for a newly-reached point to fully thicken
const INITIAL_WIDTH_FRAC = 0.12;  // fresh-tip width as fraction of mature
const BREATHE_AMP = 0.07;         // bonded breathing amplitude
const BREATHE_PERIOD_S = 3.5;

// Spindle shape for the main line: wider at both anchors, slightly
// thinner in the middle. Returns a 0..1 multiplier.
function mainSpindle(t: number): number {
  return 1 - 0.35 * Math.sin(Math.PI * t);
}

// Branch taper: thickest at the root, thinning toward the tip.
function branchTaper(t: number): number {
  return 1 - 0.85 * t;
}

// Mature main width (what the line looks like once fully grown,
// ignoring time). Used by pickBranches to size branch bases.
function mainWidth(max: number, t: number): number {
  return max * mainSpindle(t);
}

// What fraction of the mature width should a point at (t, elapsedS) have?
// Origin points reach maturity first; tip points catch up over MATURE_S
// after the growth tip passes them.
function growthFraction(t: number, elapsedS: number): number {
  const arriveS = GROW_S * timeToReach(t);
  const age = elapsedS - arriveS;
  if (age <= 0) return INITIAL_WIDTH_FRAC;
  const maturity = Math.min(1, age / MATURE_S);
  return INITIAL_WIDTH_FRAC + (1 - INITIAL_WIDTH_FRAC) * maturity;
}

// Dynamic width for the main line at position t given elapsed wall-clock.
function dynamicMainWidth(t: number, elapsedS: number, max: number): number {
  return max * mainSpindle(t) * growthFraction(t, elapsedS);
}

// Dynamic width for a branch. A branch has its own birth time
// (branchElapsedS = elapsedS - growDelay), so we apply growthFraction
// using the branch's own internal time and pathLength.
function dynamicBranchWidth(t: number, branchElapsedS: number, branchDurS: number, max: number): number {
  // For branches, approximate: the tip is reached at t=branchElapsedS/branchDurS
  // of the way through. A point at position t is "reached" at
  // branchDurS * t — so age = branchElapsedS - branchDurS * t.
  const arriveS = branchDurS * t;
  const age = branchElapsedS - arriveS;
  let frac: number;
  if (age <= 0) frac = INITIAL_WIDTH_FRAC;
  else {
    const maturity = Math.min(1, age / MATURE_S);
    frac = INITIAL_WIDTH_FRAC + (1 - INITIAL_WIDTH_FRAC) * maturity;
  }
  return max * branchTaper(t) * frac;
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

// === Filament bundle ===
//
// A connection renders as a BUNDLE of filaments, not a single bezier:
//   - 1 primary "chosen" path — most direct, grows to full width, stays
//     breathing during bonded, carries the branches + tip dots.
//   - 2 probe filaments — more swayed curvatures, fan out to alternate
//     sides, grow to ~25–35% width, then slowly fade during bonded
//     (the path was "not selected" and withers away).
// The bundle reads as multiple exploratory fibers with one becoming
// reinforced, rather than a single UI line being drawn.

interface FilamentSpec {
  id: string;
  bez: BezierPts;
  role: 'primary' | 'probe';
  /** Seconds after connection bornAt before this filament starts growing. */
  growDelay: number;
  /** Mature width ceiling for this filament (mix of taper × this cap). */
  maxWidth: number;
  /** Relative growth speed (1.0 = primary; 0.5 = probes take twice as long). */
  growSpeedFactor: number;
  /** Only for probes: how long into bonded before this probe starts to
   *  thin out, and over how many seconds it fades to zero. */
  decayStartS?: number;
  decayDurationS?: number;
}

/** Circular obstacle the bezier should steer around. */
interface Blocker {
  x: number;
  y: number;
  r: number;
}

/** Does this bezier stay clear of every blocker? */
function bezierClear(bez: BezierPts, blockers: Blocker[], samples = 16): boolean {
  for (let i = 1; i < samples; i++) {    // skip t=0 and t=1 (endpoints)
    const t = i / samples;
    const pt = bezierAt(t, bez.p0, bez.p1, bez.p2, bez.p3);
    for (const b of blockers) {
      if (Math.hypot(pt.x - b.x, pt.y - b.y) < b.r) return false;
    }
  }
  return true;
}

/** Build a bezier given endpoint + sway amounts + signs, then try
 *  alternative (sign / magnitude) combinations until the path clears
 *  all blockers. Falls back to the last combination attempted. */
function routeBezier(
  a: { x: number; y: number },
  b: { x: number; y: number },
  px: number, py: number,
  baseSway1: number, baseSway2: number,
  initialSign: 1 | -1,
  initialSignLate: 1 | -1,
  blockers: Blocker[],
): BezierPts {
  const make = (sign: 1 | -1, signLate: 1 | -1, mul: number): BezierPts => ({
    p0: { x: a.x, y: a.y },
    p1: {
      x: a.x + (b.x - a.x) * 0.28 + px * baseSway1 * mul * sign,
      y: a.y + (b.y - a.y) * 0.28 + py * baseSway1 * mul * sign,
    },
    p2: {
      x: a.x + (b.x - a.x) * 0.72 + px * baseSway2 * mul * signLate,
      y: a.y + (b.y - a.y) * 0.72 + py * baseSway2 * mul * signLate,
    },
    p3: { x: b.x, y: b.y },
  });

  // Try the caller's preferred curve first, then progressively larger
  // sways on both sides. First candidate that clears wins.
  const candidates: Array<[1 | -1, 1 | -1, number]> = [
    [initialSign, initialSignLate, 1.0],
    [-initialSign as 1 | -1, -initialSignLate as 1 | -1, 1.0],
    [initialSign, initialSignLate, 1.7],
    [-initialSign as 1 | -1, -initialSignLate as 1 | -1, 1.7],
    [initialSign, initialSignLate, 2.6],
    [-initialSign as 1 | -1, -initialSignLate as 1 | -1, 2.6],
    [initialSign, initialSignLate, 3.8],
  ];
  let last: BezierPts | null = null;
  for (const [s, sl, mul] of candidates) {
    const bez = make(s, sl, mul);
    last = bez;
    if (blockers.length === 0 || bezierClear(bez, blockers)) return bez;
  }
  // No clean route found; return the widest attempt.
  return last!;
}

function buildFilaments(
  c: Connection,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  px: number,
  py: number,
  mainMaxW: number,
  blockers: Blocker[],
): FilamentSpec[] {
  const seed = hashId(c.id);
  const baseSign = seed & 1 ? 1 : -1;
  const filaments: FilamentSpec[] = [];

  // Primary: the "chosen" path. Slightly biased toward direct, low sway.
  const sway1 = 18 + (seed % SWAY_MAX);
  const sway2 = 12 + ((seed >> 4) % SWAY_MAX);
  const signLate: 1 | -1 = (seed >> 2) & 1 ? baseSign : (-baseSign as 1 | -1);
  const primary = routeBezier(
    { x: ax, y: ay }, { x: bx, y: by },
    px, py, sway1, sway2, baseSign, signLate, blockers,
  );
  filaments.push({
    id: `${c.id}-p`,
    bez: primary,
    role: 'primary',
    growDelay: 0,
    maxWidth: mainMaxW,
    growSpeedFactor: 1,
  });

  // Two probes: alternate sides, larger sway, staggered sprout delays,
  // much thinner. They grow alongside the primary, reach their target,
  // then slowly thin out during bonded — the "unselected" paths.
  for (let i = 0; i < 2; i++) {
    const probeSeed = seed ^ ((i + 1) * 0x9e37);
    const pSide: 1 | -1 = i === 0 ? (-baseSign as 1 | -1) : (baseSign as 1 | -1);
    const swayA = 34 + (probeSeed % (SWAY_MAX + 18));
    const swayB = 26 + ((probeSeed >> 4) % (SWAY_MAX + 12));
    const probe = routeBezier(
      { x: ax, y: ay }, { x: bx, y: by },
      px, py, swayA, swayB, pSide, pSide, blockers,
    );
    filaments.push({
      id: `${c.id}-probe${i}`,
      bez: probe,
      role: 'probe',
      growDelay: 0.25 + i * 0.4,
      maxWidth: mainMaxW * (0.30 - i * 0.10),
      // Probes are much more tentative — half the primary's speed.
      growSpeedFactor: 0.5,
      decayStartS: 1.2 + i * 0.45,
      decayDurationS: 3.2,
    });
  }

  return filaments;
}

function probeDecay(bondedElapsedS: number, startS: number, durS: number): number {
  if (bondedElapsedS < startS) return 1;
  const t = (bondedElapsedS - startS) / durS;
  return Math.max(0, 1 - t);
}

// Given a target pathLength value, find the approximate wall-clock
// fraction of GROW_S at which the hesitation profile first reaches it.
// Used so branches sprout exactly when the main tip passes their base.
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

export function TendrilLayer({
  connections,
  probes = [],
  entityById,
}: TendrilLayerProps) {
  const nowRender = performance.now();
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

        // --- Positive compat: filament bundle (primary + 2 probes) ---
        const mainMaxW = style.width * 1.9;
        // Third-party mushrooms to steer around. Endpoints of this pair
        // are excluded; others are blockers with a generous clearance
        // radius so the tendril visibly curves away rather than skims.
        const blockers: Blocker[] = [];
        if (entityById) {
          for (const [id, e] of entityById) {
            if (id === c.a.id || id === c.b.id) continue;
            blockers.push({ x: e.x, y: e.y, r: 95 });
          }
        }
        const filaments = buildFilaments(c, ax, ay, bx, by, px, py, mainMaxW, blockers);
        const primary = filaments[0];
        const branches = pickBranches(primary.bez, seed, mainMaxW, c.compat);

        // Time-driven. Each filament has its own growDelay, so its
        // local "elapsed" is offset.
        const nowMs = performance.now();
        const elapsedS = (nowMs - c.bornAt) / 1000;
        const retractElapsedS = c.retractStart ? (nowMs - c.retractStart) / 1000 : 0;
        const retractScale = retracting
          ? Math.max(0, 1 - retractElapsedS / RETRACT_S)
          : 1;
        const breathe = c.state === 'bonded'
          ? 1 + BREATHE_AMP * Math.sin((elapsedS / BREATHE_PERIOD_S) * 2 * Math.PI)
          : 1;
        const widthMul = retractScale * breathe;

        // Tip glow dots ONLY once bonded has settled — never during growth,
        // per the slime-mold brief. ~0.8s after bonded enters.
        const bondedElapsedS = c.state === 'bonded'
          ? Math.max(0, elapsedS - GROW_S)
          : 0;

        return (
          <g key={c.id}>
            <defs>
              {filaments.map((f) => (
                <mask
                  key={`mask-${f.id}`}
                  id={`reveal-${f.id}`}
                  maskUnits="userSpaceOnUse"
                >
                  <rect
                    x={Math.min(ax, bx) - 140}
                    y={Math.min(ay, by) - 140}
                    width={Math.abs(bx - ax) + 280}
                    height={Math.abs(by - ay) + 280}
                    fill="black"
                  />
                  {/* Filament reveal. Primary uses the hesitation profile;
                      probes use the same profile with a growDelay offset
                      AND a duration stretch (growSpeedFactor < 1 → slower). */}
                  <motion.path
                    d={bezierD(f.bez)}
                    stroke="white"
                    strokeWidth={MASK_STROKE * (f.role === 'primary' ? 1 : 0.6)}
                    strokeLinecap="round"
                    fill="none"
                    initial={{ pathLength: 0 }}
                    animate={
                      growing ? { pathLength: GROW_VALUES }
                      : retracting ? { pathLength: RETRACT_VALUES }
                      : { pathLength: 1 }
                    }
                    transition={
                      growing
                        ? { duration: GROW_S / f.growSpeedFactor, times: GROW_TIMES, delay: f.growDelay, ease: 'easeInOut' }
                        : retracting
                          ? { duration: RETRACT_S, times: RETRACT_TIMES, ease: 'easeInOut' }
                          : { duration: 0.2 }
                    }
                  />
                  {/* Branches belong only to the primary filament — they
                      sprout off the "chosen" path, not the probes. */}
                  {f.role === 'primary' &&
                    branches.map((br, i) => (
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
              ))}
            </defs>

            {/* Render every filament in the bundle. Each has its own mask. */}
            {filaments.map((f) => {
              // Per-filament local elapsed (probes start later).
              const fElapsedS = Math.max(0, elapsedS - f.growDelay);
              // Probes fade out during bonded (the "unselected" paths).
              const decay =
                f.role === 'probe' && f.decayStartS != null && f.decayDurationS != null
                  ? probeDecay(bondedElapsedS, f.decayStartS, f.decayDurationS)
                  : 1;
              const filWidthMul = widthMul * decay;
              const rib = ribbonD(f.bez, (t) =>
                dynamicMainWidth(t, fElapsedS, f.maxWidth) * filWidthMul,
              );
              return (
                <g
                  key={`fil-${f.id}`}
                  mask={`url(#reveal-${f.id})`}
                  opacity={style.opacity}
                >
                  <path d={rib} fill={`url(#tendril-grad-${c.id})`} />
                  {/* Branches only on the primary filament, using its own
                      dynamic-width model. */}
                  {f.role === 'primary' &&
                    branches.map((br, i) => {
                      const branchElapsedS = Math.max(0, elapsedS - br.growDelay);
                      return (
                        <path
                          key={`br-${i}`}
                          d={ribbonD(br.bez, (t) =>
                            dynamicBranchWidth(
                              t,
                              branchElapsedS,
                              br.growDuration,
                              br.baseWidth,
                            ) * widthMul,
                          )}
                          fill={`url(#tendril-grad-${c.id})`}
                        />
                      );
                    })}
                </g>
              );
            })}

          </g>
        );
      })}

      {/* === V2a: exploratory probes ===
           Thin solo filaments each mushroom puts out into empty space,
           independent of any pair connection. Fade to near-transparent
           at the tip (searching into the unknown). No branches, no dots. */}
      {probes.map((p) => {
        const origin = entityById?.get(p.originId);
        if (!origin) return null;
        const { phase, localT } = probePhase(p, nowRender);
        if (phase === 'expired') return null;

        // Anchor on silhouette edge; tip at length px along angle.
        const ox = origin.x + Math.cos(p.angle) * ANCHOR_RADIUS;
        const oy = origin.y + Math.sin(p.angle) * ANCHOR_RADIUS;
        const tipX = ox + Math.cos(p.angle) * p.length;
        const tipY = oy + Math.sin(p.angle) * p.length;
        const perpX = -Math.sin(p.angle);
        const perpY = Math.cos(p.angle);

        // Probes also steer around other mushrooms if their reach would
        // bump into one. Origin itself excluded.
        const probeBlockers: Blocker[] = [];
        if (entityById) {
          for (const [id, e] of entityById) {
            if (id === p.originId) continue;
            const dToTip = Math.hypot(tipX - e.x, tipY - e.y);
            const dToOrigin = Math.hypot(ox - e.x, oy - e.y);
            // Only include blockers that could plausibly interfere.
            if (Math.min(dToTip, dToOrigin) < p.length + 110) {
              probeBlockers.push({ x: e.x, y: e.y, r: 95 });
            }
          }
        }
        const initSign: 1 | -1 = p.curvature >= 0 ? 1 : -1;
        const bez = routeBezier(
          { x: ox, y: oy },
          { x: tipX, y: tipY },
          perpX, perpY,
          Math.abs(p.curvature),
          Math.abs(p.curvature) * 0.4,
          initSign, initSign,
          probeBlockers,
        );

        // Reveal fraction from phase — uses the same hesitation profile
        // for growing so probes also feel tentative.
        let reveal: number;
        if (phase === 'growing') {
          reveal = interpKeyframes(localT, GROW_TIMES, GROW_VALUES);
        } else if (phase === 'stable') {
          reveal = 1;
        } else {
          reveal = interpKeyframes(localT, RETRACT_TIMES, RETRACT_VALUES);
        }

        // Dynamic width: point at position t was "reached" at time
        // GROW_S * timeToReach(t) into its own growing phase. Compute
        // wall-clock elapsed relative to the probe's bornAt.
        const probeElapsedS = (nowRender - p.bornAt) / 1000;
        const maxW = 3.6;  // probes max at ~3.6px — thin filaments
        // Retract thin-down over phase 'retracting'.
        const retractMul = phase === 'retracting' ? Math.max(0, 1 - localT) : 1;

        const ribD = ribbonD(bez, (t) => {
          // A probe point is "reached" linearly at localT * total = t * growMs.
          // Use a simple linear maturity instead of the full keyframe inversion.
          const arriveS = (p.growMs / 1000) * t;
          const age = probeElapsedS - arriveS;
          const maturity = age <= 0 ? INITIAL_WIDTH_FRAC
            : INITIAL_WIDTH_FRAC + (1 - INITIAL_WIDTH_FRAC) * Math.min(1, age / MATURE_S);
          // Overall taper: thicker at origin, thinner at tip.
          const taper = 1 - 0.7 * t;
          return maxW * taper * maturity * retractMul;
        });

        const color = CHARACTERS[origin.charId].color;
        const gradId = `probe-grad-${p.id}`;
        const maskId = `probe-mask-${p.id}`;
        return (
          <g key={p.id}>
            <defs>
              <linearGradient
                id={gradId}
                gradientUnits="userSpaceOnUse"
                x1={ox} y1={oy} x2={tipX} y2={tipY}
              >
                <stop offset="0%" stopColor={color} stopOpacity="0.85" />
                <stop offset="70%" stopColor={color} stopOpacity="0.45" />
                <stop offset="100%" stopColor={color} stopOpacity="0" />
              </linearGradient>
              <mask id={maskId} maskUnits="userSpaceOnUse">
                <rect
                  x={Math.min(ox, tipX) - 40}
                  y={Math.min(oy, tipY) - 40}
                  width={Math.abs(tipX - ox) + 80}
                  height={Math.abs(tipY - oy) + 80}
                  fill="black"
                />
                <path
                  d={bezierD(bez)}
                  stroke="white"
                  strokeWidth={MASK_STROKE * 0.5}
                  strokeLinecap="round"
                  fill="none"
                  pathLength={1}
                  strokeDasharray={1}
                  strokeDashoffset={1 - reveal}
                />
              </mask>
            </defs>
            <path
              d={ribD}
              fill={`url(#${gradId})`}
              mask={`url(#${maskId})`}
            />
          </g>
        );
      })}
    </svg>
  );
}
