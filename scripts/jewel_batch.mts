/**
 * jewel_batch — production planning for a batch of wearable spores.
 *
 * Reads design/jewel_batch.json (which sentences, as which piece, how many),
 * runs scripts/spore_jewel.mts for each, then lays the parts out on print
 * beds the way a single-colour printer wants them:
 *
 *   plates/bed_plate_<spool>.stl        every plate that prints in that spool, shelf-packed on one bed
 *   tiles/bed_tile_<spool>_<w>x<h>.stl  all tesserae of that colour AND size (height step) across all
 *                                       designs, as a grid, +spare %, split across beds if needed
 *   *.svg beside each bed               layout preview with labels
 *   batch_manifest.json / .md           per-bed contents and per-design part lists
 *   designs/<name>/…                    each design's own files (plate, tiles, map, views)
 *
 *   npx tsx scripts/jewel_batch.mts [--manifest design/jewel_batch.json] [--out out/jewel/batch]
 *       [--bed 180] [--spare 0.1] [--no-png]
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const arg = (k: string, d?: string) => { const i = process.argv.indexOf(`--${k}`); return i >= 0 ? process.argv[i + 1] : d; };
const flag = (k: string) => process.argv.includes(`--${k}`);
const manifestFile = arg('manifest', 'design/jewel_batch.json')!;
const M = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
const BED = Number(arg('bed', String(M.bed ?? 180)));
const SPARE = Number(arg('spare', String(M.spare ?? 0.1)));
const outDir = arg('out', 'out/jewel/batch')!;
for (const d of ['designs', 'plates', 'tiles']) fs.mkdirSync(path.join(outDir, d), { recursive: true });

// ---------- STL helpers ----------
type V = [number, number, number];
interface Tri { n: V; a: V; b: V; c: V }
function readSTL(f: string): Tri[] {
  const b = fs.readFileSync(f); const n = b.readUInt32LE(80); const out: Tri[] = []; let o = 84;
  for (let i = 0; i < n; i++) {
    const v: V[] = [];
    for (let k = 0; k < 4; k++) { v.push([b.readFloatLE(o), b.readFloatLE(o + 4), b.readFloatLE(o + 8)]); o += 12; }
    o += 2; out.push({ n: v[0], a: v[1], b: v[2], c: v[3] });
  }
  return out;
}
function writeSTL(f: string, tris: Tri[], header: string) {
  const buf = Buffer.alloc(84 + tris.length * 50);
  buf.write(header.slice(0, 79), 0, 'ascii'); buf.writeUInt32LE(tris.length, 80);
  let o = 84;
  for (const t of tris) for (const v of [t.n, t.a, t.b, t.c]) { for (const c of v) { buf.writeFloatLE(c, o); o += 4; } if (v === t.c) { buf.writeUInt16LE(0, o); o += 2; } }
  fs.writeFileSync(f, buf);
}
const bbox = (tris: Tri[]) => {
  const mn: V = [1e9, 1e9, 1e9], mx: V = [-1e9, -1e9, -1e9];
  for (const t of tris) for (const v of [t.a, t.b, t.c]) for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], v[k]); mx[k] = Math.max(mx[k], v[k]); }
  return { mn, mx };
};
const moved = (tris: Tri[], dx: number, dy: number, dz: number): Tri[] =>
  tris.map((t) => ({ n: t.n, a: [t.a[0] + dx, t.a[1] + dy, t.a[2] + dz], b: [t.b[0] + dx, t.b[1] + dy, t.b[2] + dz], c: [t.c[0] + dx, t.c[1] + dy, t.c[2] + dz] }));

// ---------- 1) generate every design ----------
interface Part { group: string; spool: string; zh: string; hex: string; kind: string; file: string; count: number; w?: number; h?: number; step?: number }
interface Design { name: string; dir: string; text: string; family: string; piece: string; qty: number; sporeId: string; mirror: boolean; cell: number; tile: number; parts: Part[] }
const designs: Design[] = [];
for (const [i, d] of (M.designs as Array<{ text: string; family?: string; piece: string; qty?: number }>).entries()) {
  const name = `d${String(i + 1).padStart(2, '0')}_${d.piece}`;
  const dir = path.join(outDir, 'designs', name);
  fs.mkdirSync(dir, { recursive: true });
  const args = ['tsx', 'scripts/spore_jewel.mts', '--text', d.text, '--piece', d.piece, '--name', name, '--out', dir];
  if (d.family) args.push('--family', d.family);
  const r = spawnSync('npx', args, { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(r.stderr || r.stdout);
  for (const suffix of d.piece === 'earring' ? ['_L', '_R'] : ['']) {
    const pj = JSON.parse(fs.readFileSync(path.join(dir, `${name}${suffix}_parts.json`), 'utf8'));
    designs.push({ name: name + suffix, dir, text: d.text, family: pj.family, piece: d.piece, qty: d.qty ?? 1, sporeId: pj.sporeId, mirror: pj.mirror, cell: pj.cell, tile: pj.tile, parts: pj.parts });
  }
  console.log(`${name}: ${d.text} → ${r.stdout.trim().split('\n').pop()?.split('·').slice(3, 5).join('·').trim()}`);
}

// ---------- 2) plates: group by plate spool, shelf-pack on beds ----------
interface Placed { tris: Tri[]; w: number; h: number; label: string; hex: string; x?: number; y?: number; outline?: string }
// the plate's real footprint for the preview: its downward-facing faces, as polygons (model mm, y up)
const footprint = (tris: Tri[]) => tris.filter((t) => t.n[2] < -0.5).map((t) => `M${t.a[0].toFixed(2)} ${t.a[1].toFixed(2)}L${t.b[0].toFixed(2)} ${t.b[1].toFixed(2)}L${t.c[0].toFixed(2)} ${t.c[1].toFixed(2)}Z`).join('');
function packBeds(items: Placed[], gap: number): Placed[][] {
  const beds: Placed[][] = [];
  const sorted = [...items].sort((a, b) => b.h - a.h);
  let bed: Placed[] = [], x = gap, y = gap, rowH = 0;
  const open = () => { if (bed.length) beds.push(bed); bed = []; x = gap; y = gap; rowH = 0; };
  for (const it of sorted) {
    const lab = it.outline ? 4 : 0;   // room for the label above a plate
    if (x + it.w + gap > BED) { x = gap; y += rowH + gap; rowH = 0; }
    if (y + it.h + lab + gap > BED) open();
    it.x = x; it.y = y; bed.push(it); x += it.w + gap; rowH = Math.max(rowH, it.h + lab);
  }
  if (bed.length) beds.push(bed);
  return beds;
}
function bedSVG(file: string, bed: Placed[], title: string, labels: string[] = []) {
  const sc = 1;   // mm
  const lab = labels.map((l) => { const [x, y, t] = l.split('|'); return `<text x="${x}" y="${BED - +y - 1}" font-size="2.8" fill="#333">${t}</text>`; });
  const items = bed.map((p) => `<g transform="translate(${p.x} ${BED - p.y!}) scale(1 -1)">${p.outline
    ? `<path d="${p.outline}" fill="${p.hex}" stroke="${p.hex}" stroke-width="0.05"/>`
    : `<rect width="${p.w}" height="${p.h}" fill="${p.hex}" fill-opacity="0.85" stroke="#333" stroke-width="0.2"/>`}</g>${p.w > 12 ? `<text x="${p.x! + p.w / 2}" y="${BED - p.y! - p.h - 1.5}" font-size="2.4" text-anchor="middle" fill="#333">${p.label}</text>` : ''}`);
  fs.writeFileSync(file, `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${(BED + 20) * sc}mm" height="${(BED + 28) * sc}mm" viewBox="-10 -18 ${BED + 20} ${BED + 28}" font-family="'Noto Sans CJK SC',sans-serif">
  <rect x="-10" y="-18" width="${BED + 20}" height="${BED + 28}" fill="#fff"/>
  <text x="0" y="-8" font-size="5" fill="#222">${title.replace(/[<&]/g, ' ')}</text>
  <rect width="${BED}" height="${BED}" fill="#f4f1ea" stroke="#999" stroke-width="0.4"/>
  ${items.join('\n  ')}
  ${lab.join('\n  ')}
</svg>
`);
}
const manifest: Record<string, unknown> = { bed: BED, spare: SPARE, plates: [] as unknown[], tiles: [] as unknown[], designs: [] as unknown[] };
const md: string[] = [`# 批量排产 · ${designs.length} 件 · 盘 ${BED}×${BED} mm · 备用 ${Math.round(SPARE * 100)}%`, ''];

const plateGroups = new Map<string, Placed[]>();
for (const d of designs) {
  const pl = d.parts.find((p) => p.kind === 'plate')!;
  const tris = readSTL(path.join(d.dir, pl.file));
  const { mn, mx } = bbox(tris);
  for (let q = 0; q < d.qty; q++)
    (plateGroups.get(pl.spool || pl.hex) ?? plateGroups.set(pl.spool || pl.hex, []).get(pl.spool || pl.hex)!)
      .push({ tris: moved(tris, -mn[0], -mn[1], -mn[2]), w: mx[0] - mn[0], h: mx[1] - mn[1], label: `${d.sporeId}${d.mirror ? ' R' : d.piece === 'earring' ? ' L' : ''}`, hex: pl.hex, outline: footprint(moved(tris, -mn[0], -mn[1], -mn[2])) });
}
md.push('## 底板盘(每盘一种底板色)', '');
for (const [spool, items] of [...plateGroups].sort()) {
  const zh = designs.flatMap((d) => d.parts).find((p) => p.spool === spool)?.zh ?? '';
  const beds = packBeds(items, 4);
  beds.forEach((bed, i) => {
    const f = `bed_plate_${spool}${beds.length > 1 ? `_${i + 1}` : ''}`;
    writeSTL(path.join(outDir, 'plates', `${f}.stl`), bed.flatMap((p) => moved(p.tris, p.x!, p.y!, 0)), `mycelium plates ${spool}`);
    bedSVG(path.join(outDir, 'plates', `${f}.svg`), bed, `底板盘 · ${zh} ${spool} · ${bed.length} 块`);
    (manifest.plates as unknown[]).push({ file: `plates/${f}.stl`, spool, zh, count: bed.length, items: bed.map((p) => p.label) });
    md.push(`- \`plates/${f}.stl\` · **${zh} ${spool}** · ${bed.length} 块:${bed.map((p) => p.label).join(', ')}`);
  });
}

// ---------- 3) tiles: one bed per colour; inside it one labelled block per (size, height) ----------
interface TileKey { spool: string; zh: string; hex: string; w: number; h: number }
const tileGroups = new Map<string, { key: TileKey; count: number; sample: Tri[]; from: string[] }>();
for (const d of designs)
  for (const p of d.parts) {
    if (p.kind !== 'tile') continue;
    const k = `${p.spool || p.hex}|${p.w}|${p.h}`;
    const e = tileGroups.get(k);
    const n = p.count * d.qty;
    if (e) { e.count += n; e.from.push(`${d.sporeId}×${n}`); }
    else tileGroups.set(k, { key: { spool: p.spool || p.hex, zh: p.zh, hex: p.hex, w: p.w!, h: p.h! }, count: n, sample: readSTL(path.join(d.dir, p.file)), from: [`${d.sporeId}×${n}`] });
  }
md.push('', '## 马赛克片盘(每盘一种颜色;盘内按 尺寸×高度 分块,已含备用)', '', '| 盘 | 块 | 片(方×高) | 数量 | 来自 |', '|---|---|---|---|---|');
const GAP = 1.0, BLOCK_GAP = 8;
const bySpool = new Map<string, Array<typeof tileGroups extends Map<string, infer T> ? T : never>>();
for (const g of tileGroups.values()) (bySpool.get(g.key.spool) ?? bySpool.set(g.key.spool, []).get(g.key.spool)!).push(g);
for (const [spool, groups] of [...bySpool].sort()) {
  const zh = groups[0].key.zh;
  // blocks: taller/larger first, each a square-ish grid; shelf-pack the blocks, overflow → next bed
  const blocks = groups.sort((a, b) => b.key.w - a.key.w || b.key.h - a.key.h).map((g) => {
    const total = Math.ceil(g.count * (1 + SPARE));
    const pitch = g.key.w + GAP;
    // wide enough for its label (~40 mm) and roughly square otherwise
    const cols = Math.max(1, Math.min(Math.max(Math.ceil(Math.sqrt(total)), Math.ceil(40 / pitch)), Math.floor((BED - 2 * BLOCK_GAP) / pitch)));
    const rows = Math.ceil(total / cols);
    return { g, total, pitch, cols, rows, w: cols * pitch, h: rows * pitch + 5 };   // +5 mm for the label row
  });
  let bedIdx = 0, x = BLOCK_GAP, y = BLOCK_GAP, rowH = 0;
  let tris: Tri[] = [], items: Placed[] = [], labels: string[] = [], rowsMd: string[] = [];
  const flush = () => {
    if (!items.length) return;
    bedIdx++;
    const f = `bed_tile_${spool}_${bedIdx}`;
    writeSTL(path.join(outDir, 'tiles', `${f}.stl`), tris, `mycelium tiles ${spool}`);
    bedSVG(path.join(outDir, 'tiles', `${f}.svg`), items, `片盘 · ${zh} ${spool} · 第 ${bedIdx} 盘 · ${items.length} 片`, labels);
    (manifest.tiles as unknown[]).push({ file: `tiles/${f}.stl`, spool, zh, count: items.length, blocks: rowsMd.length });
    for (const r of rowsMd) md.push(r.replace('{BED}', `tiles/${f}.stl`));
    tris = []; items = []; labels = []; rowsMd = []; x = BLOCK_GAP; y = BLOCK_GAP; rowH = 0;
  };
  for (const b of blocks) {
    if (x + b.w + BLOCK_GAP > BED) { x = BLOCK_GAP; y += rowH + BLOCK_GAP; rowH = 0; }
    if (y + b.h + BLOCK_GAP > BED) { flush(); }
    for (let i = 0; i < b.total; i++) {
      const tx = x + (i % b.cols) * b.pitch, ty = y + Math.floor(i / b.cols) * b.pitch;
      tris.push(...moved(b.g.sample, tx, ty, 0));
      items.push({ tris: [], w: b.g.key.w, h: b.g.key.w, label: '', hex: b.g.key.hex, x: tx, y: ty });
    }
    labels.push(`${x}|${y + b.rows * b.pitch + 0.5}|${b.g.key.w.toFixed(1)} 方 × 高 ${b.g.key.h.toFixed(2)} · ${b.total} 片`);
    rowsMd.push(`| \`{BED}\` | ${zh} ${spool} | ${b.g.key.w.toFixed(1)}×${b.g.key.w.toFixed(1)}×${b.g.key.h.toFixed(2)} | ${b.total}(需 ${b.g.count}) | ${b.g.from.join(' ')} |`);
    x += b.w + BLOCK_GAP; rowH = Math.max(rowH, b.h);
  }
  flush();
}

// ---------- 4) per-design summary ----------
md.push('', '## 每款零件', '');
for (const d of designs) {
  const tiles = d.parts.filter((p) => p.kind === 'tile');
  md.push(`- **${d.sporeId}${d.mirror ? ' (R)' : d.piece === 'earring' ? ' (L)' : ''}** · ${d.piece} · “${d.text}” · 底板 ${d.parts.find((p) => p.kind === 'plate')!.zh} · ${tiles.reduce((a, p) => a + p.count, 0)} 片:${tiles.map((p) => `${p.zh}${p.step && p.step > 1 ? `高${p.step}` : tiles.filter((q) => q.spool === p.spool).length > 1 ? '高1' : ''}×${p.count}`).join(' ')} · 图纸 \`designs/${d.name.replace(/_[LR]$/, '')}/${d.name}_map.svg\``);
  (manifest.designs as unknown[]).push({ ...d, parts: d.parts, dir: undefined });
}
fs.writeFileSync(path.join(outDir, 'batch_manifest.json'), JSON.stringify(manifest, null, 1));
fs.writeFileSync(path.join(outDir, 'batch_manifest.md'), md.join('\n') + '\n');
console.log(`\n${plateGroups.size} plate colours → ${(manifest.plates as unknown[]).length} beds · ${tileGroups.size} tile kinds → ${(manifest.tiles as unknown[]).length} beds\nwrote ${path.join(outDir, 'batch_manifest.md')}`);

// ---------- 5) PNG previews of the beds (optional) ----------
if (!flag('no-png')) {
  try {
    const { chromium } = await import('playwright-core');
    const exe = fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined;
    const browser = await chromium.launch(exe ? { executablePath: exe } : {});
    const page = await browser.newPage({ viewport: { width: 800, height: 830 }, deviceScaleFactor: 1.5 });
    for (const sub of ['plates', 'tiles'])
      for (const f of fs.readdirSync(path.join(outDir, sub)).filter((x) => x.endsWith('.svg'))) {
        const svg = fs.readFileSync(path.join(outDir, sub, f), 'utf8').replace(/^<\?xml[^>]*>\s*/, '').replace(/width="[\d.]+mm" height="[\d.]+mm"/, 'width="800" height="830"');
        await page.setContent(`<body style="margin:0">${svg}</body>`);
        await page.screenshot({ path: path.join(outDir, sub, f.replace(/\.svg$/, '.png')) });
      }
    await browser.close();
  } catch (e) { console.log(`png skipped (${(e as Error).message.split('\n')[0]})`); }
}
