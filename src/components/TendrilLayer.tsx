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
import { useEffect, useRef, useState } from 'react';
import { tendrilStyle, type Connection } from '../core/connections';
import {
  initFilament,
  stepFilament,
  type FilamentState,
  type Entity as FEntity,
} from '../core/filaments';
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
const GROW_S = 3.5;
const RETRACT_S = 2.2;

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

/** Subdivide a polyline using Catmull-Rom interpolation so the trail
 *  reads as a smooth curve rather than a chain of straight segments.
 *  `subdiv` is the number of interpolated points between each pair. */
function smoothTrail(
  trail: ReadonlyArray<{ x: number; y: number }>,
  subdiv: number,
): Array<{ x: number; y: number; srcIdx: number; srcFrac: number }> {
  const N = trail.length;
  if (N < 2) return trail.map((p, i) => ({ ...p, srcIdx: i, srcFrac: 0 }));
  const out: Array<{ x: number; y: number; srcIdx: number; srcFrac: number }> = [];
  const get = (i: number) => trail[Math.max(0, Math.min(N - 1, i))];
  for (let i = 0; i < N - 1; i++) {
    const p0 = get(i - 1);
    const p1 = get(i);
    const p2 = get(i + 1);
    const p3 = get(i + 2);
    for (let j = 0; j < subdiv; j++) {
      const t = j / subdiv;
      // Catmull-Rom (uniform). Cubic interpolation between p1 and p2.
      const t2 = t * t;
      const t3 = t2 * t;
      const x =
        0.5 *
        ((2 * p1.x) +
          (-p0.x + p2.x) * t +
          (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
          (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3);
      const y =
        0.5 *
        ((2 * p1.y) +
          (-p0.y + p2.y) * t +
          (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
          (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3);
      out.push({ x, y, srcIdx: i, srcFrac: t });
    }
  }
  const last = trail[N - 1];
  out.push({ x: last.x, y: last.y, srcIdx: N - 1, srcFrac: 0 });
  return out;
}

/** Build a tapered filled ribbon from a free-form polyline (the trail
 *  left by a physics-driven tip). widthAt(srcIdx, srcFrac, N) returns
 *  total width at a given source trail index and fractional offset,
 *  so per-point age can still drive width even through smoothing. */
function polylineRibbonD(
  trail: ReadonlyArray<{ x: number; y: number }>,
  widthAt: (srcIdx: number, srcFrac: number, N: number) => number,
  subdiv = 4,
): string {
  const N = trail.length;
  if (N < 2) return '';
  const smoothed = smoothTrail(trail, subdiv);
  const M = smoothed.length;
  const fwd: string[] = [];
  const back: string[] = [];
  for (let i = 0; i < M; i++) {
    const pt = smoothed[i];
    const prev = smoothed[Math.max(0, i - 1)];
    const next = smoothed[Math.min(M - 1, i + 1)];
    const tx = next.x - prev.x;
    const ty = next.y - prev.y;
    const tl = Math.hypot(tx, ty) || 1;
    const perpX = -ty / tl;
    const perpY = tx / tl;
    const w = widthAt(pt.srcIdx, pt.srcFrac, N) / 2;
    fwd.push(`${(pt.x + perpX * w).toFixed(1)},${(pt.y + perpY * w).toFixed(1)}`);
    back.unshift(`${(pt.x - perpX * w).toFixed(1)},${(pt.y - perpY * w).toFixed(1)}`);
  }
  const fp = fwd.map((p, i) => (i === 0 ? `M ${p}` : `L ${p}`)).join(' ');
  const bp = back.map((p) => `L ${p}`).join(' ');
  return `${fp} ${bp} Z`;
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
const MATURE_S = 3.0;             // time for a newly-reached point to fully thicken
const INITIAL_WIDTH_FRAC = 0.03;  // fresh-tip width as fraction of mature (extremely thin)
const BREATHE_AMP = 0.08;         // bonded breathing amplitude
const BREATHE_PERIOD_S = 4.5;

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

function probeDecay(bondedElapsedS: number, startS: number, durS: number): number {
  if (bondedElapsedS < startS) return 1;
  const t = (bondedElapsedS - startS) / durS;
  return Math.max(0, 1 - t);
}

export function TendrilLayer({
  connections,
  probes = [],
  entityById,
}: TendrilLayerProps) {
  const nowRender = performance.now();

  // === V2c: physics-driven filament tips ===
  // Per connection, we maintain 1 primary + 2 probe FilamentStates.
  // They advance by themselves each frame (tip seeks target with noise),
  // accumulating a trail that we render as a tapered polyline ribbon.
  const filamentsRef = useRef<Map<string, FilamentState>>(new Map());
  // Keep latest props accessible from inside the RAF closure without
  // re-subscribing.
  const connectionsRef = useRef(connections);
  connectionsRef.current = connections;
  const entityByIdRef = useRef(entityById);
  entityByIdRef.current = entityById;
  // A tick that bumps every frame so React re-renders and picks up
  // the new tip positions from filamentsRef.
  const [, setTick] = useState(0);
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      const now = performance.now();
      const conns = connectionsRef.current;
      const entsMap = entityByIdRef.current;
      const ents: Map<string, FEntity> = entsMap ?? new Map();

      // Make sure every positive-compat connection has its bundle.
      const filaments = filamentsRef.current;
      const liveIds = new Set<string>();
      for (const c of conns) {
        if (c.compat < 0) continue;       // negative-compat stays bezier-based
        const style = tendrilStyle(c);
        const maxW = style.width * 3.4;
        const primaryId = `${c.id}-primary0`;
        if (!filaments.has(primaryId)) {
          const f = initFilament(c, 'primary', 0, now, ents, maxW);
          if (f) filaments.set(primaryId, f);
        }
        liveIds.add(primaryId);
        for (let i = 0; i < 2; i++) {
          const probeId = `${c.id}-probe${i}`;
          if (!filaments.has(probeId)) {
            const f = initFilament(c, 'probe', i, now, ents, maxW);
            if (f) filaments.set(probeId, f);
          }
          liveIds.add(probeId);
        }
      }
      // Drop filaments whose connection is gone.
      for (const id of filaments.keys()) {
        if (!liveIds.has(id)) filaments.delete(id);
      }
      // Step physics on all remaining filaments.
      for (const f of filaments.values()) {
        const c = conns.find((cc) => cc.id === f.connectionId);
        if (!c) continue;
        stepFilament(f, c, ents, now);
      }
      setTick((t) => (t + 1) & 0xffff);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const filaments = filamentsRef.current;

  return (
    <svg className="overlay-layer" width="100%" height="100%" aria-hidden>
      <defs>
        {/* Goo / fusion filter: big Gaussian blur + alpha threshold
         *  produces a blob whose halo extends around each ribbon and
         *  DOUBLES IN SIZE where two ribbons cross (the classic SVG
         *  "metaball" trick). The blob is rendered BEHIND the source
         *  via `operator="over"` so at intersections the blob extends
         *  past the ribbons — the fused area visibly chunks up, while
         *  single-ribbon stretches just get a slight edge softening. */}
        <filter
          id="tendril-fusion"
          x="-15%"
          y="-15%"
          width="130%"
          height="130%"
        >
          <feGaussianBlur in="SourceGraphic" stdDeviation="4" result="blur" />
          <feColorMatrix
            in="blur"
            mode="matrix"
            values="1 0 0 0 0
                    0 1 0 0 0
                    0 0 1 0 0
                    0 0 0 14 -5"
            result="goo"
          />
          {/* Source drawn OVER goo: at crossings, goo extends past the
           *  ribbons → we see a thicker blob wrapping around. */}
          <feComposite in="SourceGraphic" in2="goo" operator="over" />
        </filter>
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

      {/* Negative-compat: dashed bezier strokes, rendered outside the
       *  fusion filter so the dashes don't get blurred away. */}
      {connections.filter((c) => c.compat < 0).map((c) => {
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
      })}

      {/* Positive-compat: filament bundles, all wrapped in the fusion
       *  filter so two ribbons crossing in space visually merge. */}
      <g filter="url(#tendril-fusion)">
      {connections.filter((c) => c.compat >= 0).map((c) => {
        const style = tendrilStyle(c);
        const retracting = c.state === 'retracting';

        // --- Positive compat: physics-driven filament trails ---
        // Read the live FilamentStates maintained by the RAF loop.
        // Each trail is a poly-line that the tip actually traced through
        // space. No masks, no pathLength reveal: width is ZERO where the
        // tip hasn't been, and grows with each point's age.
        const nowMs = performance.now();
        const elapsedS = (nowMs - c.bornAt) / 1000;
        const retractElapsedS = c.retractStart ? (nowMs - c.retractStart) / 1000 : 0;
        const breathe = c.state === 'bonded'
          ? 1 + BREATHE_AMP * Math.sin((elapsedS / BREATHE_PERIOD_S) * 2 * Math.PI)
          : 1;
        const bondedElapsedS = c.state === 'bonded'
          ? Math.max(0, elapsedS - GROW_S)
          : 0;

        const fPrimary = filaments.get(`${c.id}-primary0`);
        const fProbe0 = filaments.get(`${c.id}-probe0`);
        const fProbe1 = filaments.get(`${c.id}-probe1`);
        const bundle = [fPrimary, fProbe0, fProbe1].filter(
          (f): f is FilamentState => !!f,
        );

        return (
          <g key={c.id}>
            {bundle.map((f) => {
              // Decay for probes: lose width over time during bonded.
              const decay =
                f.role === 'probe' && f.decayStartBondedS != null && f.decayDurationS != null
                  ? probeDecay(bondedElapsedS, f.decayStartBondedS, f.decayDurationS)
                  : 1;
              // During retract: instead of uniformly scaling, the
              // TIP END fades first and the fade front walks back to
              // the origin over RETRACT_S. That reads as the tendril
              // being slowly withdrawn into the origin body, rather
              // than shrinking in place.
              const retractingProgress =
                retracting && retractElapsedS >= 0
                  ? Math.min(1, retractElapsedS / RETRACT_S)
                  : 0;
              // Birth fade: over the first 0.35s of a filament's life,
              // ramp up the overall ribbon width from 0, so it doesn't
              // pop in.
              const filAgeS = Math.max(0, (nowMs - f.bornAt) / 1000 - f.growDelayMs / 1000);
              const birthFade = Math.min(1, filAgeS / 0.35);
              const widthMul = breathe * decay * birthFade;

              // Include the live tip position as the final sample so the
              // ribbon tracks the tip between trail recordings.
              const trail = [...f.trail];
              const last = trail[trail.length - 1];
              if (last && Math.hypot(f.tipX - last.x, f.tipY - last.y) > 0.5) {
                trail.push({ x: f.tipX, y: f.tipY, t: nowMs });
              }
              if (trail.length < 2) return null;

              // Width of the retract fade band (fraction of the trail
              // over which width smoothly drops from 1 to 0).
              const RETRACT_BAND = 0.22;

              const d = polylineRibbonD(trail, (srcIdx, srcFrac, N) => {
                // Interpolate age linearly between neighboring trail
                // points using srcFrac for smooth width transitions
                // across Catmull-Rom subdivided samples.
                const a = trail[Math.min(N - 1, srcIdx)];
                const b = trail[Math.min(N - 1, srcIdx + 1)];
                const ageA = (nowMs - a.t) / 1000;
                const ageB = (nowMs - b.t) / 1000;
                const age = ageA + (ageB - ageA) * srcFrac;
                const maturity = Math.min(1, age / MATURE_S);
                // posFrac: 0 at origin end, 1 at tip end.
                const posFrac = N > 1 ? (srcIdx + srcFrac) / (N - 1) : 0;
                const shape = 1 - 0.2 * Math.sin(Math.PI * posFrac);
                const frac = INITIAL_WIDTH_FRAC + (1 - INITIAL_WIDTH_FRAC) * maturity;
                // Retract wave: `distFromTip = 1 - posFrac`. The fade
                // front sits at `retractingProgress` (in distFromTip
                // space) and has a smooth band ahead of it.
                let retractMul = 1;
                if (retractingProgress > 0) {
                  const distFromTip = 1 - posFrac;
                  if (distFromTip < retractingProgress) {
                    retractMul = 0;                                 // already withdrawn
                  } else if (distFromTip < retractingProgress + RETRACT_BAND) {
                    retractMul =
                      (distFromTip - retractingProgress) / RETRACT_BAND; // smooth band
                  }
                }
                return f.maxWidth * shape * frac * widthMul * retractMul;
              });
              return (
                <path
                  key={`fil-${f.id}`}
                  d={d}
                  fill={`url(#tendril-grad-${c.id})`}
                  opacity={style.opacity}
                />
              );
            })}
          </g>
        );
      })}
      </g>

      {/* Decoration berries — only appear on the PRIMARY's trail once
       *  the connection has settled (bondedElapsedS >= 1.2s). Rendered
       *  outside the fusion filter so they keep their crisp color,
       *  reading as small glints on top of the fused network. */}
      {connections.filter((c) => c.compat >= 0 && c.state === 'bonded').map((c) => {
        const fPrimary = filaments.get(`${c.id}-primary0`);
        if (!fPrimary) return null;
        const nowMs = performance.now();
        const elapsedS = (nowMs - c.bornAt) / 1000;
        const bondedElapsedS = Math.max(0, elapsedS - GROW_S);
        if (bondedElapsedS < 1.2) return null;
        if (fPrimary.trail.length < 6) return null;
        const style = tendrilStyle(c);
        const seed = hashId(c.id);
        // Pick 2 spots along the trail with seed-based jitter, skewed
        // toward the thicker (older, origin-side) half of the ribbon.
        const fracs = [0.30 + ((seed & 0xf) / 60), 0.62 + (((seed >> 5) & 0xf) / 70)];
        return fracs.map((frac, i) => {
          const idx = Math.min(
            fPrimary.trail.length - 1,
            Math.max(0, Math.floor(fPrimary.trail.length * frac)),
          );
          const pt = fPrimary.trail[idx];
          const col = i % 2 === 0 ? style.colorA : style.colorB;
          // Appear delay: first berry at ~1.2s bonded, next ~1.6s.
          const appearDelay = 1.2 + i * 0.4;
          return (
            <motion.circle
              key={`deco-${c.id}-${i}`}
              cx={pt.x}
              cy={pt.y}
              r={Math.max(1.6, style.width * 0.85)}
              fill={col}
              initial={{ opacity: 0, scale: 0.3 }}
              animate={{
                opacity: bondedElapsedS >= appearDelay ? 0.75 : 0,
                scale: bondedElapsedS >= appearDelay ? [0.6, 1.08, 0.92, 1] : 0.3,
              }}
              transition={{ duration: 0.9, ease: 'easeOut' }}
            />
          );
        });
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
