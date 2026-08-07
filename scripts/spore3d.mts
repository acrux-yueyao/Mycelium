/**
 * spore3d — turn a whispered sentence into a printable LEGO-style
 * brick spore.
 *
 * Pipeline: the 2D mosaic engine's per-row silhouette (mask) is revolved
 * into a fine voxel solid, then chunked into big bricks (--chunk cells
 * per brick, default 2 → a body ~5-8 bricks wide). Every exposed brick
 * top grows a round stud; a light brick-level erosion keeps the
 * openwork; eyes are white bricks with a raised black tile. Colours are
 * the engine's palette bands. Same sentence → same spore, print after
 * print.
 *
 * Outputs:
 *   out/<name>.stl   binary STL, millimetres  (single-colour printing)
 *   out/<name>.ply   per-vertex-coloured mesh (full-colour preview/print)
 *   out/<name>.json  brick dump (renderers / debugging)
 *
 *   npx tsx scripts/spore3d.mts --text "..." [--family dreamy]
 *       [--chunk 2] [--cell 12] [--density 0.7] [--solid]
 */
import fs from 'node:fs';
import path from 'node:path';
import { buildMosaic } from '../src/core/mosaic';
import { Rng, xmur3 } from '../src/core/seed';
import type { CharId } from '../src/data/characters';

// ---------- args ----------
const arg = (k: string, d?: string) => {
  const i = process.argv.indexOf(`--${k}`);
  return i >= 0 ? process.argv[i + 1] : d;
};
const FAMS = ['tender', 'calm', 'curious', 'dreamy', 'companion', 'lonely'] as const;
const text = arg('text', 'today, my heart feels like…')!;
const h0 = xmur3(text)();
const famArg = arg('family');
const charId = (famArg ? FAMS.indexOf(famArg as (typeof FAMS)[number]) : h0 % 6) as CharId;
if (charId < 0) throw new Error(`--family must be one of ${FAMS.join('|')}`);
const intensity = Number(arg('intensity', '0.65'));
const density = Number(arg('density', '0.7'));
const tintHue = Number(arg('tint', String(h0 % 360)));
const G = Math.max(1, Number(arg('chunk', '2')));   // engine cells per brick
const cellMM = Number(arg('cell', '12'));           // printed size of one brick
const solid = process.argv.includes('--solid');
const id = `w:${h0.toString(16)}`;
const name = arg('name') ?? `spore_${FAMS[charId]}_${h0.toString(16).slice(0, 6)}`;

// ---------- 1) the exact creature the site would grow ----------
const spec = buildMosaic({
  id,
  charId,
  morphology: { density, agitation: 0.4, tendrilCount: 5, glow: 0.5, tintHue, particles: false },
  intensity,
});
const { cols, rows, palette, eyes, mask } = spec;
const center = (cols - 1) / 2;

// per-row silhouette half-width, straight from the engine's mask
const hw: number[] = [];
for (let r = 0; r < rows; r++) {
  let m = -1;
  for (let c = 0; c < cols; c++) if (mask[r * cols + c]) m = Math.max(m, Math.abs(c - center));
  hw.push(m < 0 ? 0 : m + 0.5);
}

// ---------- 2) revolve straight at brick resolution ----------
const X = Math.ceil(cols / G), Y = Math.ceil(rows / G), Z = Math.ceil(cols / G);
const grid = new Uint8Array(X * Y * Z);
const at = (x: number, y: number, z: number) => x + X * (y + Y * z);
const inb = (x: number, y: number, z: number) =>
  x >= 0 && y >= 0 && z >= 0 && x < X && y < Y && z < Z;
// brick row (bottom-up) → representative engine row (engine row 0 = top)
const rowOf = (y: number) =>
  Math.max(0, Math.min(rows - 1, rows - 1 - (y * G + Math.floor(G / 2))));
const radiusOf = (y: number) => {
  // widest engine row covered by this brick row, in brick units
  let m = 0;
  for (let g = 0; g < G; g++) {
    const r = rows - 1 - (y * G + g);
    if (r >= 0 && r < rows) m = Math.max(m, hw[r]);
  }
  return m / G;
};
for (let y = 0; y < Y; y++) {
  const radius = radiusOf(y);
  if (radius <= 0) continue;
  for (let x = 0; x < X; x++)
    for (let z = 0; z < Z; z++) {
      const u = x + 0.5 - X / 2;
      const w = z + 0.5 - Z / 2;
      if (u * u + w * w <= (radius + 0.3) * (radius + 0.3)) grid[at(x, y, z)] = 1;
    }
}

// ---------- 2b) brick-level openwork: a few missing bricks, a few hanging ones ----------
if (!solid) {
  const rng3 = new Rng(xmur3(`${id}:carve${G}`)());
  const removeP = 0.16 + (1 - density) * 0.22; // sparse creatures lose more bricks
  for (let y = 0; y < Y; y++) {
    const radius = radiusOf(y);
    if (radius <= 0) continue;
    for (let z = 0; z < Z; z++)
      for (let x = 0; x < X; x++) {
        const i = at(x, y, z);
        if (!grid[i]) continue;
        const u = x + 0.5 - X / 2;
        const w = z + 0.5 - Z / 2;
        const dist = Math.sqrt(u * u + w * w);
        if (dist > radius - 1 && rng3.next() < removeP) grid[i] = 0;
      }
  }
  // bottom row dissolves: outer bricks hang on only sometimes
  for (let z = 0; z < Z; z++)
    for (let x = 0; x < X; x++) {
      const i = at(x, 0, z);
      if (!grid[i]) continue;
      const u = x + 0.5 - X / 2;
      const w = z + 0.5 - Z / 2;
      if (Math.sqrt(u * u + w * w) > radiusOf(0) * 0.5 && rng3.next() < 0.45) grid[i] = 0;
    }
}

// keep the largest connected component
{
  const seen = new Uint8Array(X * Y * Z);
  let best: number[] = [];
  for (let i = 0; i < grid.length; i++) {
    if (!grid[i] || seen[i]) continue;
    const q = [i]; seen[i] = 1; const comp: number[] = [];
    while (q.length) {
      const j = q.pop()!; comp.push(j);
      const x = j % X, y = ((j / X) | 0) % Y, z = (j / (X * Y)) | 0;
      for (const [dx, dy, dz] of [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]]) {
        const nx = x + dx, ny = y + dy, nz = z + dz;
        if (!inb(nx, ny, nz)) continue;
        const k = at(nx, ny, nz);
        if (grid[k] && !seen[k]) { seen[k] = 1; q.push(k); }
      }
    }
    if (comp.length > best.length) best = comp;
  }
  grid.fill(0);
  for (const j of best) grid[j] = 1;
}

// ---------- 3) colour: engine palette bands per brick ----------
const rng = new Rng(xmur3(`${id}:3d`)());
const N = palette.stops.length;
const hsl2rgb = (h: number, s: number, l: number): [number, number, number] => {
  h = ((h % 360) + 360) % 360;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    return l - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)));
  };
  return [f(0), f(8), f(4)].map((v) => Math.round(v * 255)) as [number, number, number];
};
const colors = new Map<number, [number, number, number]>();
for (let y = 0; y < Y; y++)
  for (let z = 0; z < Z; z++)
    for (let x = 0; x < X; x++) {
      const i = at(x, y, z);
      if (!grid[i]) continue;
      const r = rowOf(y);
      const v = rows > 1 ? r / (rows - 1) : 0.5;
      let band = Math.floor(v * N);
      if (rng.next() < 0.12 + intensity * 0.18) band += rng.next() < 0.5 ? -1 : 1;
      band = Math.max(0, Math.min(N - 1, band));
      const st = palette.stops[band];
      const u = x + 0.5 - X / 2, w = z + 0.5 - Z / 2;
      const d = Math.sqrt(u * u + w * w) / (radiusOf(y) || 1);
      const L = Math.max(0.12, Math.min(0.9, st.l - 0.08 * d + rng.range(-0.03, 0.03)));
      if (palette.sparkle && rng.next() < 0.05) { colors.set(i, hsl2rgb(st.h, 0.6, 0.92)); continue; }
      colors.set(i, hsl2rgb(st.h, st.s, L));
    }

// ---------- 4) the face: white eye bricks + raised black tiles ----------
const WHITE: [number, number, number] = [246, 246, 241];
const BLACK: [number, number, number] = [18, 18, 18];
const eyeY = Math.max(0, Math.min(Y - 1, Math.floor((rows - 1 - eyes.row) / G)));
let exL = Math.floor((eyes.L0 + 0.5) / G);
let exR = Math.floor((eyes.R0 + 1) / G);
if (exL === exR) { exL = Math.max(0, exL - 1); }
const pupils: Array<{ x: number; y: number; z: number }> = [];
for (const ex of [exL, exR]) {
  if (ex < 0 || ex >= X) continue;
  // front-most brick in this column; force one if erosion ate it
  let zf = -1;
  for (let z = Z - 1; z >= 0; z--) if (grid[at(ex, eyeY, z)]) { zf = z; break; }
  if (zf < 0) continue;
  colors.set(at(ex, eyeY, zf), WHITE);
  pupils.push({ x: ex, y: eyeY, z: zf });
}

// ---------- 5) meshing: bricks + studs + pupil tiles ----------
const mm = cellMM;
type V = [number, number, number];
const tris: Array<{ a: V; b: V; c: V; col: [number, number, number] }> = [];
const P = (x: number, y: number, z: number): V => [x * mm, z * mm, y * mm]; // print z-up
const FACES: Array<{ d: V; q: [V, V, V, V] }> = [
  { d: [1, 0, 0],  q: [[1,0,0],[1,1,0],[1,1,1],[1,0,1]] },
  { d: [-1, 0, 0], q: [[0,0,1],[0,1,1],[0,1,0],[0,0,0]] },
  { d: [0, 1, 0],  q: [[0,1,0],[0,1,1],[1,1,1],[1,1,0]] },
  { d: [0, -1, 0], q: [[0,0,0],[1,0,0],[1,0,1],[0,0,1]] },
  { d: [0, 0, 1],  q: [[0,0,1],[1,0,1],[1,1,1],[0,1,1]] },
  { d: [0, 0, -1], q: [[0,0,0],[0,1,0],[1,1,0],[1,0,0]] },
];
const STUD_R = 0.3, STUD_H = 0.18, STUD_N = 16, SINK = 0.02;
const prism = (cx: number, cz: number, y0: number, y1: number, r: number, col: [number, number, number]) => {
  const ring0: V[] = [], ring1: V[] = [];
  for (let k = 0; k < STUD_N; k++) {
    const a = (k / STUD_N) * Math.PI * 2;
    ring0.push(P(cx + Math.cos(a) * r, y0, cz + Math.sin(a) * r));
    ring1.push(P(cx + Math.cos(a) * r, y1, cz + Math.sin(a) * r));
  }
  const c0 = P(cx, y0, cz), c1 = P(cx, y1, cz);
  for (let k = 0; k < STUD_N; k++) {
    const k2 = (k + 1) % STUD_N;
    tris.push({ a: ring0[k], b: ring1[k], c: ring1[k2], col });
    tris.push({ a: ring0[k], b: ring1[k2], c: ring0[k2], col });
    tris.push({ a: c1, b: ring1[k], c: ring1[k2], col });
    tris.push({ a: c0, b: ring0[k2], c: ring0[k], col });
  }
};
for (let y = 0; y < Y; y++)
  for (let z = 0; z < Z; z++)
    for (let x = 0; x < X; x++) {
      const i = at(x, y, z);
      if (!grid[i]) continue;
      const col = colors.get(i) ?? [200, 200, 200];
      for (const { d, q } of FACES) {
        const nx = x + d[0], ny = y + d[1], nz = z + d[2];
        if (inb(nx, ny, nz) && grid[at(nx, ny, nz)]) continue;
        const [q0, q1, q2, q3] = q.map((o) => P(x + o[0], y + o[1], z + o[2])) as [V, V, V, V];
        tris.push({ a: q0, b: q1, c: q2, col });
        tris.push({ a: q0, b: q2, c: q3, col });
      }
      const above = inb(x, y + 1, z) && grid[at(x, y + 1, z)];
      if (!above) prism(x + 0.5, z + 0.5, y + 1 - SINK, y + 1 + STUD_H, STUD_R, col);
    }
// pupils: a raised black square tile on the front face of each eye brick
for (const { x, y, z } of pupils) {
  const s = 0.46, t = 0.09; // tile size / proudness, in bricks
  const x0 = x + (1 - s) / 2, x1 = x + (1 + s) / 2;
  const y0 = y + (1 - s) / 2, y1 = y + (1 + s) / 2;
  const zf = z + 1 - SINK, zt = z + 1 + t;
  const c: Array<[number, number]> = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
  const F0 = c.map(([px, py]) => P(px, py, zf));
  const F1 = c.map(([px, py]) => P(px, py, zt));
  tris.push({ a: F1[0], b: F1[1], c: F1[2], col: BLACK });
  tris.push({ a: F1[0], b: F1[2], c: F1[3], col: BLACK });
  tris.push({ a: F0[2], b: F0[1], c: F0[0], col: BLACK });
  tris.push({ a: F0[3], b: F0[2], c: F0[0], col: BLACK });
  for (let k = 0; k < 4; k++) {
    const k2 = (k + 1) % 4;
    tris.push({ a: F0[k], b: F1[k], c: F1[k2], col: BLACK });
    tris.push({ a: F0[k], b: F1[k2], c: F0[k2], col: BLACK });
  }
}

// ---------- 6) writers ----------
const outDir = arg('out', 'out')!;
fs.mkdirSync(outDir, { recursive: true });

// binary STL
{
  const buf = Buffer.alloc(84 + tris.length * 50);
  buf.write(`mycelium spore ${name}`, 0, 'ascii');
  buf.writeUInt32LE(tris.length, 80);
  let o = 84;
  for (const t of tris) {
    const ux = t.b[0]-t.a[0], uy = t.b[1]-t.a[1], uz = t.b[2]-t.a[2];
    const vx = t.c[0]-t.a[0], vy = t.c[1]-t.a[1], vz = t.c[2]-t.a[2];
    const n: V = [uy*vz-uz*vy, uz*vx-ux*vz, ux*vy-uy*vx];
    const len = Math.hypot(...n) || 1;
    for (const v of [n.map((c)=>c/len) as V, t.a, t.b, t.c])
      for (const c of v) { buf.writeFloatLE(c, o); o += 4; }
    buf.writeUInt16LE(0, o); o += 2;
  }
  fs.writeFileSync(path.join(outDir, `${name}.stl`), buf);
}

// vertex-coloured PLY
{
  const L: string[] = [];
  L.push('ply', 'format ascii 1.0',
    `element vertex ${tris.length * 3}`,
    'property float x', 'property float y', 'property float z',
    'property uchar red', 'property uchar green', 'property uchar blue',
    `element face ${tris.length}`, 'property list uchar int vertex_indices', 'end_header');
  for (const t of tris)
    for (const v of [t.a, t.b, t.c])
      L.push(`${v[0].toFixed(2)} ${v[1].toFixed(2)} ${v[2].toFixed(2)} ${t.col[0]} ${t.col[1]} ${t.col[2]}`);
  for (let i = 0; i < tris.length; i++) L.push(`3 ${i*3} ${i*3+1} ${i*3+2}`);
  fs.writeFileSync(path.join(outDir, `${name}.ply`), L.join('\n'));
}

// brick dump
{
  const vox: Array<[number, number, number, string]> = [];
  for (const [i, c] of colors) {
    if (!grid[i]) continue;
    const x = i % X, y = ((i / X) | 0) % Y, z = (i / (X * Y)) | 0;
    vox.push([x, y, z, `#${c.map((n) => n.toString(16).padStart(2, '0')).join('')}`]);
  }
  fs.writeFileSync(path.join(outDir, `${name}.json`),
    JSON.stringify({ name, text, family: FAMS[charId], dims: [X, Y, Z], mm, voxels: vox }));
}

const size = `${(X*mm).toFixed(0)}×${(Z*mm).toFixed(0)}×${(Y*mm).toFixed(0)}mm`;
let bricks = 0; for (let i = 0; i < grid.length; i++) if (grid[i]) bricks++;
console.log(`${name}: family=${FAMS[charId]} bricks=${bricks} grid=${X}×${Y}×${Z} tris=${tris.length} print=${size}`);
