/**
 * Mosaic — deterministic procedural pixel-spore generator.
 *
 * Every creature is a grid of colored pixel cells shaped like a little
 * mushroom, grown from the emotion reading. Given the same inputs it
 * always produces the same grid (seeded from the entity id + charId via
 * seed.ts's xmur3/Rng), so a creature never re-shapes between frames and
 * the same sentence always yields the same specimen.
 *
 * The 6 charIds double as palette FAMILIES (tender=warm peach,
 * calm=cool blue, curious=orange, dreamy=lavender+sparkle,
 * companion=mint, lonely=cool desaturated grey). Within a family every
 * spore is unique: hue is perturbed per-id, `tintHue` injects a second
 * hue, and `intensity` widens the palette from near-monochrome to a
 * full rainbow.
 *
 * Nothing here touches the DOM — buildMosaic returns a plain data spec
 * that PixelSprite renders to a canvas. Keep it a pure function.
 */
import { Rng, xmur3 } from './seed';
import type { CharId } from '../data/characters';
import type { Morphology } from './emotion';

export interface MosaicPaletteSpec {
  /** family base hue used at generation time (for reference / dye). */
  clusterHue: number;
  /** N color stops, dark→light, used as vertical bands. */
  stops: Array<{ h: number; s: number; l: number }>;
  /** dreamy family scatters near-white sparkle cells. */
  sparkle: boolean;
}

export interface MosaicCell {
  col: number;
  row: number;
  /** css color string (hsl). */
  color: string;
  /** 0..1 — edge / sparse cells are translucent for a wispy look. */
  alpha: number;
  /** 0..1 base threshold for the dye wavefront (see infection dyeing). */
  dyeBase: number;
}

export interface MosaicEyes {
  /** grid row the two eyes sit on. */
  row: number;
  /** left column of the left eye (2 cells: L0, L0+1). */
  L0: number;
  /** left column of the right eye (2 cells: R0, R0+1). */
  R0: number;
}

export interface MosaicSpec {
  cols: number;
  rows: number;
  cells: MosaicCell[];
  /** full silhouette truth (rows*cols) — used for dye / hit shape. */
  mask: boolean[];
  palette: MosaicPaletteSpec;
  eyes: MosaicEyes;
  /** css blur px (at the internal CELL resolution) from low density. */
  blur: number;
  /** widest span at the base, 0..1 of cols — drives the ground shadow. */
  bottomWidthFrac: number;
  center: number;
}

export interface MosaicInputs {
  id: string;
  charId: CharId;
  morphology: Morphology;
  /** emotion reading intensity 0..1 (defaults to 0.5 when absent). */
  intensity: number;
  /** secondary emotion label — nudges a second accent hue. */
  secondaryLabel?: string;
}

/** Internal per-cell pixel resolution. Display scales this to the box. */
export const CELL_PX = 12;

/** Family base hues + saturation. Index = CharId. */
const FAMILY = [
  { hue: 24, sat: 0.62, sparkle: false }, // 0 tender   — warm peach
  { hue: 205, sat: 0.50, sparkle: false }, // 1 calm     — cool blue
  { hue: 32, sat: 0.72, sparkle: false }, // 2 curious  — orange
  { hue: 268, sat: 0.58, sparkle: true }, // 3 dreamy   — lavender + sparkle
  { hue: 158, sat: 0.52, sparkle: false }, // 4 companion— mint
  { hue: 222, sat: 0.16, sparkle: false }, // 5 lonely   — cool grey
] as const;

function hsl(h: number, s: number, l: number): string {
  return `hsl(${((h % 360) + 360) % 360 | 0},${Math.round(s * 100)}%,${Math.round(l * 100)}%)`;
}

function lerpHue(a: number, b: number, t: number): number {
  const d = ((b - a + 540) % 360) - 180;
  return a + d * t;
}

/** Deterministic small hue offset from a label string (stable per word). */
function labelHueShift(label: string | undefined): number {
  if (!label) return 0;
  const r = new Rng(xmur3(`sec:${label}`)());
  return r.range(-24, 24);
}

function buildPalette(
  charId: CharId,
  rng: Rng,
  tintHue: number,
  intensity: number,
  secondaryShift: number,
): MosaicPaletteSpec {
  const fam = FAMILY[charId];
  const h0 = fam.hue + rng.range(-16, 16);
  const hAccent = lerpHue(h0, tintHue, 0.35);
  const N = 5 + Math.round(intensity * 2);
  const hueSpread = 18 + intensity * 140;
  const baseS = fam.sat;
  const stops: MosaicPaletteSpec['stops'] = [];
  for (let k = 0; k < N; k++) {
    const f = N > 1 ? k / (N - 1) : 0.5;
    const h = hAccent + (f - 0.5) * hueSpread + secondaryShift * (k % 2 === 0 ? 1 : -1);
    const L = 0.42 + f * 0.36;
    const S = baseS * (0.85 + rng.next() * 0.3);
    stops.push({ h, s: S, l: L });
  }
  return { clusterHue: fam.hue, stops, sparkle: fam.sparkle };
}

export function colorFromBand(
  pal: MosaicPaletteSpec,
  band: number,
  jitterL: number,
  darken: number,
): string {
  const st = pal.stops[Math.max(0, Math.min(pal.stops.length - 1, band))];
  const L = Math.max(0.12, Math.min(0.9, st.l + jitterL - darken));
  return hsl(st.h, st.s, L);
}

/** Recolor a given cell using a *different* palette (used for dyeing). */
export function dyedCellColor(spec: MosaicSpec, cell: MosaicCell, pal: MosaicPaletteSpec): string {
  const v = spec.rows > 1 ? cell.row / (spec.rows - 1) : 0.5;
  const band = Math.floor(v * pal.stops.length);
  const darken = 0.06 * (Math.abs(cell.col - spec.center) / spec.cols);
  return colorFromBand(pal, band, 0, darken);
}

export function buildMosaic(input: MosaicInputs): MosaicSpec {
  const { id, charId, morphology, intensity, secondaryLabel } = input;
  const rng = new Rng(xmur3(`${id}:${charId}`)());

  const cols = rng.int(10, 15);
  const rows = rng.int(12, 17);
  const center = (cols - 1) / 2;
  const proto = rng.int(0, 3); // 0 capped-stem, 1 round-head, 2 bell
  const density = morphology.density;

  // palette (its own rng stream so density/shape tweaks don't reshuffle colors)
  const secondaryShift = rng.range(-14, 14) + labelHueShift(secondaryLabel);
  const tintHue = morphology.tintHue;
  const palette = buildPalette(
    charId,
    new Rng(xmur3(`${id}:p${charId}`)()),
    tintHue,
    intensity,
    secondaryShift,
  );
  const N = palette.stops.length;

  // silhouette envelope parameters
  const capV = rng.range(0.44, 0.6);
  const shoulder = rng.range(0.4, 0.49) * cols;
  const stemW = rng.range(0.13, 0.22) * cols;
  const R = rng.range(0.44, 0.5) * cols;
  const bellP = rng.range(0.6, 0.95);
  const rowJit: number[] = [];
  for (let r = 0; r < rows; r++) rowJit.push(rng.range(-0.6, 0.6));

  const halfWidth = (v: number): number => {
    let hw: number;
    if (proto === 0) {
      if (v < capV) {
        const d = (capV - v) / capV;
        hw = shoulder * Math.sqrt(Math.max(0, 1 - d * d));
        hw = Math.max(hw, 1.1);
      } else {
        const vv = (v - capV) / (1 - capV);
        hw = stemW * (1 - 0.35 * vv);
        if (vv > 0.8) hw *= Math.sqrt(Math.max(0, 1 - Math.pow((vv - 0.8) / 0.2, 2)));
      }
    } else if (proto === 1) {
      const t = 2 * v - 1;
      hw = R * Math.sqrt(Math.max(0, 1 - t * t));
      if (v > 0.86) hw = Math.max(hw, stemW * 0.9);
    } else {
      hw = shoulder * Math.pow(1 - v, bellP);
      hw = Math.max(hw, v < 0.9 ? 1.4 : 0.6);
    }
    return hw;
  };

  const mask = new Array<boolean>(cols * rows).fill(false);
  const cells: MosaicCell[] = [];
  let bottomWidth = 1;
  for (let r = 0; r < rows; r++) {
    const v = rows > 1 ? r / (rows - 1) : 0.5;
    const hw = halfWidth(v) + rowJit[r] * 0.5;
    if (hw < 0.4) continue;
    for (let c = 0; c < cols; c++) {
      const dx = Math.abs(c - center);
      if (dx > hw + 0.35) continue;
      mask[r * cols + c] = true;
      const edge = dx > hw - 1;
      const fillProb = 0.55 + density * 0.5 - (edge ? 0.35 * (1 - density) : 0);
      if (rng.next() > fillProb) continue;
      let band = Math.floor(v * N);
      const jumpProb = 0.12 + intensity * 0.18;
      if (rng.next() < jumpProb) band += rng.next() < 0.5 ? -1 : 1;
      const darken = 0.1 * (dx / (hw || 1));
      const jL = rng.range(-0.03, 0.03);
      let color = colorFromBand(palette, band, jL, darken);
      const alpha = edge ? 0.35 + 0.65 * density : 1;
      if (palette.sparkle && rng.next() < 0.05) {
        const st = palette.stops[Math.max(0, Math.min(N - 1, band))];
        color = hsl(st.h, 0.6, 0.92);
      }
      cells.push({ col: c, row: r, color, alpha, dyeBase: 0.5 + rng.range(-0.15, 0.15) });
      if (r > rows * 0.7) bottomWidth = Math.max(bottomWidth, dx);
    }
  }

  // eyes: two 2-cell eyes (white cell + black pupil cell that slides).
  const eyeV = rng.range(0.44, 0.54);
  const eyeRow = Math.round(eyeV * (rows - 1));
  const mid = Math.round(center);
  let gap = rng.int(1, 3);
  let totalW = 2 + gap + 2;
  let leftmost = mid - Math.floor(totalW / 2);
  let L0 = leftmost;
  let R0 = leftmost + 2 + gap;
  const onBody = (rr: number, cc: number): boolean =>
    cc >= 0 && cc < cols && mask[rr * cols + cc];
  const eyeRowOK = (rr: number, l0: number, r0: number): boolean =>
    onBody(rr, l0) && onBody(rr, l0 + 1) && onBody(rr, r0) && onBody(rr, r0 + 1);
  let er = eyeRow;
  for (let tries = 0; tries < 5 && !eyeRowOK(er, L0, R0); tries++) {
    if (gap > 1) {
      gap = 1;
      totalW = 6;
      leftmost = mid - 3;
      L0 = leftmost;
      R0 = leftmost + 3;
    } else {
      er = Math.max(0, er - 1);
    }
  }

  return {
    cols,
    rows,
    cells,
    mask,
    palette,
    eyes: { row: er, L0, R0 },
    // Crisp by default: only genuinely wispy (low-density) spores get a
    // soft blur; anything at or above ~half density stays sharp pixel art.
    blur: Math.max(0, 0.5 - density) * 2.6,
    bottomWidthFrac: (bottomWidth * 2) / cols,
    center,
  };
}
