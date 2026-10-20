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

export type Costume = 'pumpkin' | 'witch' | 'ghost' | 'lantern';
export const COSTUMES: Costume[] = ['pumpkin', 'witch', 'ghost', 'lantern'];

/** rows a costume may reach above the spore's own grid (witch hat tip). */
export const COSTUME_HEADROOM = 9;

type G = CanvasRenderingContext2D;

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
  } else if (kind === 'lantern') {
    // no hat: carved cap lines + glowing triangle eyes + jagged grin
    for (const dx of [-2, 0, 2]) {
      const x = Math.round(h.mid + dx);
      for (let y = h.top + 1; y < er - 1; y++) {
        if (spec.mask[y * spec.cols + x]) px(x, y, '#1a0d05', 0.42);
      }
    }
    const flick = 0.85 + 0.15 * Math.sin(t * 9);
    for (const e0 of [spec.eyes.L0, spec.eyes.R0]) {
      for (let dx = -1; dx <= 2; dx++) px(e0 + dx, er, '#ffb02e', 0.25 * flick);   // halo
      px(e0, er, '#ff9a1f', flick); px(e0 + 1, er, '#ff9a1f', flick);
      px(e0 + (e0 === spec.eyes.L0 ? 1 : 0), er - 1, '#ffd36a', flick);
    }
    const my = er + 2;
    for (let x = spec.eyes.L0; x <= spec.eyes.R0 + 1; x++) {
      if (my < spec.rows && spec.mask[my * spec.cols + x]) {
        const yy = my - ((x - spec.eyes.L0) % 2);
        px(x, yy, '#1a0d05', 0.55); px(x, yy, '#ff9a1f', 0.8 * flick);
      }
    }
  }
  g.restore();
}
