/**
 * spore3d — turn a whispered sentence into a printable brick spore.
 *
 * Default mode is EXTRUDE: the engine's actual 2D mosaic cells (position,
 * colour, translucency, dither and all) become physical blocks, extruded
 * 1–3 blocks deep — solid core deepest, edges thinner, wispy translucent
 * cells thinnest — so the piece keeps the exact likeness of the on-screen
 * creature, like a brick-built sprite. Eyes come from the engine spec:
 * white blocks with black pupil blocks.
 *
 * Styles:
 *   --style pixel  clean cubes (3D-pixel / acrylic look)   [default]
 *   --style lego   adds round studs on every exposed top face
 * Legacy: --mode revolve keeps the volumetric solid-of-revolution body.
 *
 * Outputs: out/<name>.stl (mm, single colour) · out/<name>.ply (per-face
 * colour) · out/<name>.json (block dump). Deterministic: same sentence,
 * same spore.
 *
 *   npx tsx scripts/spore3d.mts --text "..." [--family dreamy]
 *       [--style pixel|lego] [--cell 8] [--depth 3]
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
const cellMM = Number(arg('cell', '8'));      // printed size of one block
const DEPTH = Number(arg('depth', '3'));      // max extrusion depth, blocks
const style = arg('style', 'pixel');          // pixel | lego
const id = `w:${h0.toString(16)}`;
const name = arg('name') ?? `spore_${FAMS[charId]}_${h0.toString(16).slice(0, 6)}`;

// ---------- 1) the exact creature the site would grow ----------
const spec = buildMosaic({
  id,
  charId,
  morphology: { density, agitation: 0.4, tendrilCount: 5, glow: 0.5, tintHue, particles: false },
  intensity,
});
const { cols, rows, cells, eyes } = spec;

const hsl = /hsl\((-?\d+),(\d+)%,(\d+)%\)/;
const hsl2rgb = (h: number, s: number, l: number): [number, number, number] => {
  h = ((h % 360) + 360) % 360;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    return l - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)));
  };
  return [f(0), f(8), f(4)].map((v) => Math.round(v * 255)) as [number, number, number];
};
const parse = (c: string): [number, number, number] => {
  const m = c.match(hsl);
  return m ? hsl2rgb(+m[1], +m[2] / 100, +m[3] / 100) : [200, 200, 200];
};

// ---------- 2) extrude the 2D cells into blocks ----------
// depth by how "core" a cell is: interior solid cells go deepest, edge
// cells thinner, translucent dither cells a single block.
const X = cols, Y = rows, Z = DEPTH;
const grid = new Uint8Array(X * Y * Z);
const at = (x: number, y: number, z: number) => x + X * (y + Y * z);
const inb = (x: number, y: number, z: number) =>
  x >= 0 && y >= 0 && z >= 0 && x < X && y < Y && z < Z;
const colors = new Map<number, [number, number, number]>();
const alpha = new Map<number, number>();

const cellMapIdx = new Map<string, (typeof cells)[number]>();
for (const c of cells) cellMapIdx.set(`${c.col},${c.row}`, c);
const filled2D = (c: number, r: number) =>
  c >= 0 && r >= 0 && c < cols && r < rows && cellMapIdx.has(`${c},${r}`);

for (const cell of cells) {
  const solid2D =
    filled2D(cell.col - 1, cell.row) && filled2D(cell.col + 1, cell.row) &&
    filled2D(cell.col, cell.row - 1) && filled2D(cell.col, cell.row + 1);
  let d = cell.alpha < 0.9 ? 1 : solid2D ? DEPTH : Math.max(1, DEPTH - 1);
  const rgb = parse(cell.color);
  const y = rows - 1 - cell.row;                 // engine row 0 = top
  const z0 = Math.floor((DEPTH - d) / 2);        // centred in depth
  for (let dz = 0; dz < d; dz++) {
    const i = at(cell.col, y, z0 + dz);
    grid[i] = 1;
    colors.set(i, rgb);
    alpha.set(i, cell.alpha);
  }
}

// ---------- 3) the face, straight from the engine spec ----------
const WHITE: [number, number, number] = [246, 246, 241];
const BLACK: [number, number, number] = [18, 18, 18];
const eyeY = rows - 1 - eyes.row;
for (const [c, col] of [
  [eyes.L0, WHITE], [eyes.L0 + 1, BLACK], [eyes.R0, BLACK], [eyes.R0 + 1, WHITE],
] as Array<[number, [number, number, number]]>) {
  // ensure the eye block exists even if dither skipped the cell
  let zf = -1;
  for (let z = Z - 1; z >= 0; z--) if (grid[at(c, eyeY, z)]) { zf = z; break; }
  if (zf < 0) {
    zf = Math.floor(DEPTH / 2);
    grid[at(c, eyeY, zf)] = 1;
  }
  colors.set(at(c, eyeY, zf), col);
  alpha.set(at(c, eyeY, zf), 1);
}

// --hollow: carve strictly-interior blocks into a module bay (ESP32,
// battery, OLED behind the eyes — the robot build's inner cavity).
if (process.argv.includes('--hollow')) {
  const toDrop: number[] = [];
  for (let y = 1; y < Y - 1; y++)
    for (let z = 1; z < Z - 1; z++)
      for (let x = 1; x < X - 1; x++) {
        const i = at(x, y, z);
        if (!grid[i]) continue;
        let buried = true;
        for (const [dx, dy, dz] of [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]])
          if (!grid[at(x + dx, y + dy, z + dz)]) { buried = false; break; }
        if (buried) toDrop.push(i);
      }
  for (const i of toDrop) { grid[i] = 0; colors.delete(i); alpha.delete(i); }
}

// keep the largest connected component (dither can strand blocks)
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

// ---------- 4) meshing: blocks (+ studs in lego style) ----------
const mm = cellMM;
type V = [number, number, number];
const tris: Array<{ a: V; b: V; c: V; col: [number, number, number]; al: number }> = [];
const P = (x: number, y: number, z: number): V => [x * mm, z * mm, y * mm]; // print z-up

// ---------- ROBOT SHELL MODE ----------
// Hardware-first architecture (cavity drives the form): 20 mm pixel
// module; the face is thin relief tiles (10 mm plate + 0/8/16 mm
// stepped protrusion) so the head stays ~55-65 mm; a unified equipment
// bay hides behind the torso (outer 7×6×3 blocks → ≥100×80×60 mm clear
// inside); a ballast/speaker base sits under the stem (100×80×70 mm).
// Electronics split: eyes/sensors in the head, mainboard in the bay,
// battery + speaker in the base.
if (process.argv.includes('--robot')) {
  const DARK: [number, number, number] = [56, 54, 52];
  const box = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, col: [number, number, number]) => {
    const c = [
      P(x0, y0, z0), P(x1, y0, z0), P(x1, y1, z0), P(x0, y1, z0),
      P(x0, y0, z1), P(x1, y0, z1), P(x1, y1, z1), P(x0, y1, z1),
    ];
    const Q: Array<[number, number, number, number]> = [
      [0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4], [2, 3, 7, 6], [1, 2, 6, 5], [3, 0, 4, 7],
    ];
    for (const [a, b, cc, d] of Q) {
      tris.push({ a: c[a], b: c[b], c: c[cc], col, al: 1 });
      tris.push({ a: c[a], b: c[cc], c: c[d], col, al: 1 });
    }
  };
  const PLATE_Z = 3;      // bay depth in blocks behind the face plate
  const PLATE_T = 0.5;    // 10 mm structural plate
  const TILE_T = 0.5;     // 10 mm visual tile
  const rngR = new Rng(xmur3(`${id}:relief`)());
  // relief tiles — the exact 2D sprite, stepped 0 / 8 / 16 mm
  for (const cell of cells) {
    const y = rows - 1 - cell.row;
    const rgb = parse(cell.color);
    const relief = cell.alpha < 0.9 ? 0.8 : rngR.next() < 0.62 ? 0 : rngR.next() < 0.75 ? 0.4 : 0.8;
    box(cell.col, y, PLATE_Z, cell.col + 1, y + 1, PLATE_Z + PLATE_T, rgb);                 // plate
    box(cell.col + 0.02, y + 0.02, PLATE_Z + PLATE_T, cell.col + 0.98, y + 0.98,
        PLATE_Z + PLATE_T + TILE_T + relief, rgb);                                          // tile
  }
  // eyes flat + white/black (OLED sits behind the pupil tiles)
  const eyeYr = rows - 1 - eyes.row;
  for (const [c, col] of [
    [eyes.L0, WHITE], [eyes.L0 + 1, BLACK], [eyes.R0, BLACK], [eyes.R0 + 1, WHITE],
  ] as Array<[number, [number, number, number]]>) {
    box(c, eyeYr, PLATE_Z, c + 1, eyeYr + 1, PLATE_Z + PLATE_T, col);
    box(c + 0.02, eyeYr + 0.02, PLATE_Z + PLATE_T, c + 0.98, eyeYr + 0.98, PLATE_Z + PLATE_T + TILE_T, col);
  }
  // equipment bay: outer 7×6 blocks × PLATE_Z deep, walls 1 block,
  // open at the back → clear interior 5×4 blocks (100×80) × 60 mm
  const bw = 7, bh = 6;
  const bx0 = Math.floor((cols - bw) / 2), by0 = Math.max(0, Math.floor(rows * 0.12));
  box(bx0, by0, 0, bx0 + 1, by0 + bh, PLATE_Z, DARK);                    // left wall
  box(bx0 + bw - 1, by0, 0, bx0 + bw, by0 + bh, PLATE_Z, DARK);          // right wall
  box(bx0 + 1, by0 + bh - 1, 0, bx0 + bw - 1, by0 + bh, PLATE_Z, DARK);  // top wall
  box(bx0 + 1, by0, 0, bx0 + bw - 1, by0 + 1, PLATE_Z, DARK);            // bottom wall
  // base: 5×4 blocks footprint × 3.5 high, open top (battery / speaker / ballast)
  const gw = 5, gd = 4, gh = 3.5;
  const gx0 = (cols - gw) / 2, gz0 = PLATE_Z + PLATE_T - gd * 0.5 - 1;
  box(gx0, -gh, gz0, gx0 + 0.5, 0.02, gz0 + gd, DARK);
  box(gx0 + gw - 0.5, -gh, gz0, gx0 + gw, 0.02, gz0 + gd, DARK);
  box(gx0 + 0.5, -gh, gz0, gx0 + gw - 0.5, 0.02, gz0 + 0.5, DARK);
  box(gx0 + 0.5, -gh, gz0 + gd - 0.5, gx0 + gw - 0.5, 0.02, gz0 + gd, DARK);
  box(gx0, -gh, gz0, gx0 + gw, -gh + 0.5, gz0 + gd, DARK);               // floor
  console.log(`robot shell: module=${mm}mm · overall ≈ ${cols * mm}mm wide × ${(rows + 3.5) * mm}mm tall`
    + ` · head depth ${(PLATE_T + TILE_T + 0.8) * mm + PLATE_Z * mm}mm (incl. bay)`
    + ` · bay interior ${(bw - 2) * mm}×${(bh - 2) * mm}×${PLATE_Z * mm}mm · base ${gw * mm}×${gd * mm}×${gh * mm}mm`);
}
const ROBOT = process.argv.includes('--robot');
const FACES: Array<{ d: V; q: [V, V, V, V] }> = [
  { d: [1, 0, 0],  q: [[1,0,0],[1,1,0],[1,1,1],[1,0,1]] },
  { d: [-1, 0, 0], q: [[0,0,1],[0,1,1],[0,1,0],[0,0,0]] },
  { d: [0, 1, 0],  q: [[0,1,0],[0,1,1],[1,1,1],[1,1,0]] },
  { d: [0, -1, 0], q: [[0,0,0],[1,0,0],[1,0,1],[0,0,1]] },
  { d: [0, 0, 1],  q: [[0,0,1],[1,0,1],[1,1,1],[0,1,1]] },
  { d: [0, 0, -1], q: [[0,0,0],[0,1,0],[1,1,0],[1,0,0]] },
];
const STUD_R = 0.3, STUD_H = 0.18, STUD_N = 16, SINK = 0.02;
if (!ROBOT)
for (let y = 0; y < Y; y++)
  for (let z = 0; z < Z; z++)
    for (let x = 0; x < X; x++) {
      const i = at(x, y, z);
      if (!grid[i]) continue;
      const col = colors.get(i) ?? [200, 200, 200];
      const al = alpha.get(i) ?? 1;
      for (const { d, q } of FACES) {
        const nx = x + d[0], ny = y + d[1], nz = z + d[2];
        if (inb(nx, ny, nz) && grid[at(nx, ny, nz)]) continue;
        const [q0, q1, q2, q3] = q.map((o) => P(x + o[0], y + o[1], z + o[2])) as [V, V, V, V];
        tris.push({ a: q0, b: q1, c: q2, col, al });
        tris.push({ a: q0, b: q2, c: q3, col, al });
      }
      if (style === 'lego') {
        const above = inb(x, y + 1, z) && grid[at(x, y + 1, z)];
        if (!above) {
          const cx = x + 0.5, cz = z + 0.5;
          const y0 = y + 1 - SINK, y1 = y + 1 + STUD_H;
          const ring0: V[] = [], ring1: V[] = [];
          for (let k = 0; k < STUD_N; k++) {
            const a = (k / STUD_N) * Math.PI * 2;
            ring0.push(P(cx + Math.cos(a) * STUD_R, y0, cz + Math.sin(a) * STUD_R));
            ring1.push(P(cx + Math.cos(a) * STUD_R, y1, cz + Math.sin(a) * STUD_R));
          }
          const c0 = P(cx, y0, cz), c1 = P(cx, y1, cz);
          for (let k = 0; k < STUD_N; k++) {
            const k2 = (k + 1) % STUD_N;
            tris.push({ a: ring0[k], b: ring1[k], c: ring1[k2], col, al });
            tris.push({ a: ring0[k], b: ring1[k2], c: ring0[k2], col, al });
            tris.push({ a: c1, b: ring1[k], c: ring1[k2], col, al });
            tris.push({ a: c0, b: ring0[k2], c: ring0[k], col, al });
          }
        }
      }
    }

// ---------- 5) writers ----------
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

// vertex-coloured PLY (alpha channel included for acrylic previews)
{
  const L: string[] = [];
  L.push('ply', 'format ascii 1.0',
    `element vertex ${tris.length * 3}`,
    'property float x', 'property float y', 'property float z',
    'property uchar red', 'property uchar green', 'property uchar blue', 'property uchar alpha',
    `element face ${tris.length}`, 'property list uchar int vertex_indices', 'end_header');
  for (const t of tris) {
    const a8 = Math.round(t.al * 255);
    for (const v of [t.a, t.b, t.c])
      L.push(`${v[0].toFixed(2)} ${v[1].toFixed(2)} ${v[2].toFixed(2)} ${t.col[0]} ${t.col[1]} ${t.col[2]} ${a8}`);
  }
  for (let i = 0; i < tris.length; i++) L.push(`3 ${i*3} ${i*3+1} ${i*3+2}`);
  fs.writeFileSync(path.join(outDir, `${name}.ply`), L.join('\n'));
}

// block dump
{
  const vox: Array<[number, number, number, string, number]> = [];
  for (let i = 0; i < grid.length; i++) {
    if (!grid[i]) continue;
    const x = i % X, y = ((i / X) | 0) % Y, z = (i / (X * Y)) | 0;
    const c = colors.get(i) ?? [200, 200, 200];
    vox.push([x, y, z, `#${c.map((n) => n.toString(16).padStart(2, '0')).join('')}`, alpha.get(i) ?? 1]);
  }
  fs.writeFileSync(path.join(outDir, `${name}.json`),
    JSON.stringify({ name, text, family: FAMS[charId], dims: [X, Y, Z], mm, voxels: vox }));
}

let blocks = 0; for (let i = 0; i < grid.length; i++) if (grid[i]) blocks++;
console.log(`${name}: family=${FAMS[charId]} blocks=${blocks} grid=${X}×${Y}×${Z} tris=${tris.length} print=${(X*mm).toFixed(0)}×${(Z*mm).toFixed(0)}×${(Y*mm).toFixed(0)}mm`);
