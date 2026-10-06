/**
 * jewel_batch — production planning for a batch of wearable spores.
 *
 * Reads design/jewel_batch.json (which sentences, as which piece, how many),
 * runs scripts/spore_jewel.mts for each, then lays the parts out on print
 * beds the way a single-colour printer wants them:
 *
 *   beds/bed_<spool>.stl   ONE STL per spool colour: every plate printed in that colour plus every
 *                          tessera of that colour across all designs, in labelled blocks per
 *                          size × height step (+spare %); overflow → _2, _3…
 *   *.svg beside each bed  layout preview with labels
 *   batch_manifest.json / .md           per-bed contents and per-design part lists
 *   designs/<name>/…                    each design's own files (plate, tiles, map, views)
 *
 *   The manifest's "uniform" block applies one cell/base/pocket/relief to every design so all tiles
 *   are interchangeable across the batch (default in design/jewel_batch.json).
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
// uniform spec: one cell / plate / pocket / relief for every design, so every tile (eyes included) is
// interchangeable across the whole batch; omit "uniform" in the manifest to use the per-piece presets
const UNI: { cell: number; base: number; pocket: number; relief: number } | null = M.uniform ?? null;
for (const d of ['designs', 'beds']) fs.mkdirSync(path.join(outDir, d), { recursive: true });

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
  if (UNI) args.push('--cell', String(UNI.cell), '--base', String(UNI.base), '--pocket', String(UNI.pocket), '--relief', String(UNI.relief));
  const r = spawnSync('npx', args, { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(r.stderr || r.stdout);
  for (const suffix of d.piece === 'earring' ? ['_L', '_R'] : ['']) {
    const pj = JSON.parse(fs.readFileSync(path.join(dir, `${name}${suffix}_parts.json`), 'utf8'));
    designs.push({ name: name + suffix, dir, text: d.text, family: pj.family, piece: d.piece, qty: d.qty ?? 1, sporeId: pj.sporeId, mirror: pj.mirror, cell: pj.cell, tile: pj.tile, parts: pj.parts });
  }
  console.log(`${name}: ${d.text} → ${r.stdout.trim().split('\n').pop()?.split('·').slice(3, 5).join('·').trim()}`);
}

// ---------- 2) one bed per spool: its plates + all its tiles (every size and height, in labelled blocks) ----------
interface Item { w: number; h: number; label: string; hex: string; tris: Tri[]; svg: string; x?: number; y?: number }
const footprint = (tris: Tri[]) => tris.filter((t) => t.n[2] < -0.5).map((t) => `M${t.a[0].toFixed(2)} ${t.a[1].toFixed(2)}L${t.b[0].toFixed(2)} ${t.b[1].toFixed(2)}L${t.c[0].toFixed(2)} ${t.c[1].toFixed(2)}Z`).join('');
const LABEL_H = 5;                                              // mm above every item for its label
function packBeds(items: Item[], gap: number): Item[][] {
  const beds: Item[][] = [];
  const sorted = [...items].sort((a, b) => b.h - a.h || b.w - a.w);
  let bed: Item[] = [], x = gap, y = gap, rowH = 0;
  for (const it of sorted) {
    if (x + it.w + gap > BED) { x = gap; y += rowH + gap; rowH = 0; }
    if (y + it.h + LABEL_H + gap > BED && bed.length) { beds.push(bed); bed = []; x = gap; y = gap; rowH = 0; }
    it.x = x; it.y = y; bed.push(it); x += it.w + gap; rowH = Math.max(rowH, it.h + LABEL_H);
  }
  if (bed.length) beds.push(bed);
  return beds;
}
function bedSVG(file: string, bed: Item[], title: string) {
  const items = bed.map((p) => `<g transform="translate(${p.x} ${BED - p.y!}) scale(1 -1)">${p.svg}</g><text x="${p.x}" y="${BED - p.y! - p.h - 1.5}" font-size="2.6" fill="#333">${p.label.replace(/[<&]/g, ' ')}</text>`);
  fs.writeFileSync(file, `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${BED + 20}mm" height="${BED + 28}mm" viewBox="-10 -18 ${BED + 20} ${BED + 28}" font-family="'Noto Sans CJK SC',sans-serif">
  <rect x="-10" y="-18" width="${BED + 20}" height="${BED + 28}" fill="#fff"/>
  <text x="0" y="-8" font-size="5" fill="#222">${title.replace(/[<&]/g, ' ')}</text>
  <rect width="${BED}" height="${BED}" fill="#f4f1ea" stroke="#999" stroke-width="0.4"/>
  ${items.join('\n  ')}
</svg>
`);
}
const manifest: Record<string, unknown> = { bed: BED, spare: SPARE, beds: [] as unknown[], designs: [] as unknown[] };
const md: string[] = [`# 批量排产 · ${designs.length} 件 · 盘 ${BED}×${BED} mm · 备用 ${Math.round(SPARE * 100)}%`, '',
  UNI ? `统一规格:格 ${UNI.cell} · 底板 ${UNI.base} · 口袋 ${UNI.pocket} · 浮雕 ${UNI.relief} → 方片 ${(UNI.cell - 0.4 - 0.2).toFixed(1)} mm 方,所有款通用。` : '各件型用自己的预设(片尺寸不通用)。', '',
  '一种耗材色一个 STL(超出一盘自动分 _2、_3…):里面是这个颜色的全部底板 + 全部马赛克片,片按"方边长 × 高度"分块,块上方有标注。', ''];

// collect per spool
const perSpool = new Map<string, { zh: string; hex: string; items: Item[]; rows: string[] }>();
const spoolOf = (name: string, zh: string, hexc: string) => perSpool.get(name) ?? perSpool.set(name, { zh, hex: hexc, items: [], rows: [] }).get(name)!;
// plates
for (const d of designs) {
  const pl = d.parts.find((p) => p.kind === 'plate')!;
  const raw = readSTL(path.join(d.dir, pl.file));
  const { mn, mx } = bbox(raw);
  const tris = moved(raw, -mn[0], -mn[1], -mn[2]);
  const sp = spoolOf(pl.spool || pl.hex, pl.zh, pl.hex);
  for (let q = 0; q < d.qty; q++)
    sp.items.push({ tris, w: mx[0] - mn[0], h: mx[1] - mn[1], hex: pl.hex, label: `底板 ${d.sporeId}${d.mirror ? ' R' : d.piece === 'earring' ? ' L' : ''}`,
      svg: `<path d="${footprint(tris)}" fill="${pl.hex}" stroke="${pl.hex}" stroke-width="0.05"/>` });
  sp.rows.push(`底板 ${d.sporeId}${d.mirror ? ' R' : d.piece === 'earring' ? ' L' : ''} · ${d.piece}${d.qty > 1 ? ` ×${d.qty}` : ''}`);
}
// tile blocks: (spool, w, h) → one grid block
const tileGroups = new Map<string, { spool: string; zh: string; hex: string; w: number; h: number; count: number; sample: Tri[]; from: string[] }>();
for (const d of designs)
  for (const p of d.parts) {
    if (p.kind !== 'tile') continue;
    const k = `${p.spool || p.hex}|${p.w}|${p.h}`;
    const n = p.count * d.qty;
    const e = tileGroups.get(k);
    if (e) { e.count += n; e.from.push(`${d.sporeId}×${n}`); }
    else tileGroups.set(k, { spool: p.spool || p.hex, zh: p.zh, hex: p.hex, w: p.w!, h: p.h!, count: n, sample: readSTL(path.join(d.dir, p.file)), from: [`${d.sporeId}×${n}`] });
  }
const GAP = 1.0;
for (const g of tileGroups.values()) {
  const total = Math.ceil(g.count * (1 + SPARE));
  const pitch = g.w + GAP;
  const cols = Math.max(1, Math.min(Math.max(Math.ceil(Math.sqrt(total)), Math.ceil(44 / pitch)), Math.floor((BED - 8) / pitch)));
  const rows = Math.ceil(total / cols);
  const tris: Tri[] = [], sq: string[] = [];
  for (let i = 0; i < total; i++) {
    const x = (i % cols) * pitch, y = Math.floor(i / cols) * pitch;
    tris.push(...moved(g.sample, x, y, 0));
    sq.push(`<rect x="${x}" y="${y}" width="${g.w}" height="${g.w}" fill="${g.hex}" stroke="#333" stroke-width="0.1"/>`);
  }
  const sp = spoolOf(g.spool, g.zh, g.hex);
  sp.items.push({ tris, w: cols * pitch, h: rows * pitch, hex: g.hex, label: `片 ${g.w.toFixed(1)} 方 × 高 ${g.h.toFixed(2)} · ${total} 片`, svg: sq.join('') });
  sp.rows.push(`片 ${g.w.toFixed(1)}×${g.w.toFixed(1)}×${g.h.toFixed(2)} · ${total} 片(需 ${g.count};${g.from.join(' ')})`);
}
// pack and write
fs.mkdirSync(path.join(outDir, 'beds'), { recursive: true });
for (const [spool, sp] of [...perSpool].sort()) {
  const beds = packBeds(sp.items, 4);
  md.push(`## ${sp.zh} \`${spool}\` ${sp.hex}`, '');
  beds.forEach((bed, i) => {
    const f = `bed_${spool}${beds.length > 1 ? `_${i + 1}` : ''}`;
    writeSTL(path.join(outDir, 'beds', `${f}.stl`), bed.flatMap((p) => moved(p.tris, p.x!, p.y!, 0)), `mycelium ${spool}`);
    bedSVG(path.join(outDir, 'beds', `${f}.svg`), bed, `${sp.zh} ${spool} · ${beds.length > 1 ? `第 ${i + 1} 盘 · ` : ''}${bed.length} 项`);
    (manifest.beds as unknown[]).push({ file: `beds/${f}.stl`, spool, zh: sp.zh, hex: sp.hex, items: bed.map((p) => p.label) });
    md.push(`- \`beds/${f}.stl\``, ...bed.map((p) => `  - ${p.label}`));
  });
  md.push('');
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
console.log(`\n${perSpool.size} spools → ${(manifest.beds as unknown[]).length} bed STLs\nwrote ${path.join(outDir, 'batch_manifest.md')}`);

// ---------- 5) PNG previews of the beds (optional) ----------
if (!flag('no-png')) {
  try {
    const { chromium } = await import('playwright-core');
    const exe = fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined;
    const browser = await chromium.launch(exe ? { executablePath: exe } : {});
    const page = await browser.newPage({ viewport: { width: 800, height: 830 }, deviceScaleFactor: 1.5 });
    for (const sub of ['beds'])
      for (const f of fs.readdirSync(path.join(outDir, sub)).filter((x) => x.endsWith('.svg'))) {
        const svg = fs.readFileSync(path.join(outDir, sub, f), 'utf8').replace(/^<\?xml[^>]*>\s*/, '').replace(/width="[\d.]+mm" height="[\d.]+mm"/, 'width="800" height="830"');
        await page.setContent(`<body style="margin:0">${svg}</body>`);
        await page.screenshot({ path: path.join(outDir, sub, f.replace(/\.svg$/, '.png')) });
      }
    await browser.close();
  } catch (e) { console.log(`png skipped (${(e as Error).message.split('\n')[0]})`); }
}
