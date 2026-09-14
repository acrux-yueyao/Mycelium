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
import { demoColony } from '../src/core/demoColony';
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
// 孢子号:MYC-<族字母><Crockford Base32 x5> —— 从句子哈希派生,
// 同一句话永远同一个号(去掉 0/O/1/I 这类易混字符)。
const B32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const FAM_CODE = 'TCRDPL';                       // tender calm cuRious dreamy comPanion lonely
const sporeId = 'MYC-' + FAM_CODE[charId] +
  [4, 3, 2, 1, 0].map((k) => B32[(h0 >>> (k * 5)) & 31]).join('');
const name = arg('name') ?? `spore_${FAMS[charId]}_${h0.toString(16).slice(0, 6)}`;

// ---------- 1) the exact creature the site would grow ----------
// --demo demo-11: reproduce a resident of the site's demo colony exactly
const DEMO = arg('demo');
let specInput = {
  id,
  charId,
  morphology: { density, agitation: 0.4, tendrilCount: 5, glow: 0.5, tintHue, particles: false },
  intensity,
} as Parameters<typeof buildMosaic>[0];
if (DEMO) {
  const resident = demoColony(48, 1720000000000).find((c) => c.id === DEMO);
  if (!resident) throw new Error(`--demo: no resident ${DEMO}`);
  specInput = { id: resident.id, charId: resident.charId,
                morphology: resident.morphology, intensity: resident.intensity };
}
const spec = buildMosaic(specInput);
const { cols, rows, cells, eyes, palette } = spec;

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
// ROBOT mode: variable depth — fringe thin, torso core deep enough to
// swallow the electronics; a pixel "mound" grows under the stem to hide
// battery + speaker; interior hollows to a 1-brick shell; ports are
// missing bricks. Every face, side and back included, is a colour brick:
// nothing mechanical shows from any angle.
const ROBOT = process.argv.includes('--robot');
const CORE_D = ROBOT ? Number(arg('coredepth', '3')) : 0; // body depth, blocks (3×20=60mm)
const MOUND = ROBOT ? Number(arg('mound', '0')) : 0;      // optional pixel mound rows
const SCULPT = arg('sculpt');                 // 塑形台导出的参数 JSON
const ZDIM = SCULPT ? 12 : ROBOT ? Math.max(CORE_D, 3) : DEPTH;
const X = cols, Y = rows + MOUND, Z = ZDIM;
const grid = new Uint8Array(X * Y * Z);
const at = (x: number, y: number, z: number) => x + X * (y + Y * z);
const inb = (x: number, y: number, z: number) =>
  x >= 0 && y >= 0 && z >= 0 && x < X && y < Y && z < Z;
const colors = new Map<number, [number, number, number]>();
const alpha = new Map<number, number>();

// --companion: shell for the desk robot (12 mm module). The core box
// (62×82×26 at the eye anchor) must hide completely: force-fill every
// cell in the core footprint, widen thin rows to 6 cells, and keep the
// column solid all the way down so the cartridge can slide in from the
// bottom. Colours for added cells come from the row's palette band.
const COMPANION = process.argv.includes('--companion');
const CORE_COLS = 7, CORE_UP = 3; // widened span: 6-col void + 1-cube wall each side
let coreC0 = 0, coreRowTop = 0;
if (COMPANION && !SCULPT) {
  const ecx = (eyes.L0 + 1 + eyes.R0) / 2;
  coreC0 = Math.max(0, Math.min(cols - CORE_COLS, Math.round(ecx - CORE_COLS / 2)));
  coreRowTop = Math.max(0, eyes.row - CORE_UP);
  const N = palette.stops.length;
  const have = new Set(cells.map((c) => `${c.col},${c.row}`));
  for (let r = coreRowTop; r < rows; r++) {          // …down to the very bottom
    for (let c = coreC0; c < coreC0 + CORE_COLS; c++) {
      if (have.has(`${c},${r}`)) continue;
      const v = rows > 1 ? r / (rows - 1) : 0.5;
      const st = palette.stops[Math.max(0, Math.min(N - 1, Math.floor(v * N)))];
      cells.push({
        col: c, row: r, alpha: 1, dyeBase: 0.5,
        color: `hsl(${((st.h % 360) + 360) % 360 | 0},${Math.round(st.s * 100)}%,${Math.round(st.l * 100)}%)`,
      } as (typeof cells)[number]);
    }
  }
}

const cellMapIdx = new Map<string, (typeof cells)[number]>();
for (const c of cells) cellMapIdx.set(`${c.col},${c.row}`, c);
const filled2D = (c: number, r: number) =>
  c >= 0 && r >= 0 && c < cols && r < rows && cellMapIdx.has(`${c},${r}`);

// stem extent (for the mound + core zone): widest run of the bottom rows
let stemL = cols, stemR = 0;
for (let r = rows - 3; r < rows; r++)
  for (let c = 0; c < cols; c++)
    if (filled2D(c, r)) { stemL = Math.min(stemL, c); stemR = Math.max(stemR, c); }
const cx = (cols - 1) / 2;

for (const cell of SCULPT ? [] : cells) {
  const solid2D =
    filled2D(cell.col - 1, cell.row) && filled2D(cell.col + 1, cell.row) &&
    filled2D(cell.col, cell.row - 1) && filled2D(cell.col, cell.row + 1);
  let d: number;
  const inCore = COMPANION &&
    cell.col >= coreC0 && cell.col < coreC0 + CORE_COLS && cell.row >= coreRowTop;
  if (COMPANION && !inCore) {
    // stepped relief on BOTH faces: bricks sit at deterministic front/back
    // offsets so the body reads volumetric instead of slab-flat
    d = cell.alpha < 0.9 ? 2 : solid2D ? DEPTH - 1 : 2;
    const play = Z - d;
    const z0c = (cell.col * 7 + cell.row * 13 + h0) % (play + 1);
    const rgb = parse(cell.color);
    const y = rows - 1 - cell.row + MOUND;
    for (let dz = 0; dz < d; dz++) {
      const i = at(cell.col, y, z0c + dz);
      grid[i] = 1; colors.set(i, rgb); alpha.set(i, cell.alpha);
    }
    continue;
  }
  if (inCore) {
    d = DEPTH;                                  // core footprint: full depth, no gaps
  } else if (ROBOT) {
    const coreZone = Math.abs(cell.col - cx) <= 3.2 && cell.row >= eyes.row - 1;
    d = cell.alpha < 0.9 ? 1 : coreZone ? CORE_D : solid2D ? 3 : 2;
  } else {
    d = cell.alpha < 0.9 ? 1 : solid2D ? DEPTH : Math.max(1, DEPTH - 1);
  }
  const rgb = parse(cell.color);
  const y = rows - 1 - cell.row + MOUND;
  // robot: front flush. --flushback: back flush (flat lying face, prints
  // support-free). default: centred in depth.
  const z0 = ROBOT ? Z - d
    : process.argv.includes('--flushback') ? 0
    : Math.floor((Z - d) / 2);
  for (let dz = 0; dz < d; dz++) {
    const i = at(cell.col, y, z0 + dz);
    grid[i] = 1;
    colors.set(i, rgb);
    alpha.set(i, cell.alpha);
  }
}

// ---------- 1.5) --sculpt: 塑形台管线(与工具逐位一致) ----------
let sculptZone: { tx: number; ty: number } | null = null;
if (SCULPT) {
  const SP = JSON.parse(fs.readFileSync(SCULPT, 'utf8'));
  const p = SP.params, edits = SP.edits ?? { adds: [], dels: [] };
  const mulberry32 = (a: number) => () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const body: boolean[][] = Array.from({ length: rows }, () => new Array(cols).fill(false));
  const colr = new Map<string, [number, number, number]>();
  for (const c of cells) {
    const yb = rows - 1 - c.row;
    body[yb][c.col] = true;
    colr.set(c.col + ',' + yb, parse(c.color));
  }
  // EDT(暴力,含边界外圈)
  const edgeL: number[][] = [];
  for (let y = -1; y <= rows; y++) for (let x = -1; x <= cols; x++)
    if (!(y >= 0 && y < rows && x >= 0 && x < cols && body[y][x])) edgeL.push([x, y]);
  const edt = Array.from({ length: rows }, () => new Array(cols).fill(0));
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
    if (!body[y][x]) continue;
    let m = 1e18;
    for (const [ex, ey] of edgeL) { const dx = x - ex, dy = y - ey; const q = dx * dx + dy * dy; if (q < m) m = q; }
    edt[y][x] = Math.sqrt(m);
  }
  // 白云
  const K = p.cloudK | 0, rngW = mulberry32(1100);
  const white = Array.from({ length: rows }, () => new Array(cols).fill(false));
  if (K > 0) {
    for (let x = 0; x < cols; x++) {
      let first = -1;
      for (let y = 0; y < rows; y++) if (body[y][x]) { first = y; break; }
      if (first > 0 && first <= K) for (let y = 0; y < first; y++) white[y][x] = true;
    }
    for (let y = 0; y < Math.min(2, rows); y++) for (let x = 0; x < cols; x++) {
      if (body[y][x] || white[y][x]) continue;
      let L = false, R = false;
      for (let k = 1; k <= 2; k++) {
        if (x - k >= 0 && (body[y][x - k] || white[y][x - k])) L = true;
        if (x + k < cols && (body[y][x + k] || white[y][x + k])) R = true;
      }
      if (L && R) white[y][x] = true;
    }
    for (let x = 0; x < cols; x++) {
      let top = -1;
      for (let y = rows - 1; y >= 0; y--) if (white[y][x]) { top = y; break; }
      if (top > 0 && rngW() < p.erode) white[top][x] = false;
    }
  }
  // 椭球包络
  let sx = 0, sy = 0, n = 0, minx = 1e9, maxx = -1e9, miny = 1e9, maxy = -1e9;
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) if (body[y][x]) {
    sx += x; sy += y; n++;
    minx = Math.min(minx, x); maxx = Math.max(maxx, x);
    miny = Math.min(miny, y); maxy = Math.max(maxy, y);
  }
  const ecx2 = sx / n, ecy2 = sy / n + p.cy;
  const aE = Math.max((maxx - minx) / 2, 1) * p.ax, bE = Math.max((maxy - miny) / 2, 1) * p.ay;
  const half = Array.from({ length: rows }, () => new Array(cols).fill(0));
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
    if (!body[y][x]) continue;
    const r2 = ((x - ecx2) / aE) ** 2 + ((y - ecy2) / bE) ** 2;
    const env = p.halfMax * Math.pow(Math.max(0, 1 - r2), p.power);
    half[y][x] = Math.max(0, Math.min(Math.round(env), Math.ceil(edt[y][x] * p.cap)));
  }
  // 核心舱 7×7:贴地 + 中轴
  let coreW: [number, number] | null = null;
  if (p.core) {
    let bodyBottom = 0;
    for (let y = 0; y < rows; y++) { if (body[y].some((v: boolean) => v)) { bodyBottom = y; break; } }
    let bminx = 1e9, bmaxx = -1e9;
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++)
      if (body[y][x]) { bminx = Math.min(bminx, x); bmaxx = Math.max(bmaxx, x); }
    const axisX = (bminx + bmaxx + 1) / 2;
    let bestTy = bodyBottom;
    if (!p.coreGround) {
      let best: [number, number] | null = null;
      for (let ty = 0; ty + 7 <= rows; ty++) {
        const tx0 = Math.round(axisX - 3.5);
        let miss = 0;
        for (let yy = ty; yy < ty + 7; yy++) for (let xx = tx0; xx < tx0 + 7; xx++)
          if (xx < 0 || xx >= cols || !body[yy][xx]) miss++;
        const cyc = (ty + 3.5) / rows, bias = (cyc >= 0.4 && cyc <= 0.8) ? 0 : 5;
        if (best === null || miss + bias < best[0]) best = [miss + bias, ty];
      }
      bestTy = best![1];
    }
    const tx = Math.max(0, Math.min(cols - 7, Math.round(axisX - 3.5) + p.coreDX));
    const ty = p.coreGround ? bestTy : Math.max(0, Math.min(rows - 7, bestTy + p.coreDY));
    coreW = [tx, ty];
    for (let yy = ty; yy < ty + 7; yy++) for (let xx = tx; xx < tx + 7; xx++) {
      if (!body[yy][xx]) {
        body[yy][xx] = true;
        out: for (let rr = 1; rr < 6; rr++)
          for (let dy = -rr; dy <= rr; dy++) for (let dx = -rr; dx <= rr; dx++) {
            const k = (xx + dx) + ',' + (yy + dy);
            if (colr.has(k)) { colr.set(xx + ',' + yy, colr.get(k)!); break out; }
          }
      }
      half[yy][xx] = Math.max(half[yy][xx], 1);
    }
    sculptZone = { tx, ty };
  }
  // 铺体素(工具坐标:zb 小 = 前;引擎 z = 11 - zb)
  const Zb = 12, MIDb = 5;
  const inCore = (x: number, y: number) =>
    coreW !== null && x >= coreW[0] && x < coreW[0] + 7 && y >= coreW[1] && y < coreW[1] + 7;
  const vox = new Map<string, [number, number, number]>();
  const rngJ = mulberry32(1111);
  const WHITE_RGB: [number, number, number] = [242, 239, 230];
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
    if (body[y][x]) {
      const h = half[y][x];
      const rgb = colr.get(x + ',' + y) ?? [176, 172, 160] as [number, number, number];
      let z0: number, z1: number;
      if (inCore(x, y)) {
        const tot = Math.max(2 * h + 1, 3);
        z1 = MIDb + 1; z0 = z1 - (tot - 1);
      } else if (p.jitter && h > 0 && rngJ() < 0.5) {
        z0 = MIDb - h + 1; z1 = MIDb + h;
      } else {
        z0 = MIDb - h; z1 = MIDb + h;
      }
      for (let z = z0; z <= z1; z++) vox.set(x + ',' + z + ',' + y, rgb);
    } else if (white[y][x]) {
      for (let z = MIDb; z < MIDb + p.cloudD; z++) vox.set(x + ',' + z + ',' + y, WHITE_RGB);
    }
  }
  // 芽突
  const rngB = mulberry32(11);
  const inner: [number, number][] = [];
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++)
    if (body[y][x] && edt[y][x] >= 2 && !inCore(x, y)) inner.push([x, y]);
  for (let i = inner.length - 1; i > 0; i--) { const j = (rngB() * (i + 1)) | 0; [inner[i], inner[j]] = [inner[j], inner[i]]; }
  let fb = 0;
  for (const [x, y] of inner) {
    if (fb >= p.budsFB) break;
    const zs: number[] = [];
    for (let z = 0; z < Zb; z++) if (vox.has(x + ',' + z + ',' + y)) zs.push(z);
    if (!zs.length) continue;
    const z = fb % 2 === 0 ? zs[0] - 1 : zs[zs.length - 1] + 1;
    const k = x + ',' + z + ',' + y;
    if (z >= 0 && z < Zb && !vox.has(k)) { vox.set(k, colr.get(x + ',' + y)!); fb++; }
  }
  const sidesList: [number, number, number][] = [];
  for (let y = 3; y < rows; y++) for (let x = 0; x < cols; x++) {
    if (!body[y][x]) continue;
    for (const dx of [-1, 1]) {
      const nx = x + dx;
      if (nx >= 0 && nx < cols && !body[y][nx] && !white[y][nx]) sidesList.push([x, y, dx]);
    }
  }
  for (let i = sidesList.length - 1; i > 0; i--) { const j = (rngB() * (i + 1)) | 0; [sidesList[i], sidesList[j]] = [sidesList[j], sidesList[i]]; }
  let sb = 0;
  for (const [x, y, dx] of sidesList) {
    if (sb >= p.budsS) break;
    const zs: number[] = [];
    for (let z = 0; z < Zb; z++) if (vox.has(x + ',' + z + ',' + y)) zs.push(z);
    if (!zs.length) continue;
    const z = zs[(zs.length / 2) | 0];
    const k = (x + dx) + ',' + z + ',' + y;
    let colEmpty = true;
    for (let zz = 0; zz < Zb; zz++) if (vox.has((x + dx) + ',' + zz + ',' + y)) { colEmpty = false; break; }
    if (colEmpty && !vox.has(k)) { vox.set(k, colr.get(x + ',' + y)!); sb++; }
  }
  // 手工修改
  console.log(`sculpt-debug: pre-edit ${vox.size} · fb=${fb} sb=${sb}`);
  for (const [dx_, dz_, dy_] of edits.dels ?? []) {
    const kk = dx_ + ',' + dz_ + ',' + dy_;
    if (!vox.delete(kk)) console.log('  del MISS:', kk);
  }
  for (const ad of edits.adds ?? []) {
    const [ax_, az_, ay_, hex] = ad;
    const rgb: [number, number, number] = [
      parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
    vox.set(ax_ + ',' + az_ + ',' + ay_, rgb);
  }
  // 写进引擎网格(z 翻转:引擎 front = Z-1)
  for (const [k, rgb] of vox) {
    const [x, zb, y] = k.split(',').map(Number);
    if (!inb(x, y, (Zb - 1) - zb)) { console.log('  OUT OF GRID:', k); continue; }
    const i = at(x, y, (Zb - 1) - zb);
    grid[i] = 1; colors.set(i, rgb); alpha.set(i, 1);
  }
  console.log(`sculpt: ${vox.size} cubes (bench said ${SP.cubes ?? '—'})`);
}

if (ROBOT) {
  // pixel mound under the stem — the creature's own ground, hiding the base
  const groundStop = palette.stops[0];
  for (let m = 0; m < MOUND; m++) {
    const y = MOUND - 1 - m;                 // m=0 upper mound row
    const grow = 2 + m;                      // widen per row
    const l = Math.max(0, stemL - grow), rr = Math.min(cols - 1, stemR + grow);
    for (let c = l; c <= rr; c++)
      for (let dz = 0; dz < Math.min(Z, CORE_D + 1); dz++) {
        const i = at(c, y, Z - 1 - dz);
        grid[i] = 1;
        const jig = ((c * 7 + m * 13) % 5) * 0.02;
        colors.set(i, hsl2rgb(groundStop.h, groundStop.s * 0.55, Math.max(0.2, groundStop.l - 0.14 + jig)));
        alpha.set(i, 1);
      }
  }
  // interior walls come from the slicer (0% infill + 3-4 perimeters);
  // here we only open the apertures.
  // ports as missing bricks: mic at the mouth, speaker grille on the
  // mound front, USB notch at the back bottom — the creature's own
  // dither language doing the engineering work.
  const punch = (x: number, y: number, z: number) => {
    if (!inb(x, y, z)) return;
    const i = at(x, y, z);
    grid[i] = 0; colors.delete(i); alpha.delete(i);
  };
  const mouthY = rows - 1 - (eyes.row + 2) + MOUND;
  punch(Math.round(cx), mouthY, Z - 1);                        // mic @ mouth
  for (const dx of [-1, 0, 1]) punch(Math.round(cx) + dx, MOUND, 0); // bottom vents (speaker fires down)
  // back-of-head magnetic door: 3×3 opening behind the cap
  const doorY = rows - 1 - eyes.row + MOUND + 1;
  for (let dy = 0; dy < 3; dy++)
    for (let dx = -1; dx <= 1; dx++) punch(Math.round(cx) + dx, doorY + dy, 0);
}
// --dock: emit a standalone charging tray instead of a creature —
// 6×5 bricks (120×100mm), 1-brick floor + half-brick rim, pogo pins
// and magnets land on the floor plate.
if (process.argv.includes('--dock')) {
  grid.fill(0); colors.clear(); alpha.clear();
  const dw = 6, dd = 5;
  const stop = palette.stops[0];
  const dcol = hsl2rgb(stop.h, stop.s * 0.5, Math.max(0.22, stop.l - 0.16));
  for (let x = 0; x < Math.min(X, dw); x++)
    for (let z = 0; z < Math.min(Z, dd); z++) {
      const i = at(x, 0, z);
      grid[i] = 1; colors.set(i, dcol); alpha.set(i, 1);
      const rim = x === 0 || z === 0 || x === dw - 1 || z === dd - 1;
      if (rim && Y > 1) { const j = at(x, 1, z); grid[j] = 1; colors.set(j, dcol); alpha.set(j, 1); }
    }
}

// ---------- 3) the face, straight from the engine spec ----------
// (sculpt 模式跳过:眼睛由外壳眼件承担,不改体素)
const WHITE: [number, number, number] = [246, 246, 241];
const BLACK: [number, number, number] = [18, 18, 18];
const eyeY = rows - 1 - eyes.row + MOUND;
for (const [c, col] of SCULPT ? [] : [
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
// sculpt 模式跳过:白云/芽是有意的近邻件,工具所见即所得
if (!SCULPT) {
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

const FACES: Array<{ d: V; q: [V, V, V, V] }> = [
  { d: [1, 0, 0],  q: [[1,0,0],[1,1,0],[1,1,1],[1,0,1]] },
  { d: [-1, 0, 0], q: [[0,0,1],[0,1,1],[0,1,0],[0,0,0]] },
  { d: [0, 1, 0],  q: [[0,1,0],[0,1,1],[1,1,1],[1,1,0]] },
  { d: [0, -1, 0], q: [[0,0,0],[1,0,0],[1,0,1],[0,0,1]] },
  { d: [0, 0, 1],  q: [[0,0,1],[1,0,1],[1,1,1],[0,1,1]] },
  { d: [0, 0, -1], q: [[0,0,0],[0,1,0],[1,1,0],[1,0,0]] },
];
const STUD_R = 0.3, STUD_H = 0.18, STUD_N = 16, SINK = 0.02;
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
    JSON.stringify({
      name, text, family: FAMS[charId], sporeId, dims: [X, Y, Z], mm, voxels: vox,
      zone: sculptZone ?? undefined,
      anchor: COMPANION ? {
        coreC0, coreRowTop, coreCols: CORE_COLS,
        voidC0: coreC0 + 1, voidCols: 5,
        eyeRow: eyes.row, L0: eyes.L0, R0: eyes.R0, rows, cols,
      } : undefined,
    }));
}

let blocks = 0; for (let i = 0; i < grid.length; i++) if (grid[i]) blocks++;
console.log(`${name}: ${sporeId} family=${FAMS[charId]} blocks=${blocks} grid=${X}×${Y}×${Z} tris=${tris.length} print=${(X*mm).toFixed(0)}×${(Z*mm).toFixed(0)}×${(Y*mm).toFixed(0)}mm`);
