/**
 * spore3d — turn a whispered sentence into a printable, fully
 * volumetric voxel spore.
 *
 * The 2D mosaic engine already knows each row's silhouette half-width
 * (the mask). This tool revolves those widths around the vertical axis
 * into a solid of revolution, voxelizes it (supersampled), re-applies
 * the same palette bands / edge darkening / band-jump dither with a
 * seeded rng, paints the two-cell eyes onto the front surface (pupils
 * recessed one voxel so even a single-colour print keeps its face),
 * and writes:
 *   out/<name>.stl   binary STL, millimetres  (single-colour printing)
 *   out/<name>.ply   per-vertex-coloured mesh (full-colour preview/print)
 *   out/<name>.json  voxel dump (renderers / debugging)
 *
 * Determinism: same sentence → same id → same body, print after print.
 *
 *   npx tsx scripts/spore3d.mts --text "today, my heart feels like rain" \
 *       [--family dreamy] [--intensity 0.7] [--density 0.65] [--cell 5]
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
const cellMM = Number(arg('cell', '7')); // printed size of one brick
const S = Number(arg('supersample', '1')); // voxels per cell edge (1 = true bricks)
const id = `w:${h0.toString(16)}`;
const name =
  arg('name') ??
  `spore_${FAMS[charId]}_${h0.toString(16).slice(0, 6)}`;

// ---------- 1) the exact creature the site would grow ----------
const spec = buildMosaic({
  id,
  charId,
  morphology: { density, agitation: 0.4, tendrilCount: 5, glow: 0.5, tintHue, particles: false },
  intensity,
});
const { cols, rows, mask, palette, eyes } = spec;
const center = (cols - 1) / 2;

// per-row silhouette half-width, straight from the engine's mask
const hw: number[] = [];
for (let r = 0; r < rows; r++) {
  let m = -1;
  for (let c = 0; c < cols; c++) if (mask[r * cols + c]) m = Math.max(m, Math.abs(c - center));
  hw.push(m < 0 ? 0 : m + 0.5);
}

// ---------- 2) revolve into a voxel solid ----------
const X = cols * S, Y = rows * S, Z = cols * S;
const grid = new Uint8Array(X * Y * Z); // 0 empty, 1 filled
const at = (x: number, y: number, z: number) => x + X * (y + Y * z);
const inb = (x: number, y: number, z: number) =>
  x >= 0 && y >= 0 && z >= 0 && x < X && y < Y && z < Z;

for (let y = 0; y < Y; y++) {
  // engine row 0 is the TOP of the creature; 3D y axis grows upward
  const r = Math.min(rows - 1, rows - 1 - Math.floor(y / S));
  const radius = hw[r];
  if (radius <= 0) continue;
  for (let x = 0; x < X; x++) {
    for (let z = 0; z < Z; z++) {
      const u = (x + 0.5) / S - cols / 2;
      const w = (z + 0.5) / S - cols / 2;
      if (u * u + w * w <= (radius + 0.35) * (radius + 0.35)) grid[at(x, y, z)] = 1;
    }
  }
}

const preCarve = grid.slice(); // pristine solid, for repairing the face patch

// ---------- 2b) wispiness — the openwork that defines the creatures ----------
// The 2D engine drops cells probabilistically (fillProb, edge-thinned) and
// lets the bottom fringe dissolve into strands. Reapply that in 3D on the
// outer shell only: the core stays solid so the piece prints and stands.
const solid = process.argv.includes('--solid');
if (!solid) {
  const rng3 = new Rng(xmur3(`${id}:carve`)());
  // per-column strand length for the dripping bottom fringe
  const strand = new Float32Array(X * Z);
  for (let z = 0; z < Z; z++) for (let x = 0; x < X; x++) strand[x + X * z] = rng3.next();
  const fadeH = Math.max(2, Math.round(Y * 0.2)); // bottom drip zone
  for (let y = 0; y < Y; y++) {
    const r = Math.min(rows - 1, rows - 1 - Math.floor(y / S));
    const radius = hw[r];
    if (radius <= 0) continue;
    for (let z = 0; z < Z; z++) {
      for (let x = 0; x < X; x++) {
        const i = at(x, y, z);
        if (!grid[i]) continue;
        const u = (x + 0.5) / S - cols / 2;
        const w = (z + 0.5) / S - cols / 2;
        const dist = Math.sqrt(u * u + w * w);
        // engine fill rule on the outer 1-cell shell; occasional deeper pits
        if (dist > radius - 1) {
          const p = 0.55 + density * 0.5 - 0.35 * (1 - density);
          if (rng3.next() > p) { grid[i] = 0; continue; }
        } else if (dist > radius - 1.8 && rng3.next() < 0.14) { grid[i] = 0; continue; }
        // bottom fringe dissolves into hanging strands (core keeps standing)
        if (y < fadeH && dist > radius * 0.45) {
          const t = 1 - y / fadeH;
          if (t > strand[x + X * z]) grid[i] = 0;
        }
      }
    }
  }
}

// keep the largest connected component (erosion can orphan flakes)
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

// ---------- 3) colour: same bands, same dither spirit ----------
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
const colorAt = (x: number, y: number, z: number): [number, number, number] => {
  const r = Math.min(rows - 1, rows - 1 - Math.floor(y / S));
  const v = rows > 1 ? r / (rows - 1) : 0.5;
  let band = Math.floor(v * N);
  if (rng.next() < 0.12 + intensity * 0.18) band += rng.next() < 0.5 ? -1 : 1;
  band = Math.max(0, Math.min(N - 1, band));
  const st = palette.stops[band];
  const u = (x + 0.5) / S - cols / 2;
  const w = (z + 0.5) / S - cols / 2;
  const d = Math.sqrt(u * u + w * w) / (hw[r] || 1);
  const L = Math.max(0.12, Math.min(0.9, st.l - 0.1 * d + rng.range(-0.03, 0.03)));
  if (palette.sparkle && rng.next() < 0.04) return hsl2rgb(st.h, 0.6, 0.92);
  return hsl2rgb(st.h, st.s, L);
};

// colour every voxel (surface is what matters; interior never shows)
const colors = new Map<number, [number, number, number]>();
for (let y = 0; y < Y; y++)
  for (let z = 0; z < Z; z++)
    for (let x = 0; x < X; x++) {
      const i = at(x, y, z);
      if (grid[i]) colors.set(i, colorAt(x, y, z));
    }

// ---------- 4) the face, on the +Z front surface ----------
const WHITE: [number, number, number] = [245, 245, 240];
const BLACK: [number, number, number] = [16, 16, 16];
const eyeCells: Array<{ col: number; pupil: boolean }> = [
  { col: eyes.L0, pupil: false },
  { col: eyes.L0 + 1, pupil: true },  // pupils face inward
  { col: eyes.R0, pupil: true },
  { col: eyes.R0 + 1, pupil: false },
];
// the erosion must not chew the face: restore the eye columns to their
// pristine surface first so whites and pupils sit on one clean plane.
for (const { col } of eyeCells) {
  for (let sx = 0; sx < S; sx++) {
    for (let sy = 0; sy < S; sy++) {
      const x = col * S + sx;
      const y = (rows - 1 - eyes.row) * S + sy;
      for (let z = 0; z < Z; z++) {
        const i = at(x, y, z);
        if (preCarve[i]) { grid[i] = 1; if (!colors.has(i)) colors.set(i, colorAt(x, y, z)); }
      }
    }
  }
}
for (const { col, pupil } of eyeCells) {
  for (let sx = 0; sx < S; sx++) {
    for (let sy = 0; sy < S; sy++) {
      const x = col * S + sx;
      const y = (rows - 1 - eyes.row) * S + sy; // grid y is up
      // find front-most voxel of this column
      let zf = -1;
      for (let z = Z - 1; z >= 0; z--) if (grid[at(x, y, z)]) { zf = z; break; }
      if (zf < 0) continue;
      if (pupil) {
        grid[at(x, y, zf)] = 0; // recess one voxel — a face even in one colour
        colors.delete(at(x, y, zf));
        if (zf > 0 && grid[at(x, y, zf - 1)]) colors.set(at(x, y, zf - 1), BLACK);
      } else {
        colors.set(at(x, y, zf), WHITE);
      }
    }
  }
}

// ---------- 5) meshing: LEGO-style bricks ----------
// Watertight brick shell (shared faces culled) + a round stud on every
// exposed top face — the assembled-toy read. Studs are 12-gon prisms
// sunk a hair into the brick so slicers union them cleanly.
const mm = cellMM / S;
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
const STUD_R = 0.31;   // stud radius, in cells
const STUD_H = 0.22;   // stud height above the brick top
const STUD_N = 12;     // prism sides
const SINK = 0.02;     // overlap into the brick, for clean slicer unions
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
      // stud on every exposed top face
      const above = inb(x, y + 1, z) && grid[at(x, y + 1, z)];
      if (!above) {
        const cx = x + 0.5, cz = z + 0.5;
        const y0 = y + 1 - SINK, y1 = y + 1 + STUD_H;
        const ring0: V[] = [], ring1: V[] = [];
        for (let k = 0; k < STUD_N; k++) {
          const a = (k / STUD_N) * Math.PI * 2;
          const px = cx + Math.cos(a) * STUD_R, pz = cz + Math.sin(a) * STUD_R;
          ring0.push(P(px, y0, pz));
          ring1.push(P(px, y1, pz));
        }
        const c0 = P(cx, y0, cz), c1 = P(cx, y1, cz);
        for (let k = 0; k < STUD_N; k++) {
          const k2 = (k + 1) % STUD_N;
          tris.push({ a: ring0[k], b: ring1[k], c: ring1[k2], col });   // side
          tris.push({ a: ring0[k], b: ring1[k2], c: ring0[k2], col });
          tris.push({ a: c1, b: ring1[k], c: ring1[k2], col });        // top fan
          tris.push({ a: c0, b: ring0[k2], c: ring0[k], col });        // bottom fan
        }
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

// voxel dump for external renderers
{
  const vox: Array<[number, number, number, string]> = [];
  for (const [i, c] of colors) {
    const x = i % X, y = ((i / X) | 0) % Y, z = (i / (X * Y)) | 0;
    vox.push([x, y, z, `#${c.map((n) => n.toString(16).padStart(2, '0')).join('')}`]);
  }
  fs.writeFileSync(path.join(outDir, `${name}.json`),
    JSON.stringify({ name, text, family: FAMS[charId], dims: [X, Y, Z], mm, voxels: vox }));
}

const size = `${(X*mm).toFixed(0)}×${(Z*mm).toFixed(0)}×${(Y*mm).toFixed(0)}mm`;
console.log(`${name}: family=${FAMS[charId]} grid=${X}×${Y}×${Z} tris=${tris.length} print=${size}`);
