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

export type Costume = 'pumpkin' | 'witch' | 'ghost' | 'mummy' | 'zombie';
export const COSTUMES: Costume[] = ['pumpkin', 'witch', 'ghost', 'mummy', 'zombie'];

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
  ['mummy', /mumm(y|ies)|pharaoh|bandage|木乃伊|法老/i],
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
  } else if (kind === 'mummy') {
    // wrapped in bandages that follow the spore's own outline: strips run
    // row by row with a slight slant, thin gaps show the body underneath,
    // the eyes peek out of a slit, and one loose end trails away
    const m = (x: number, y: number) =>
      x >= 0 && y >= 0 && x < spec.cols && y < spec.rows && spec.mask[y * spec.cols + x];
    const bottom = Math.min(spec.rows - 1, er + 6);
    const wrapped = (x: number, y: number) =>
      y >= h.top && y <= bottom && y !== er && (m(x, y) || (y < er && (m(x - 1, y) || m(x + 1, y))));
    for (let y = h.top; y <= bottom; y++) {
      if (y === er) continue;                                         // eye slit
      for (let x = -1; x <= spec.cols; x++) {
        if (!wrapped(x, y)) continue;
        const edge = !wrapped(x - 1, y) || !wrapped(x + 1, y) || !wrapped(x, y - 1);
        const seam = ((x + 2 * y) % 5 + 5) % 5 === 0;                 // slanted wrap lines
        const gap = ((x * 7 + y * 3) % 13 + 13) % 13 === 0 && y > h.top + 1;
        if (gap) continue;                                            // a glimpse of the body
        px(x, y, seam ? '#a8986f' : edge ? '#cdbf98' : y % 2 ? '#efe6cc' : '#e4d8b8', 1);
      }
    }
    // dark rim around the eye slit so the eyes read
    for (let x = spec.eyes.L0 - 1; x <= spec.eyes.R0 + 2; x++) {
      if (!isEye(spec, x, er) && m(x, er)) px(x, er, '#4a3f2e', 0.7);
    }
    // a loose bandage end trailing off the right side
    let rx = -1;
    for (let c = 0; c < spec.cols; c++) if (m(c, er + 2)) rx = c;
    if (rx >= 0) {
      const wob = Math.round(Math.sin(t * 2.2));
      for (let k = 1; k <= 4; k++) px(rx + k, er + 2 + (k >> 1) + (k === 4 ? wob : 0), k % 2 ? '#efe7d2' : '#d8cdb0', 0.95 - k * 0.12);
    }
  } else if (kind === 'zombie') {
    // undead: clean zombie-green skin (keeping the spore's own light and
    // shade), a few scraps of its old colour like torn clothes, arms held
    // out in front, one staring red eye, one droopy lid, a stitched scar
    const m = (x: number, y: number) =>
      x >= 0 && y >= 0 && x < spec.cols && y < spec.rows && spec.mask[y * spec.cols + x];
    for (const c of spec.cells) {
      if (isEye(spec, c.col, c.row)) continue;
      if ((c.col * 5 + c.row * 11) % 9 === 0 && c.row > er) continue;   // torn-clothes scraps
      const lm = /,\s*([\d.]+)%\s*\)/.exec(c.color);
      const l = lm ? Number(lm[1]) : 55;
      px(c.col, c.row, l > 66 ? '#a6cf72' : l > 48 ? '#7fb055' : '#5a8a3c', c.alpha);
    }
    // arms reaching forward from the widest row below the eyes
    const ay = Math.min(spec.rows - 1, er + 2);
    let al = spec.cols, ar = -1;
    for (let c = 0; c < spec.cols; c++) if (m(c, ay)) { al = Math.min(al, c); ar = Math.max(ar, c); }
    if (ar >= 0) {
      for (let k = 1; k <= 3; k++) {
        const dy = k === 3 ? 1 : 0;                                   // hands droop a little
        px(al - k, ay + dy, k === 3 ? '#a6cf72' : '#6f9e48');
        px(ar + k, ay + dy, k === 3 ? '#a6cf72' : '#6f9e48');
      }
      px(al - 1, ay + 1, '#5a8a3c', 0.8); px(ar + 1, ay + 1, '#5a8a3c', 0.8);   // sleeve shadow
    }
    // eyes: left stares (white, tiny red pupil); right is half shut
    const L = spec.eyes.L0, R = spec.eyes.R0;
    for (const x of [L - 1, L + 2, R - 1, R + 2]) if (m(x, er)) px(x, er, '#355a24');
    for (let x = L; x <= R + 1; x++) if (m(x, er - 1)) px(x, er - 1, '#3f6a2a', 0.7);
    px(L, er, '#f4f1e2'); px(L + 1, er, '#f4f1e2');
    g.globalAlpha = 1; g.fillStyle = '#c0281e';
    g.fillRect(ox + (L + 0.7) * cell, oy + (er + 0.3) * cell, cell * 0.5, cell * 0.5);
    px(R, er, '#f4f1e2'); px(R + 1, er, '#f4f1e2');
    g.globalAlpha = 1; g.fillStyle = '#3f6a2a';
    g.fillRect(ox + R * cell, oy + er * cell, cell * 2, cell * 0.5);          // droopy lid
    g.fillStyle = '#111';
    g.fillRect(ox + (R + 0.6) * cell, oy + (er + 0.5) * cell, cell * 0.6, cell * 0.5);
    // short diagonal scar with cross stitches on the cap
    const sx = Math.round(h.mid + 1), sy = Math.max(h.top + 1, er - 3);
    for (let k = 0; k < 3; k++) {
      if (!m(sx + k, sy + k - 1) && !m(sx + k, sy + k)) continue;
      px(sx + k, sy + k - 1, '#3a2626', 0.9);
      if (k !== 1) { px(sx + k - 1, sy + k - 1, '#3a2626', 0.5); px(sx + k + 1, sy + k - 1, '#3a2626', 0.5); }
    }
    // little mouth with one tooth
    const my = er + 2, mx = Math.round(h.mid) - 1;
    if (m(mx, my)) {                                                  // a thin crooked line
      g.globalAlpha = 1; g.fillStyle = '#2a3a1f';
      const lw = Math.max(1, cell * 0.3);
      g.fillRect(ox + mx * cell, oy + (my + 0.35) * cell, cell * 3, lw);
      g.fillRect(ox + (mx + 2) * cell, oy + (my + 0.35) * cell - lw, cell, lw);
      g.fillStyle = '#f4f1e2';
      g.fillRect(ox + (mx + 1) * cell, oy + (my + 0.35) * cell + lw, cell * 0.4, lw);   // one tooth
    }
  }
  g.restore();
}
