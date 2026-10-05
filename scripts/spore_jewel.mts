/**
 * spore_jewel — turn a whispered sentence into a wearable spore.
 *
 * Same engine, same hash, same spore number as the site and the brick
 * companion (scripts/spore3d.mts) — but the body is flattened into a
 * small relief plaque that hangs from a ring: a pendant, a charm, or a
 * mirrored pair of earrings.
 *
 *   back plate   the full silhouette (mask) printed solid — guarantees the
 *                piece is one connected part even where the dither is sparse
 *   relief       every filled cell stands proud of the plate; wispy edge
 *                cells (alpha < 0.9) stand half as high, so the "dither"
 *                stays legible as texture in a single colour
 *   eyes         white cells raised a touch higher, pupils sunk to the
 *                plate — the face reads in mono, and is its own colour
 *                when split for a multi-material printer
 *   loop         a round ring (jump-ring ready) grown from the top edge,
 *                or a drilled hole for laser-cut acrylic
 *   back         the spore number MYC-XXXXXX engraved in a 3×5 pixel font
 *
 * Outputs (out/jewel/<name>*):
 *   .stl   mm, one shell (ring overlaps the body — every slicer unions it)
 *   .ply   per-face colour preview
 *   .svg   front view in mm: cells + cut outline (laser / acrylic / enamel)
 *   .json  meta (spore number, size, weight estimate, cell count)
 *   --split   one STL per colour group (base / palette band / white / black)
 *             + <name>_colors.txt for filament assignment
 *
 *   npx tsx scripts/spore_jewel.mts --text "…" [--piece pendant|earring|charm]
 *       [--family dreamy] [--size 32] [--cell 2.4] [--base 1.6] [--relief 0.8]
 *       [--loop ring|hole|none] [--pair] [--split] [--no-id] [--out out/jewel]
 */
import fs from 'node:fs';
import path from 'node:path';
import { buildMosaic, type MosaicCell } from '../src/core/mosaic';
import { xmur3 } from '../src/core/seed';
import { sporeId as makeSporeId } from '../src/core/sporeId';
import type { CharId } from '../src/data/characters';

// ---------- args ----------
const arg = (k: string, d?: string) => {
  const i = process.argv.indexOf(`--${k}`);
  return i >= 0 ? process.argv[i + 1] : d;
};
const flag = (k: string) => process.argv.includes(`--${k}`);
const FAMS = ['tender', 'calm', 'curious', 'dreamy', 'companion', 'lonely'] as const;
const text = arg('text', 'today, my heart feels like…')!;
const h0 = xmur3(text)();
const famArg = arg('family');
const charId = (famArg ? FAMS.indexOf(famArg as (typeof FAMS)[number]) : h0 % 6) as CharId;
if (charId < 0) throw new Error(`--family must be one of ${FAMS.join('|')}`);
const piece = arg('piece', 'pendant')!;
if (!['pendant', 'earring', 'charm'].includes(piece)) throw new Error('--piece pendant|earring|charm');
const intensity = Number(arg('intensity', '0.65'));
const density = Number(arg('density', '0.7'));
const tintHue = Number(arg('tint', String(h0 % 360)));
const id = `w:${h0.toString(16)}`;
const sporeId = makeSporeId({ text, id, charId });

// piece presets: target body height (mm) · plate · relief
const PRESET = {
  pendant: { size: 32, base: 1.6, relief: 0.8 },
  charm:   { size: 24, base: 1.4, relief: 0.7 },
  earring: { size: 20, base: 1.2, relief: 0.6 },
}[piece as 'pendant' | 'charm' | 'earring'];
const loopMode = arg('loop', 'ring')!;           // ring | hole | none
const PAIR = flag('pair') || piece === 'earring';
const SPLIT = flag('split');
const ENGRAVE = !flag('no-id');
const name = arg('name') ?? `jewel_${piece}_${FAMS[charId]}_${h0.toString(16).slice(0, 6)}`;
const outDir = arg('out', 'out/jewel')!;

// ---------- 1) the exact creature the site would grow ----------
const spec = buildMosaic({
  id, charId, intensity,
  morphology: { density, agitation: 0.4, tendrilCount: 5, glow: 0.5, tintHue, particles: false },
} as Parameters<typeof buildMosaic>[0]);
const { cols, rows, cells, eyes, palette, mask } = spec;

// cell size: --cell wins, else derive from the target height
const cell = Number(arg('cell', String(Math.round((Number(arg('size', String(PRESET.size))) / rows) * 10) / 10)));
const BASE = Number(arg('base', String(PRESET.base)));
const RELIEF = Number(arg('relief', String(PRESET.relief)));
const EYE_EXTRA = 0.3;                           // eye whites stand this much prouder
const ENG = Math.min(0.4, BASE * 0.3);           // engraving depth into the back
const SUB = 4;                                   // fine pixels per cell (engraving grid)
const q = cell / SUB;

// ---------- colours ----------
type RGB = [number, number, number];
const hslRe = /hsl\((-?\d+),(\d+)%,(\d+)%\)/;
const hsl2rgb = (h: number, s: number, l: number): RGB => {
  h = ((h % 360) + 360) % 360;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    return l - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)));
  };
  return [f(0), f(8), f(4)].map((v) => Math.round(v * 255)) as RGB;
};
const parseHsl = (c: string): [number, number, number] => {
  const m = c.match(hslRe);
  return m ? [+m[1], +m[2] / 100, +m[3] / 100] : [0, 0, 0.7];
};
const rgbOf = (c: string): RGB => hsl2rgb(...parseHsl(c));
const hex = (c: RGB) => `#${c.map((n) => n.toString(16).padStart(2, '0')).join('')}`;
const WHITE: RGB = [246, 246, 241];
const BLACK: RGB = [18, 18, 18];
const g0 = palette.stops[0];
const BASE_RGB = hsl2rgb(g0.h, g0.s * 0.55, Math.max(0.2, g0.l - 0.14)); // plate: the creature's "ground"

// colour group of a cell = nearest palette stop (for --split filament bins)
const groupOf = (c: string): number => {
  const [h, , l] = parseHsl(c);
  let best = 0, bd = 1e9;
  palette.stops.forEach((st, k) => {
    const dh = Math.abs((((h - st.h) % 360) + 540) % 360 - 180);
    const d = dh / 60 + Math.abs(l - st.l) * 4;
    if (d < bd) { bd = d; best = k; }
  });
  return best;
};

// ---------- 2) the 2D plan: one entry per mosaic cell ----------
// kind: 0 plate only · 1 filled · 2 wispy · 3 eye white · 4 pupil
interface Plan { kind: number; rgb: RGB; group: string }
const plan = new Map<string, Plan>();
const K = (c: number, r: number) => `${c},${r}`;
for (let r = 0; r < rows; r++)
  for (let c = 0; c < cols; c++)
    if (mask[r * cols + c]) plan.set(K(c, r), { kind: 0, rgb: BASE_RGB, group: 'base' });
for (const cl of cells as MosaicCell[])
  plan.set(K(cl.col, cl.row), { kind: cl.alpha < 0.9 ? 2 : 1, rgb: rgbOf(cl.color), group: `band${groupOf(cl.color)}` });
for (const [c, kind] of [[eyes.L0, 3], [eyes.L0 + 1, 4], [eyes.R0, 4], [eyes.R0 + 1, 3]] as Array<[number, number]>)
  plan.set(K(c, eyes.row), { kind, rgb: kind === 3 ? WHITE : BLACK, group: kind === 3 ? 'white' : 'black' });

// keep the largest 4-connected component of the plate (a skipped thin row can strand the stem tip)
{
  const seen = new Set<string>(); let best: string[] = [];
  for (const k of plan.keys()) {
    if (seen.has(k)) continue;
    const comp: string[] = []; const st = [k]; seen.add(k);
    while (st.length) {
      const cur = st.pop()!; comp.push(cur);
      const [c, r] = cur.split(',').map(Number);
      for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const n = K(c + dc, r + dr);
        if (plan.has(n) && !seen.has(n)) { seen.add(n); st.push(n); }
      }
    }
    if (comp.length > best.length) best = comp;
  }
  const keep = new Set(best);
  for (const k of [...plan.keys()]) if (!keep.has(k)) plan.delete(k);
}

// ---------- 3) 3×5 pixel font for the back engraving ----------
const FONT: Record<string, string[]> = {
  '0': ['111','101','101','101','111'], '1': ['010','110','010','010','111'],
  '2': ['111','001','111','100','111'], '3': ['111','001','111','001','111'],
  '4': ['101','101','111','001','001'], '5': ['111','100','111','001','111'],
  '6': ['111','100','111','101','111'], '7': ['111','001','001','010','010'],
  '8': ['111','101','111','101','111'], '9': ['111','101','111','001','111'],
  'A': ['010','101','111','101','101'], 'B': ['110','101','110','101','110'],
  'C': ['111','100','100','100','111'], 'D': ['110','101','101','101','110'],
  'E': ['111','100','111','100','111'], 'F': ['111','100','111','100','100'],
  'G': ['111','100','101','101','111'], 'H': ['101','101','111','101','101'],
  'J': ['001','001','001','101','111'], 'K': ['101','101','110','101','101'],
  'M': ['101','111','111','101','101'], 'N': ['110','101','101','101','101'],
  'P': ['111','101','111','100','100'], 'Q': ['111','101','101','111','001'],
  'R': ['110','101','110','101','101'], 'S': ['111','100','111','001','111'],
  'T': ['111','010','010','010','010'], 'V': ['101','101','101','101','010'],
  'W': ['101','101','111','111','101'], 'X': ['101','101','010','101','101'],
  'Y': ['101','101','010','010','010'], 'Z': ['111','001','010','100','111'],
  '-': ['000','000','111','000','000'], ' ': ['000','000','000','000','000'],
};
const textPixels = (s: string): boolean[][] => {
  const rowsPx: boolean[][] = Array.from({ length: 5 }, () => []);
  [...s].forEach((ch, i) => {
    const g = FONT[ch] ?? FONT[' '];
    for (let y = 0; y < 5; y++) {
      for (let x = 0; x < 3; x++) rowsPx[y].push(g[y][x] === '1');
      if (i < s.length - 1) rowsPx[y].push(false);
    }
  });
  return rowsPx;
};

// ---------- 4) build one piece (optionally mirrored) ----------
type V = [number, number, number];
interface Tri { a: V; b: V; c: V; col: RGB; group: string }

function buildPiece(mirror: boolean) {
  // fine grid: FX × FY columns of q mm; each column solid between z-level indices [zb, zt)
  const FX = cols * SUB, FY = rows * SUB;
  const Z = [0, ENG, BASE, BASE + RELIEF / 2, BASE + RELIEF, BASE + RELIEF + EYE_EXTRA];
  const zb = new Int8Array(FX * FY).fill(-1), zt = new Int8Array(FX * FY).fill(-1);
  const colr: RGB[] = new Array(FX * FY);
  const grp: string[] = new Array(FX * FY);
  const fi = (x: number, y: number) => x + FX * y;
  const topOf = [2, 4, 3, 5, 3];                 // z-level index per kind (pupil: half relief)
  for (const [k, p] of plan) {
    const [c0, r] = k.split(',').map(Number);
    const c = mirror ? cols - 1 - c0 : c0;
    const yCell = rows - 1 - r;                    // y up
    for (let dy = 0; dy < SUB; dy++)
      for (let dx = 0; dx < SUB; dx++) {
        const i = fi(c * SUB + dx, yCell * SUB + dy);
        zb[i] = 0; zt[i] = topOf[p.kind]; colr[i] = p.rgb; grp[i] = p.group;
      }
  }

  // loop anchor: topmost plate cell nearest the centre
  let topRow = -1, topCol = 0;
  for (let r = 0; r < rows && topRow < 0; r++) {
    const cs: number[] = [];
    for (let c = 0; c < cols; c++) if (plan.has(K(c, r))) cs.push(c);
    if (cs.length) {
      topRow = r;
      topCol = cs.reduce((b, c) => Math.abs(c - (cols - 1) / 2) < Math.abs(b - (cols - 1) / 2) ? c : b, cs[0]);
    }
  }
  if (mirror) topCol = cols - 1 - topCol;
  const topY = (rows - topRow) * cell;
  const loopX = (topCol + 0.5) * cell;
  const RO = Math.max(2.4, cell * 1.1), RI = Math.max(1.2, RO * 0.5);
  const SINK = Math.min(0.8, cell * 0.4);        // how deep the ring sits into the body
  const loopY = topY + RO - SINK;

  // --loop hole: drill through the top cells instead (laser-friendly)
  let hole: { x: number; y: number; r: number } | null = null;
  if (loopMode === 'hole') {
    hole = { x: loopX, y: topY - cell * 0.75, r: Math.max(0.7, cell * 0.3) };
    for (let y = 0; y < FY; y++)
      for (let x = 0; x < FX; x++) {
        const px = (x + 0.5) * q, py = (y + 0.5) * q;
        if (Math.hypot(px - hole.x, py - hole.y) <= hole.r) zb[fi(x, y)] = -1;
      }
  }

  // engraving: the spore number on the back, where the plate is wide enough
  let engraved = false;
  if (ENGRAVE && q >= 0.33) {
    const Hh = 5, PAD = 1;
    const eyeY = (rows - 1 - eyes.row) * SUB;
    let px: boolean[][] = [], W = 0;
    let bestY = -1, bestD = 1e9, bestX = 0;
    for (const label of [sporeId, sporeId.slice(4)]) {   // "MYC-TRY6HP", then just "TRY6HP"
      if (bestY >= 0) break;
      px = textPixels(label); W = px[0].length;
      for (let y = 0; y + Hh + 2 * PAD <= FY; y++) {
      // widest run of solid, un-holed columns common to all rows of the text band
      let runL = -1, bestL = 0, bestLen = 0;
      for (let x = 0; x <= FX; x++) {
        let ok = x < FX;
        for (let yy = y; ok && yy < y + Hh + 2 * PAD; yy++) ok = zb[fi(x, yy)] === 0;
        if (ok) { if (runL < 0) runL = x; }
        else if (runL >= 0) { if (x - runL > bestLen) { bestLen = x - runL; bestL = runL; } runL = -1; }
      }
        if (bestLen >= W + 2 * PAD && Math.abs(y - eyeY) < bestD) {
          bestD = Math.abs(y - eyeY); bestY = y; bestX = bestL + Math.floor((bestLen - W) / 2);
        }
      }
    }
    if (bestY >= 0) {
      for (let yy = 0; yy < Hh; yy++)
        for (let xx = 0; xx < W; xx++) {
          // text reads correctly when the piece is flipped over (mirror x on the back)
          if (!px[Hh - 1 - yy][mirror ? xx : W - 1 - xx]) continue;
          zb[fi(bestX + xx, bestY + PAD + yy)] = 1;
        }
      engraved = true;
    }
  }

  // mesh the columns: per z-slab voxel with face culling → watertight shell.
  // A slab below the plate top (k < 2) belongs to the 'base' group; relief
  // slabs carry the cell's colour group. `only` restricts the mesh to one
  // group and culls only against that group, so each --split part is closed.
  const P = (x: number, y: number, z: number): V => [x * q, y * q, z];
  const groupAt = (i: number, k: number) => (k < 2 ? 'base' : grp[i]);
  const colourAt = (i: number, k: number) => (k < 2 ? BASE_RGB : colr[i]);
  const mesh = (only?: string): Tri[] => {
    const tris: Tri[] = [];
    const solid = (x: number, y: number, k: number) => {
      if (x < 0 || y < 0 || x >= FX || y >= FY) return false;
      const i = fi(x, y);
      if (zb[i] < 0 || k < zb[i] || k >= zt[i]) return false;
      return only === undefined || groupAt(i, k) === only;
    };
    const quad = (a: V, b: V, c: V, d: V, col: RGB, group: string) => {
      tris.push({ a, b, c, col, group }); tris.push({ a, b: c, c: d, col, group });
    };
    for (let y = 0; y < FY; y++)
      for (let x = 0; x < FX; x++) {
        const i = fi(x, y);
        if (zb[i] < 0) continue;
        for (let k = zb[i]; k < zt[i]; k++) {
          const g = groupAt(i, k);
          if (only !== undefined && g !== only) continue;
          const col = colourAt(i, k);
          const z0 = Z[k], z1 = Z[k + 1];
          const x0 = x, x1 = x + 1, y0 = y, y1 = y + 1;
          if (!solid(x + 1, y, k)) quad(P(x1, y0, z0), P(x1, y1, z0), P(x1, y1, z1), P(x1, y0, z1), col, g);
          if (!solid(x - 1, y, k)) quad(P(x0, y0, z1), P(x0, y1, z1), P(x0, y1, z0), P(x0, y0, z0), col, g);
          if (!solid(x, y + 1, k)) quad(P(x0, y1, z0), P(x0, y1, z1), P(x1, y1, z1), P(x1, y1, z0), col, g);
          if (!solid(x, y - 1, k)) quad(P(x0, y0, z0), P(x1, y0, z0), P(x1, y0, z1), P(x0, y0, z1), col, g);
          if (!solid(x, y, k + 1)) quad(P(x0, y0, z1), P(x1, y0, z1), P(x1, y1, z1), P(x0, y1, z1), col, g);
          if (!solid(x, y, k - 1)) quad(P(x0, y0, z0), P(x0, y1, z0), P(x1, y1, z0), P(x1, y0, z0), col, g);
        }
      }
    return tris;
  };
  const tris = mesh();
  const quad = (a: V, b: V, c: V, d: V, col: RGB, group: string) => {
    tris.push({ a, b, c, col, group }); tris.push({ a, b: c, c: d, col, group });
  };
  const groups = new Set<string>();
  for (let i = 0; i < FX * FY; i++) if (zb[i] >= 0) for (let k = zb[i]; k < zt[i]; k++) groups.add(groupAt(i, k));

  // the ring: an annulus extruded to plate height, overlapping the body by SINK
  let ring: { x: number; y: number; ro: number; ri: number } | null = null;
  if (loopMode === 'ring') {
    ring = { x: loopX, y: loopY, ro: RO, ri: RI };
    const N = 48, z0 = 0, z1 = BASE;
    const pt = (rad: number, a: number, z: number): V => [loopX + Math.cos(a) * rad, loopY + Math.sin(a) * rad, z];
    for (let k = 0; k < N; k++) {
      const a0 = (k / N) * Math.PI * 2, a1 = ((k + 1) / N) * Math.PI * 2;
      quad(pt(RO, a0, z0), pt(RO, a1, z0), pt(RO, a1, z1), pt(RO, a0, z1), BASE_RGB, 'base');   // outer wall
      quad(pt(RI, a0, z1), pt(RI, a1, z1), pt(RI, a1, z0), pt(RI, a0, z0), BASE_RGB, 'base');   // inner wall
      quad(pt(RI, a0, z1), pt(RO, a0, z1), pt(RO, a1, z1), pt(RI, a1, z1), BASE_RGB, 'base');   // top
      quad(pt(RO, a0, z0), pt(RI, a0, z0), pt(RI, a1, z0), pt(RO, a1, z0), BASE_RGB, 'base');   // bottom
    }
  }

  // volume (signed tetrahedra) → weight estimate
  let vol = 0;
  for (const t of tris) {
    const [a, b, c] = [t.a, t.b, t.c];
    vol += (a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6;
  }
  // ring/body overlap is counted twice; subtract the sunk cap roughly
  const w = Math.max(cell, SINK > 0 ? 2 * Math.sqrt(Math.max(0, RO * RO - (RO - SINK) ** 2)) : 0);
  if (ring) vol -= SINK * w * BASE * 0.7;
  const ringTris = ring ? tris.slice(tris.length - 48 * 8) : [];
  const parts = (): Map<string, Tri[]> => {
    const m = new Map<string, Tri[]>();
    for (const g of [...groups].sort()) m.set(g, g === 'base' ? [...mesh('base'), ...ringTris] : mesh(g));
    return m;
  };
  return { tris, parts, ring, hole, engraved, FX, FY, volMM3: Math.abs(vol), loopTop: ring ? loopY + RO : topY };
}

// ---------- 5) writers ----------
fs.mkdirSync(outDir, { recursive: true });

function writeSTL(file: string, tris: Tri[], header: string) {
  const buf = Buffer.alloc(84 + tris.length * 50);
  buf.write(header.slice(0, 79), 0, 'ascii');
  buf.writeUInt32LE(tris.length, 80);
  let o = 84;
  for (const t of tris) {
    const ux = t.b[0] - t.a[0], uy = t.b[1] - t.a[1], uz = t.b[2] - t.a[2];
    const vx = t.c[0] - t.a[0], vy = t.c[1] - t.a[1], vz = t.c[2] - t.a[2];
    const n: V = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
    const len = Math.hypot(...n) || 1;
    for (const v of [n.map((c) => c / len) as V, t.a, t.b, t.c])
      for (const c of v) { buf.writeFloatLE(c, o); o += 4; }
    buf.writeUInt16LE(0, o); o += 2;
  }
  fs.writeFileSync(file, buf);
}

function writePLY(file: string, tris: Tri[]) {
  const L: string[] = ['ply', 'format ascii 1.0', `element vertex ${tris.length * 3}`,
    'property float x', 'property float y', 'property float z',
    'property uchar red', 'property uchar green', 'property uchar blue',
    `element face ${tris.length}`, 'property list uchar int vertex_indices', 'end_header'];
  for (const t of tris)
    for (const v of [t.a, t.b, t.c])
      L.push(`${v[0].toFixed(3)} ${v[1].toFixed(3)} ${v[2].toFixed(3)} ${t.col[0]} ${t.col[1]} ${t.col[2]}`);
  for (let i = 0; i < tris.length; i++) L.push(`3 ${i * 3} ${i * 3 + 1} ${i * 3 + 2}`);
  fs.writeFileSync(file, L.join('\n'));
}

// front view in mm. Layers: "art" (cells, printable) · "cut" (silhouette + hole, laser)
function writeSVG(file: string, mirror: boolean, r: ReturnType<typeof buildPiece>) {
  const W = cols * cell, H = r.loopTop;
  const M = 2;
  const rects: string[] = [];
  const outline: string[] = [];
  const has = (c: number, rr: number) => plan.has(K(mirror ? cols - 1 - c : c, rr));
  for (let rr = 0; rr < rows; rr++)
    for (let c = 0; c < cols; c++) {
      if (!has(c, rr)) continue;
      const p = plan.get(K(mirror ? cols - 1 - c : c, rr))!;
      const x = c * cell, y = (H - (rows - rr) * cell);
      const op = p.kind === 2 ? 0.55 : 1;
      rects.push(`<rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${cell}" height="${cell}" fill="${hex(p.rgb)}" fill-opacity="${op}"/>`);
      // boundary edges of the silhouette → cut layer
      const e = (x0: number, y0: number, x1: number, y1: number) =>
        outline.push(`M${x0.toFixed(2)} ${y0.toFixed(2)}L${x1.toFixed(2)} ${y1.toFixed(2)}`);
      if (!has(c + 1, rr)) e(x + cell, y, x + cell, y + cell);
      if (!has(c - 1, rr)) e(x, y, x, y + cell);
      if (!has(c, rr - 1)) e(x, y, x + cell, y);
      if (!has(c, rr + 1)) e(x, y + cell, x + cell, y + cell);
    }
  const loop = r.ring
    ? `<circle cx="${r.ring.x.toFixed(2)}" cy="${(H - r.ring.y).toFixed(2)}" r="${((r.ring.ro + r.ring.ri) / 2).toFixed(2)}" fill="none" stroke="${hex(BASE_RGB)}" stroke-width="${(r.ring.ro - r.ring.ri).toFixed(2)}"/>`
    : r.hole
      ? `<circle cx="${r.hole.x.toFixed(2)}" cy="${(H - r.hole.y).toFixed(2)}" r="${r.hole.r.toFixed(2)}" fill="#fff" stroke="#f00" stroke-width="0.05"/>`
      : '';
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${(W + 2 * M).toFixed(2)}mm" height="${(H + 2 * M).toFixed(2)}mm" viewBox="${-M} ${-M} ${(W + 2 * M).toFixed(2)} ${(H + 2 * M).toFixed(2)}">
  <title>${sporeId} · ${piece}${mirror ? ' (mirrored)' : ''}</title>
  <desc>${text.replace(/[<&]/g, ' ')}</desc>
  <g id="art" shape-rendering="crispEdges">
    ${rects.join('\n    ')}
    ${loop}
  </g>
  <g id="cut" fill="none" stroke="#f00" stroke-width="0.05">
    <path d="${outline.join('')}"/>
  </g>
</svg>
`;
  fs.writeFileSync(file, svg);
}

const variants: Array<[string, boolean]> = PAIR ? [['_L', false], ['_R', true]] : [['', false]];
const summary: Record<string, unknown>[] = [];
for (const [suffix, mirror] of variants) {
  const r = buildPiece(mirror);
  const base = path.join(outDir, name + suffix);
  writeSTL(`${base}.stl`, r.tris, `mycelium ${sporeId} ${piece}`);
  writePLY(`${base}.ply`, r.tris);
  writeSVG(`${base}.svg`, mirror, r);
  if (SPLIT) {
    const bill: string[] = [];
    for (const [g, ts] of r.parts()) {
      writeSTL(`${base}_${g}.stl`, ts, `mycelium ${sporeId} ${g}`);
      const col = g === 'base' ? BASE_RGB : g === 'white' ? WHITE : g === 'black' ? BLACK
        : (() => { const st = palette.stops[+g.slice(4)]; return hsl2rgb(st.h, st.s, st.l); })();
      bill.push(`${path.basename(base)}_${g}.stl\t${hex(col)}\t${ts.length / 2} faces`);
    }
    fs.writeFileSync(`${base}_colors.txt`, bill.join('\n') + '\n');
  }
  const wPLA = r.volMM3 / 1000 * 1.24, wResin = r.volMM3 / 1000 * 1.1;
  const info = {
    file: path.basename(base), mirror, sporeId, family: FAMS[charId], piece, text,
    cell, base: BASE, relief: RELIEF, loop: loopMode, engraved: r.engraved,
    widthMM: +(cols * cell).toFixed(1), heightMM: +r.loopTop.toFixed(1),
    thickMM: +(BASE + RELIEF + EYE_EXTRA).toFixed(2),
    cells: cells.length, plateCells: plan.size, tris: r.tris.length,
    volumeMM3: +r.volMM3.toFixed(0), gramsPLA: +wPLA.toFixed(2), gramsResin: +wResin.toFixed(2),
  };
  summary.push(info);
  console.log(`${info.file}: ${sporeId} ${piece} ${FAMS[charId]} · ${info.widthMM}×${info.heightMM}×${info.thickMM} mm · cell ${cell} · ${info.plateCells} cells · ~${info.gramsPLA} g PLA · id ${r.engraved ? 'engraved' : 'skipped (too small)'}`);
}
fs.writeFileSync(path.join(outDir, `${name}.json`), JSON.stringify(summary, null, 2));
