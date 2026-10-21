/**
 * Halloween easter egg — pixel costumes drawn on top of a finished spore.
 *
 * Costumes are a post-pass after the eyes (never added to spec.cells), so
 * dyeing, the glitch row, hit shapes and the 3D export stay untouched.
 * Everything is in cell units around the spec's own cap: the costume
 * adapts to each spore's head width, and rows above row 0 are allowed
 * (callers leave `COSTUME_HEADROOM` rows of space above the sprite).
 */
import type { MosaicSpec } from './mosaic';

export type Costume = 'pumpkin' | 'witch' | 'ghost' | 'zombie';
export const COSTUMES: Costume[] = ['pumpkin', 'witch', 'ghost', 'zombie'];

/** rows a costume may reach above the spore's own grid (witch hat tip). */
export const COSTUME_HEADROOM = 9;

type G = CanvasRenderingContext2D;

// ---- when the easter egg is on ------------------------------------------
// Half a month either side of Halloween: Oct 16 – Nov 15 (visitor's local
// time), every year. Forced with ?season=halloween / ?season=off (testing).
export const HALLOWEEN_SPAN_DAYS = 15;
/** Pure date rule (no URL overrides) — exported for tests. */
export function inHalloweenWindow(now: Date): boolean {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const eve = new Date(now.getFullYear(), 9, 31);
  return Math.abs(Math.round((today.getTime() - eve.getTime()) / 86_400_000)) <= HALLOWEEN_SPAN_DAYS;
}
let activeMemo: boolean | null = null;
/** Is the easter egg on for this page load? (memoised; URL overrides win) */
export function halloweenActive(): boolean {
  if (activeMemo != null) return activeMemo;
  const q = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('season') : null;
  activeMemo = q === 'halloween' ? true : q === 'off' ? false : inHalloweenWindow(new Date());
  return activeMemo;
}

// ---- B · spells: a costume word in the whisper guarantees a costume -----
const SPELLS: Array<[Costume, RegExp]> = [
  ['pumpkin', /pumpkin|jack[- ]?o[- ]?lantern|halloween|trick or treat|南瓜|万圣/i],
  ['ghost', /ghost|\bboo+\b|spook|haunt|鬼|幽灵|幽靈/i],
  ['witch', /witch|wizard|spell|cauldron|巫|魔女|女巫/i],
  ['zombie', /zombie|undead|brains?\b|walking dead|僵尸|丧尸|殭屍|喪屍/i],
];
/** The costume a whispered sentence asks for (only while the egg is on). */
export function spellCostume(text: string | undefined | null): Costume | null {
  if (!text || !halloweenActive()) return null;
  for (const [c, re] of SPELLS) if (re.test(text)) return c;
  return null;
}

function hash(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) { h ^= id.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
/** Rare by design: a spell, or roughly 1 in 40 spores, fixed per id. */
export const COSTUME_RARITY = 40;
// ?hwrate=N previews a denser field (1 in N) without touching real data
const rarity = (() => {
  const n = typeof window !== 'undefined' ? Number(new URLSearchParams(window.location.search).get('hwrate')) : 0;
  return n >= 1 ? Math.floor(n) : COSTUME_RARITY;
})();
export function costumeFor(c: { id: string; costume?: Costume | null }): Costume | null {
  if (!halloweenActive()) return null;
  if (c.costume) return c.costume;
  const h = hash(c.id + ':hw');
  return h % rarity === 0 ? COSTUMES[(h >>> 8) % COSTUMES.length] : null;
}

// ---- C · candy -------------------------------------------------------------
const CANDY = ['#ef8526', '#7b4fd0', '#46a65a', '#e05a8a'];
/** A tiny wrapped sweet centred at (x,y), `s` px per pixel. */
export function drawCandy(g: G, x: number, y: number, s: number, i: number, spin: number) {
  const col = CANDY[i % CANDY.length];
  g.save();
  g.translate(x, y);
  g.rotate(spin);
  g.fillStyle = col;
  g.fillRect(-s, -s, s * 2, s * 2);                     // sweet
  g.fillStyle = '#ffffff'; g.globalAlpha *= 0.85;
  g.fillRect(-s, -s, s * 0.8, s * 0.8);                 // shine
  g.globalAlpha /= 0.85; g.fillStyle = col;
  g.fillRect(-s * 2.2, -s * 0.9, s, s * 1.8);           // twisted wrapper ends
  g.fillRect(s * 1.2, -s * 0.9, s, s * 1.8);
  g.restore();
}

interface Head {
  top: number;      // first row with any body cell
  left: number;     // widest cap extent (cols) between top and the eye row
  right: number;
  mid: number;      // centre column (float)
}

function head(spec: MosaicSpec): Head {
  let top = spec.rows, left = spec.cols, right = -1;
  for (let r = 0; r < spec.rows; r++) {
    for (let c = 0; c < spec.cols; c++) {
      if (!spec.mask[r * spec.cols + c]) continue;
      if (r < top) top = r;
      if (r <= spec.eyes.row) { left = Math.min(left, c); right = Math.max(right, c); }
    }
  }
  if (right < left) { left = spec.eyes.L0; right = spec.eyes.R0 + 1; }
  left = Math.min(left, spec.eyes.L0 - 1);
  right = Math.max(right, spec.eyes.R0 + 2);
  return { top, left, right, mid: (left + right) / 2 };
}

const isEye = (spec: MosaicSpec, c: number, r: number) =>
  r === spec.eyes.row && ((c >= spec.eyes.L0 && c <= spec.eyes.L0 + 1) || (c >= spec.eyes.R0 && c <= spec.eyes.R0 + 1));

/**
 * Draw `kind` over the spore at (ox,oy) top-left with cell px `cell`.
 * Call after the body and eyes have been painted.
 */
export function drawCostume(g: G, spec: MosaicSpec, ox: number, oy: number, cell: number, kind: Costume, t = 0) {
  const h = head(spec);
  const px = (c: number, r: number, color: string, a = 1) => {
    g.globalAlpha = a;
    g.fillStyle = color;
    g.fillRect(ox + c * cell, oy + r * cell, cell, cell);
  };
  g.save();
  g.imageSmoothingEnabled = false;
  const er = spec.eyes.row;
  if (kind === 'pumpkin') {
    // a round pumpkin shell over the cap, eyes looking out of carved holes
    const l = h.left - 2, r = h.right + 2;
    const t0 = h.top - 1, b = er + 1;
    const cx = (l + r) / 2, cy = (t0 + b) / 2;
    const rx = (r - l) / 2 + 0.6, ry = (b - t0) / 2 + 0.6;
    for (let y = t0; y <= b; y++) {
      for (let x = l; x <= r; x++) {
        let d = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2;
        const capCell = y < er && x >= 0 && x < spec.cols && spec.mask[y * spec.cols + x];
        if (d > 1 && !capCell) continue;
        d = Math.min(d, 0.99);
        if (isEye(spec, x, y)) continue;
        const rib = Math.abs(Math.round((x - cx) / 2.2)) % 2 === 1;
        let col = rib ? '#d8661a' : '#ef8526';
        if (d > 0.78) col = '#b9530f';                         // shaded rim
        if (y === t0 + 1 && !rib && x < cx) col = '#f8a54e';   // top-left highlight
        px(x, y, col);
      }
    }
    // carved triangles over each eye + glow rim
    for (const e0 of [spec.eyes.L0, spec.eyes.R0]) {
      px(e0, er - 1, '#ffcf5a'); px(e0 + 1, er - 1, '#ffcf5a');
      px(e0 - 1, er, '#3b1906'); px(e0 + 2, er, '#3b1906');
      px(e0 + (e0 === spec.eyes.L0 ? 1 : 0), er - 2, '#3b1906');
    }
    // jagged carved mouth on the bottom row of the shell
    for (let x = Math.ceil(l + 1.5); x <= Math.floor(r - 1.5); x++) {
      px(x, b, (x - l) % 2 ? '#ffcf5a' : '#3b1906', 0.95);
    }
    // stem + leaf
    const sc = Math.round(cx);
    px(sc, t0 - 1, '#4f7d2a'); px(sc + 1, t0 - 1, '#7fb446', 0.85);
  } else if (kind === 'witch') {
    // the hat sits ON the head: the brim crosses the cap two rows down,
    // so the top of the spore disappears under the crown
    const brim = Math.max(h.top + 1, Math.min(h.top + 2, er - 2));
    let bl = spec.cols, br = -1;
    for (let y = h.top; y <= brim; y++)
      for (let c = 0; c < spec.cols; c++) if (spec.mask[y * spec.cols + c]) { bl = Math.min(bl, c); br = Math.max(br, c); }
    if (br < bl) { bl = h.left; br = h.right; }
    const l = bl - 2, r = br + 2;
    for (let x = l; x <= r; x++) px(x, brim, '#2a1d38');            // brim
    px(l, brim, '#2a1d38', 0.6); px(r, brim, '#2a1d38', 0.6);
    const band = brim - 1;
    const w0 = Math.max(5, Math.round((br - bl + 1) * 0.85));
    let c0 = Math.round((bl + br) / 2 - w0 / 2 + 0.5), c1 = c0 + w0 - 1;
    for (let c = 0; c < spec.cols; c++) if (spec.mask[band * spec.cols + c]) { c0 = Math.min(c0, c); c1 = Math.max(c1, c); }
    for (let x = c0; x <= c1; x++) px(x, band, '#7b4fd0');           // band
    px(Math.round((bl + br) / 2), band, '#f0c445');                  // buckle
    // crown: covers every cap cell above the band, then a short cone
    const mid = (bl + br) / 2;
    let w = w0 - 1;
    for (let k = 1; k <= 5 && w > 0; k++, w -= k % 2 ? 1 : 0) {
      const y = band - k;
      let cs = Math.round(mid - w / 2 + 0.5) + (k >= 4 ? 1 : 0), ce = cs + w - 1;
      if (y >= 0) for (let c = 0; c < spec.cols; c++) if (spec.mask[y * spec.cols + c]) { cs = Math.min(cs, c); ce = Math.max(ce, c); }
      for (let x = cs; x <= ce; x++) px(x, y, x === cs ? '#3a2950' : '#2a1d38');
    }
    for (let y = band - 6; y >= h.top; y--) {                         // very tall caps
      for (let c = 0; c < spec.cols; c++) if (spec.mask[y * spec.cols + c]) px(c, y, '#2a1d38');
    }
    px(Math.round(mid) + 2, Math.min(band - 6, h.top - 1), '#2a1d38');
  } else if (kind === 'ghost') {
    // a sheet that follows the spore's own silhouette (mask grown by one
    // cell), hanging a few rows past the eyes with a wavy hem
    const t0 = h.top - 1, b = Math.min(spec.rows, er + 3);
    const cx = h.mid;
    const wob = Math.round(Math.sin(t * 2) * 0.5);
    const m = (x: number, y: number) =>
      x >= 0 && y >= 0 && x < spec.cols && y < spec.rows && spec.mask[y * spec.cols + x];
    const inSheet = (x: number, y: number) => {
      if (y < t0 || y > b) return false;
      if (!(m(x, y) || m(x - 1, y) || m(x + 1, y) || m(x, y + 1) || m(x, y - 1))) return false;
      return !(y === b && (x + wob) % 3 === 2);                      // wavy hem
    };
    for (let y = t0 - 1; y <= b + 1; y++) {
      for (let x = -1; x <= spec.cols; x++) {
        if (inSheet(x, y)) {
          if (isEye(spec, x, y)) continue;
          const shade = !inSheet(x + 1, y) || y === b ? '#d9dcec' : '#fbfbff';
          px(x, y, shade, 0.96);
        } else if (inSheet(x - 1, y) || inSheet(x + 1, y) || inSheet(x, y - 1) || (inSheet(x, y + 1) && y < b)) {
          px(x, y, '#8d90a8', 0.55);                                  // soft outline
        }
      }
    }
    // eye holes: dark rims so the spore's eyes read through the sheet
    for (const e0 of [spec.eyes.L0, spec.eyes.R0]) {
      px(e0 - 1, er, '#2c2d3e', 0.5); px(e0 + 2, er, '#2c2d3e', 0.5);
    }
    px(Math.round(cx), er + 2, '#2c2d3e', 0.55);                      // tiny "o" mouth
  } else if (kind === 'zombie') {
    // undead: sickly green skin, a stitched scar across the cap, one eye
    // sewn shut, a stitched grin and a loose bandage across the body
    for (const c of spec.cells) px(c.col, c.row, '#7f9b4e', 0.38 * c.alpha);
    const sy = Math.min(er - 2, h.top + 2);
    let sl = spec.cols, sr = -1;
    for (let c = 0; c < spec.cols; c++) if (spec.mask[sy * spec.cols + c]) { sl = Math.min(sl, c); sr = Math.max(sr, c); }
    for (let x = sl + 1; x < sr; x++) {
      px(x, sy, '#3b2a2a', 0.85);                                   // scar
      if ((x - sl) % 2 === 0) { px(x, sy - 1, '#3b2a2a', 0.6); px(x, sy + 1, '#3b2a2a', 0.6); }
    }
    // left eye sewn into an X, right eye bloodshot
    const L = spec.eyes.L0;
    px(L, er, '#cfd6b4'); px(L + 1, er, '#cfd6b4');
    g.globalAlpha = 1; g.fillStyle = '#2b1f1f';
    const ex = ox + L * cell, ey = oy + er * cell, lw = Math.max(1, cell * 0.28);
    for (let i = 0; i < 2 * cell; i += lw) {
      g.fillRect(ex + i, ey + (i / 2), lw, lw);
      g.fillRect(ex + i, ey + cell - lw - (i / 2), lw, lw);
    }
    const R = spec.eyes.R0;
    px(R, er, '#e9e6cf'); px(R + 1, er, '#e9e6cf');
    g.globalAlpha = 1; g.fillStyle = '#b3261e';
    g.fillRect(ox + (R + 0.55) * cell, oy + (er + 0.2) * cell, cell * 0.6, cell * 0.6);
    // stitched grin
    const my = er + 2;
    if (my < spec.rows) {
      for (let x = L; x <= R + 1; x++) {
        if (!spec.mask[my * spec.cols + x]) continue;
        px(x, my, '#2b1f1f', 0.8);
        if ((x - L) % 2 === 1) { px(x, my - 1, '#2b1f1f', 0.55); px(x, my + 1, '#2b1f1f', 0.55); }
      }
    }
    // a loose bandage wrapped diagonally across the lower body
    for (let k = 0; k < spec.cols + 4; k++) {
      const x = k - 1, y = er + 4 + Math.floor(k / 3);
      if (y >= spec.rows) break;
      if (!(spec.mask[y * spec.cols + x] || spec.mask[y * spec.cols + x - 1])) continue;
      px(x, y, k % 3 === 1 ? '#d8cdb0' : '#efe7d2', 0.95);
    }
  }
  g.restore();
}
