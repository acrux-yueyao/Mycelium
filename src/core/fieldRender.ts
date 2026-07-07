/**
 * fieldRender — canvas draw routines for the "Beautiful Worlds" ecology.
 *
 * The accumulated colony can be hundreds of creatures, so it is painted
 * onto ONE shared canvas rather than hundreds of DOM nodes. These are
 * pure functions over a CanvasRenderingContext2D:
 *
 *   drawDitherField  — the ambient datamosh backdrop (ordered-dither
 *                      colour masses + blue spires + particle spray)
 *   drawMoshCreature — a pixel-spore rendered with datamosh: downward
 *                      pixel-sort streaks + a horizontal glitch row.
 *
 * Everything is deterministic (seeded via seed.ts) so a given colony
 * renders identically on every machine and every frame.
 */
import { xmur3, Rng } from './seed';
import { buildMosaic, dyedCellColor, type MosaicSpec, type MosaicPaletteSpec } from './mosaic';
import type { CharId } from '../data/characters';
import type { Morphology } from './emotion';

/** Dye state for the tile-swap interaction: as two creatures meet, one's
 *  cells progressively take on the other's palette from the contact side. */
export interface DyeState {
  palette: MosaicPaletteSpec;
  /** 0..1 wavefront progress. */
  progress: number;
  /** unit direction toward the partner (sweep origin). */
  dirX: number;
  dirY: number;
}

function parseHsl(s: string): [number, number, number] {
  const m = s.match(/hsl\(([-\d.]+),([\d.]+)%,([\d.]+)%\)/);
  return m ? [parseFloat(m[1]), parseFloat(m[2]), parseFloat(m[3])] : [0, 0, 50];
}
function mixHsl(a: string, b: string, t: number): string {
  const A = parseHsl(a), B = parseHsl(b);
  const dh = ((B[0] - A[0] + 540) % 360) - 180;
  return `hsl(${((A[0] + dh * t) % 360 + 360) % 360 | 0},${Math.round(A[1] + (B[1] - A[1]) * t)}%,${Math.round(A[2] + (B[2] - A[2]) * t)}%)`;
}

const DOT = 4;
const BAYER = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];

type G = CanvasRenderingContext2D;

// ---- ambient dithered backdrop ---------------------------------------

interface Blob { x: number; y: number; rx: number; ry: number }

function ditherMass(g: G, W: number, H: number, color: string, blobs: Blob[], dmax: number) {
  let minx = W, miny = H, maxx = 0, maxy = 0;
  for (const b of blobs) {
    minx = Math.min(minx, (b.x - b.rx) * W); maxx = Math.max(maxx, (b.x + b.rx) * W);
    miny = Math.min(miny, (b.y - b.ry) * H); maxy = Math.max(maxy, (b.y + b.ry) * H);
  }
  minx = Math.max(0, minx); miny = Math.max(0, miny);
  maxx = Math.min(W, maxx); maxy = Math.min(H, maxy);
  g.fillStyle = color;
  for (let y = miny; y < maxy; y += DOT) {
    for (let x = minx; x < maxx; x += DOT) {
      let d = 0;
      for (const b of blobs) {
        const nx = (x / W - b.x) / b.rx, ny = (y / H - b.y) / b.ry;
        d = Math.max(d, 1 - Math.hypot(nx, ny));
      }
      if (d <= 0) continue;
      d = Math.min(1, d * dmax);
      const bx = Math.floor(x / DOT) % 4, by = Math.floor(y / DOT) % 4;
      if ((BAYER[by][bx] + 0.5) / 16 < d) g.fillRect(x, y, DOT, DOT);
    }
  }
}

function spires(g: G, W: number, H: number, color: string, x0: number, x1: number, ybase: number, count: number, seed: string) {
  const rng = new Rng(xmur3(seed)());
  g.fillStyle = color;
  for (let s = 0; s < count; s++) {
    const bx = (x0 + (x1 - x0) * (s / count)) * W + rng.range(-6, 6);
    const bw = rng.range(10, 26);
    const top = (ybase - rng.range(0.12, 0.42)) * H, bot = ybase * H;
    for (let y = top; y < bot; y += DOT) {
      for (let x = bx; x < bx + bw; x += DOT) {
        const vv = (y - top) / (bot - top), d = Math.min(1, vv * 1.3);
        const px = Math.floor(x / DOT) % 4, py = Math.floor(y / DOT) % 4;
        if ((BAYER[py][px] + 0.5) / 16 < d) g.fillRect(x, y, DOT, DOT);
      }
    }
  }
}

function spray(g: G, W: number, H: number, cx: number, cy: number, seed: string) {
  const rng = new Rng(xmur3(seed)());
  for (let i = 0; i < 1500; i++) {
    const ang = rng.range(-Math.PI * 0.85, -Math.PI * 0.02);
    const dist = Math.pow(rng.next(), 0.55) * rng.range(0.1, 0.6) * Math.min(W, H) * 1.5;
    const x = cx + Math.cos(ang) * dist, y = cy + Math.sin(ang) * dist * 0.8;
    const t = dist / Math.min(W, H);
    g.globalAlpha = Math.max(0.05, 0.6 - t * 0.5);
    const roll = rng.next();
    g.fillStyle = roll < 0.08 ? '#c0342e' : roll < 0.16 ? '#2f7a3d' : '#7fbf4a';
    g.fillRect(x, y, rng.range(2, 5), rng.range(2, 5));
  }
  g.globalAlpha = 1;
}

/** Paint the ambient dithered ecology backdrop across the whole canvas. */
export function drawDitherField(g: G, W: number, H: number, seed = 'field') {
  ditherMass(g, W, H, '#d6a6e8', [
    { x: 0.5, y: 0.42, rx: 0.16, ry: 0.24 }, { x: 0.58, y: 0.55, rx: 0.14, ry: 0.22 },
    { x: 0.44, y: 0.6, rx: 0.12, ry: 0.2 }, { x: 0.62, y: 0.36, rx: 0.1, ry: 0.16 },
  ], 1.1);
  ditherMass(g, W, H, '#e6b8dd', [{ x: 0.52, y: 0.48, rx: 0.1, ry: 0.16 }, { x: 0.66, y: 0.62, rx: 0.09, ry: 0.14 }], 1.0);
  ditherMass(g, W, H, '#ddd39a', [{ x: 0.46, y: 0.55, rx: 0.06, ry: 0.12 }, { x: 0.55, y: 0.5, rx: 0.05, ry: 0.1 }], 1.2);
  ditherMass(g, W, H, '#46a65a', [{ x: 0.42, y: 0.52, rx: 0.05, ry: 0.09 }, { x: 0.6, y: 0.68, rx: 0.05, ry: 0.08 }, { x: 0.5, y: 0.66, rx: 0.04, ry: 0.07 }], 1.3);
  spires(g, W, H, '#3b5bd0', 0.22, 0.42, 0.9, 9, seed + ':spire');
  ditherMass(g, W, H, '#8b6fd8', [{ x: 0.9, y: 0.78, rx: 0.16, ry: 0.2 }], 1.1);
  spray(g, W, H, W * 0.86, H * 0.42, seed + ':spray');
}

// ---- datamosh creature ------------------------------------------------

export interface CreatureSeed {
  id: string;
  charId: CharId;
  morphology: Morphology;
  intensity: number;
  secondaryLabel?: string;
}

/** Build the deterministic pixel spec for a creature (memo upstream). */
export function creatureSpec(c: CreatureSeed): MosaicSpec {
  return buildMosaic({
    id: c.id, charId: c.charId, morphology: c.morphology,
    intensity: c.intensity, secondaryLabel: c.secondaryLabel,
  });
}

/**
 * Draw a creature at (ox,oy) top-left, cell px `cell`, with datamosh:
 * downward pixel-sort streaks behind, a horizontal glitch row, and a
 * few displaced flecks. Eyes stay crisp so it still reads as a creature.
 */
export function drawMoshCreature(g: G, spec: MosaicSpec, ox: number, oy: number, cell: number, seed: string, gaze: number, dye?: DyeState | null) {
  g.imageSmoothingEnabled = false;
  // tile-swap: per-cell colour, dyed toward the partner palette by a
  // wavefront sweeping in from the contact side.
  const cellColor = (c: { col: number; row: number; color: string }): string => {
    if (!dye || dye.progress <= 0) return c.color;
    const nx = (c.col - spec.center) / (spec.cols || 1);
    const ny = (c.row - spec.rows / 2) / (spec.rows || 1);
    // Wavefront originates at the contact side (the cells facing the
    // partner dye FIRST) and sweeps across to the far side.
    const proj = 0.5 - (nx * dye.dirX + ny * dye.dirY);
    const thr = Math.max(0, Math.min(1, proj));
    if (dye.progress >= thr + 0.14) return dyedCellColor(spec, c, dye.palette);
    if (dye.progress >= thr) return mixHsl(c.color, dyedCellColor(spec, c, dye.palette), (dye.progress - thr) / 0.14);
    return c.color;
  };
  const rng = new Rng(xmur3(seed + ':mosh')());

  // bottom-most cell per column → streak source
  const colBottom: Record<number, { col: number; row: number; color: string }> = {};
  for (const c of spec.cells) {
    if (!colBottom[c.col] || c.row > colBottom[c.col].row) colBottom[c.col] = c;
  }
  // 1) downward streaks (behind body)
  for (const k of Object.keys(colBottom)) {
    const c = colBottom[+k];
    if (rng.next() < 0.5) continue;
    const len = 2 + Math.floor(rng.next() * 8);
    for (let s = 1; s <= len; s++) {
      g.globalAlpha = Math.max(0, 0.42 - (s / len) * 0.42);
      g.fillStyle = cellColor(c);
      const jit = rng.next() < 0.12 ? cell * (rng.next() < 0.5 ? -1 : 1) : 0;
      g.fillRect(ox + c.col * cell + jit, oy + (c.row + s) * cell, cell, cell);
    }
  }
  g.globalAlpha = 1;
  // 2) body with one glitch-shifted row
  const shiftRow = Math.floor(rng.next() * spec.rows);
  const shiftAmt = rng.next() < 0.55 ? (1 + Math.floor(rng.next() * 3)) * cell : 0;
  for (const c of spec.cells) {
    g.globalAlpha = c.alpha;
    g.fillStyle = cellColor(c);
    const sx = c.row === shiftRow ? shiftAmt : 0;
    g.fillRect(ox + c.col * cell + sx, oy + c.row * cell, cell, cell);
  }
  g.globalAlpha = 1;
  // 3) glitch flecks
  const flecks = 2 + Math.floor(rng.next() * 6);
  for (let i = 0; i < flecks; i++) {
    const src = spec.cells[Math.floor(rng.next() * spec.cells.length)];
    if (!src) continue;
    g.globalAlpha = 0.6;
    g.fillStyle = cellColor(src);
    g.fillRect(ox + src.col * cell + (1 + Math.floor(rng.next() * 5)) * cell, oy + src.row * cell, cell, cell);
  }
  g.globalAlpha = 1;
  // eyes (crisp)
  const gz = Math.max(-1, Math.min(1, gaze));
  const y = oy + spec.eyes.row * cell;
  const eye = (c0: number) => {
    const x = ox + c0 * cell;
    g.fillStyle = '#f4f2ec'; g.fillRect(x, y, cell * 2, cell);
    g.fillStyle = '#111'; g.fillRect(x + (gz * 0.5 + 0.5) * cell, y, cell, cell);
  };
  eye(spec.eyes.L0); eye(spec.eyes.R0);
}
