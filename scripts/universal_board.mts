/**
 * universal_board — one white tray that every spore fits on.
 *
 * The engine grows creatures on grids of 10–14 cols × 12–16 rows, so no silhouette is
 * ever wider than 14 or taller than 16 cells. This board has exactly BOARD.cols × BOARD.rows
 * pockets with the same pocket spec as the batch plates (cell 2.2 · pocket 1.8 · depth 0.4 ·
 * plate 0.9), so the same printed tiles drop in. The outer wall is only half a grout wall
 * (no thick rim): every cell is an identical 2.2 square, so the board can be cut along any
 * grout line into a single design's plate; the ring stays on, joined to the top edge by a
 * short neck that only touches the edge wall. Where a creature sits on it is
 * boardPlacement() in src/core/mosaic.ts — the site and this script use the same rule.
 *
 *   npx tsx scripts/universal_board.mts [--out out/board] [--loop ring|none] [--rim 0]
 *       [--text "…"]   also draw that sentence's creature onto the board chart
 */
import fs from 'node:fs';
import path from 'node:path';
import { buildMosaic, BOARD, boardPlacement } from '../src/core/mosaic';
import { xmur3 } from '../src/core/seed';
import type { CharId } from '../src/data/characters';

const arg = (k: string, d?: string) => { const i = process.argv.indexOf(`--${k}`); return i >= 0 ? process.argv[i + 1] : d; };
const OUT = arg('out', 'out/board')!;
const CELL = Number(arg('cell', '2.2'));
const GROUT = Number(arg('grout', '0.4'));
const BASE = Number(arg('base', '0.9'));
const POCKET = Number(arg('pocket', '0.4'));
const RIM = Number(arg('rim', '0'));        // 0: outer wall = half a grout wall, so the board is a seamless tiling you can cut anywhere
const LOOP = arg('loop', 'ring')!;
const HOLE = CELL - GROUT;                 // pocket opening (tile 1.6 + 2 × 0.1 fit)
const EDGE = RIM + GROUT / 2;              // outer wall
const { cols: C, rows: R } = BOARD;
fs.mkdirSync(OUT, { recursive: true });

// tensor grid: edge | pocket | grout | pocket | … | pocket | edge
const axis = (n: number) => {
  const t = [0, EDGE];
  for (let i = 0; i < n; i++) { t.push(t[t.length - 1] + HOLE); t.push(t[t.length - 1] + (i < n - 1 ? GROUT : EDGE)); }
  return t;
};
const xs = axis(C);
const W = xs[xs.length - 1];
const ysUp = axis(R);                      // y measured from the bottom edge
const H = ysUp[ysUp.length - 1];
const NX = xs.length - 1, NY = ysUp.length - 1;
// fine cell (i, j) is a pocket iff both indices are odd (j counts from the bottom)
const isPocket = (i: number, j: number) => i % 2 === 1 && j % 2 === 1;
const Z = [0, BASE - POCKET, BASE];
const solid = (i: number, j: number, l: number) =>
  i >= 0 && j >= 0 && i < NX && j < NY && (l === 0 || (l === 1 && !isPocket(i, j)));

type V = [number, number, number];
const tris: V[][] = [];
const quad = (a: V, b: V, c: V, d: V) => { tris.push([a, b, c], [a, c, d]); };
for (let l = 0; l < 2; l++) for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
  if (!solid(i, j, l)) continue;
  const x0 = xs[i], x1 = xs[i + 1], y0 = ysUp[j], y1 = ysUp[j + 1], z0 = Z[l], z1 = Z[l + 1];
  if (!solid(i, j, l + 1)) quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]);
  if (!solid(i, j, l - 1)) quad([x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [x1, y0, z0]);
  if (!solid(i - 1, j, l)) quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]);
  if (!solid(i + 1, j, l)) quad([x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]);
  if (!solid(i, j - 1, l)) quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]);
  if (!solid(i, j + 1, l)) quad([x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0]);
}
const boardTris = tris.length;

// jump ring above the top edge, same proportions as the single-design plates, joined by a neck
// that sits on the edge wall only (centred on the grout line between the two middle columns)
const RO = Math.max(2.4, CELL * 1.1), RI = Math.max(1.2, RO * 0.5);
const NECK = Number(arg('neck', '0.8'));            // clear gap between board edge and ring
const ring = { x: W / 2, y: H + NECK + RO };
if (LOOP === 'ring') {
  const nx0 = ring.x - CELL / 2, nx1 = ring.x + CELL / 2, ny0 = H - EDGE, ny1 = ring.y - (RO + RI) / 2;
  const v = (x: number, y: number, z: number): V => [x, y, z];
  quad(v(nx0, ny0, BASE), v(nx1, ny0, BASE), v(nx1, ny1, BASE), v(nx0, ny1, BASE));
  quad(v(nx0, ny0, 0), v(nx0, ny1, 0), v(nx1, ny1, 0), v(nx1, ny0, 0));
  quad(v(nx0, ny0, 0), v(nx1, ny0, 0), v(nx1, ny0, BASE), v(nx0, ny0, BASE));
  quad(v(nx0, ny1, 0), v(nx0, ny1, BASE), v(nx1, ny1, BASE), v(nx1, ny1, 0));
  quad(v(nx0, ny0, 0), v(nx0, ny0, BASE), v(nx0, ny1, BASE), v(nx0, ny1, 0));
  quad(v(nx1, ny0, 0), v(nx1, ny1, 0), v(nx1, ny1, BASE), v(nx1, ny0, BASE));
  const N = 48, pt = (r: number, a: number, z: number): V => [ring.x + Math.cos(a) * r, ring.y + Math.sin(a) * r, z];
  for (let k = 0; k < N; k++) {
    const a0 = (k / N) * Math.PI * 2, a1 = ((k + 1) / N) * Math.PI * 2;
    quad(pt(RO, a0, 0), pt(RO, a1, 0), pt(RO, a1, BASE), pt(RO, a0, BASE));
    quad(pt(RI, a0, BASE), pt(RI, a1, BASE), pt(RI, a1, 0), pt(RI, a0, 0));
    quad(pt(RI, a0, BASE), pt(RO, a0, BASE), pt(RO, a1, BASE), pt(RI, a1, BASE));
    quad(pt(RO, a0, 0), pt(RI, a0, 0), pt(RI, a1, 0), pt(RO, a1, 0));
  }
}

const writeSTL = (file: string, list: V[][]) => {
  const b = Buffer.alloc(84 + list.length * 50);
  b.write(`mycelium universal board ${C}x${R}`, 0); b.writeUInt32LE(list.length, 80);
  let o = 84;
  for (const [a, p, c] of list) {
    const u = [p[0] - a[0], p[1] - a[1], p[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const m = Math.hypot(...n) || 1;
    for (const x of [...n.map((q) => q / m), ...a, ...p, ...c]) { b.writeFloatLE(x, o); o += 4; }
    o += 2;
  }
  fs.writeFileSync(file, b);
};
const tag = `universal_board_${C}x${R}`;
writeSTL(path.join(OUT, `${tag}.stl`), tris);
if (LOOP === 'ring') writeSTL(path.join(OUT, `${tag}_noring.stl`), tris.slice(0, boardTris));

// ---------- 1:1 chart: coordinates A–N across, 1–16 down (row 1 at the ring end) ----------
const COLS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
let cellFill: Map<string, { fill: string; opacity: number; eye?: string }> | null = null;
let title = `通用底板 ${C} × ${R} 格 · 格距 ${CELL} · 口袋 ${HOLE.toFixed(1)} 深 ${POCKET} · 底厚 ${BASE} · 外形 ${W.toFixed(1)} × ${H.toFixed(1)} mm`;
const text = arg('text');
if (text) {
  const h0 = xmur3(text)();
  const charId = (h0 % 6) as CharId;
  const spec = buildMosaic({
    id: `w:${h0.toString(16)}`, charId, intensity: Number(arg('intensity', '0.65')),
    morphology: { density: Number(arg('density', '0.7')), agitation: 0.4, tendrilCount: 5, glow: 0.5, tintHue: h0 % 360, particles: false },
  } as Parameters<typeof buildMosaic>[0]);
  const { dc, dr, width, height } = boardPlacement(spec);
  cellFill = new Map();
  for (const c of spec.cells) cellFill.set(`${c.col + dc},${c.row + dr}`, { fill: c.color, opacity: c.alpha });
  const { row, L0, R0 } = spec.eyes;
  for (const [c, kind] of [[L0, 'w'], [L0 + 1, 'b'], [R0, 'w'], [R0 + 1, 'b']] as const)
    cellFill.set(`${c + dc},${row + dr}`, { fill: kind === 'w' ? '#ffffff' : '#111111', opacity: 1, eye: kind });
  title = `「${text}」 on 通用底板 ${C} × ${R} · 占 ${width} × ${height} 格 · 偏移 列 ${dc >= 0 ? '+' : ''}${dc} 行 ${dr >= 0 ? '+' : ''}${dr}`;
}
const S = 1;                                   // svg user unit = 1 mm (prints 1:1)
const M = 8;                                   // margin for labels
const ringTop = LOOP === 'ring' ? NECK + RO * 2 : 0;
const svgW = W + 2 * M, svgH = H + 2 * M + ringTop + 6;
const top = M + ringTop + 6;                   // board's top edge in svg
const g: string[] = [];
g.push(`<rect x="${M}" y="${top}" width="${W}" height="${H}" rx="0.3" fill="#fafaf7" stroke="#999" stroke-width="0.15"/>`);
if (LOOP === 'ring') g.push(`<rect x="${M + ring.x - CELL / 2}" y="${top - NECK - (RO - RI) / 2}" width="${CELL}" height="${NECK + (RO - RI) / 2 + EDGE}" fill="#999" fill-opacity="0.35"/>`);
if (LOOP === 'ring') g.push(`<circle cx="${M + ring.x}" cy="${top - (ring.y - H)}" r="${(RO + RI) / 2}" fill="none" stroke="#999" stroke-width="${RO - RI}" stroke-opacity="0.35"/>`);
for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
  const x = M + EDGE + c * CELL, y = top + EDGE + r * CELL;
  const f = cellFill?.get(`${c},${r}`);
  g.push(`<rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${HOLE}" height="${HOLE}" fill="${f ? f.fill : '#fff'}" fill-opacity="${f ? f.opacity.toFixed(2) : 1}" stroke="#bbb" stroke-width="0.08"/>`);
  if (f?.eye) g.push(`<text x="${(x + HOLE / 2).toFixed(2)}" y="${(y + HOLE * 0.72).toFixed(2)}" font-size="1.2" text-anchor="middle" fill="${f.eye === 'w' ? '#111' : '#fff'}">${f.eye === 'w' ? '白' : '黑'}</text>`);
}
for (let c = 0; c < C; c++) {
  const x = M + EDGE + c * CELL + HOLE / 2;
  g.push(`<text x="${x.toFixed(2)}" y="${(top - ringTop - 1.2).toFixed(2)}" font-size="1.6" text-anchor="middle" fill="#666">${COLS[c]}</text>`);
  g.push(`<text x="${x.toFixed(2)}" y="${(top + H + 2.4).toFixed(2)}" font-size="1.6" text-anchor="middle" fill="#666">${COLS[c]}</text>`);
}
for (let r = 0; r < R; r++) {
  const y = top + EDGE + r * CELL + HOLE * 0.75;
  g.push(`<text x="${M - 1}" y="${y.toFixed(2)}" font-size="1.6" text-anchor="end" fill="#666">${r + 1}</text>`);
  g.push(`<text x="${M + W + 1}" y="${y.toFixed(2)}" font-size="1.6" fill="#666">${r + 1}</text>`);
}
const foot = ['1:1 打印', ...title.split(' · ')];
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${svgW * S}mm" height="${(svgH + 2 + foot.length * 2) * S}mm" viewBox="0 0 ${svgW} ${svgH + 2 + foot.length * 2}" font-family="sans-serif">
<title>${title}</title><rect width="100%" height="100%" fill="#fff"/>${g.join('')}
${foot.map((t, k) => `<text x="${svgW / 2}" y="${svgH + 1 + k * 2}" font-size="1.4" text-anchor="middle" fill="#888">${t}</text>`).join('')}</svg>`;
const chart = path.join(OUT, text ? `${tag}_${xmur3(text)().toString(16).slice(0, 6)}.svg` : `${tag}_chart.svg`);
fs.writeFileSync(chart, svg);
console.log(`${tag}: ${W.toFixed(1)} × ${H.toFixed(1)} × ${BASE} mm · ${C * R} pockets · ring ${LOOP} → ${OUT}/`);
console.log(`chart → ${chart}`);
