/**
 * jewel_catalog — render a design catalogue of wearable spores: every named
 * palette × a few sentences, plus the three piece types, as one HTML sheet
 * (and a PNG when playwright-core + the bundled Chromium are available).
 *
 *   npx tsx scripts/jewel_catalog.mts [--texts "句子一|句子二|…"] [--palettes cream,ocean|all]
 *       [--piece charm] [--out out/jewel/catalog] [--per-page 4] [--no-png]
 *
 * Each cell is produced by scripts/spore_jewel.mts with a fixed --cell per
 * piece type, so eye tiles stay interchangeable across the whole sheet.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { PALETTES, PALETTE_NAMES } from './jewel_palettes';

const arg = (k: string, d?: string) => { const i = process.argv.indexOf(`--${k}`); return i >= 0 ? process.argv[i + 1] : d; };
const texts = arg('texts', '轻轻地生长|今晚的月亮很安静|I miss the sea|把今天的我留在这里')!.split('|');
const pals = arg('palettes', 'all') === 'all' ? PALETTE_NAMES : arg('palettes')!.split(',');
const piece = arg('piece', 'charm')!;
const outDir = arg('out', 'out/jewel/catalog')!;
const CELL: Record<string, number> = { pendant: 2.3, charm: 1.7, earring: 1.4 };
fs.mkdirSync(path.join(outDir, 'parts'), { recursive: true });

function gen(text: string, pal: string, pc: string, name: string): { svg: string; info: Record<string, unknown> } {
  const r = spawnSync('npx', ['tsx', 'scripts/spore_jewel.mts', '--text', text, '--piece', pc, '--palette', pal,
    '--cell', String(CELL[pc]), '--name', name, '--out', path.join(outDir, 'parts')], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(r.stderr || r.stdout);
  const info = JSON.parse(fs.readFileSync(path.join(outDir, 'parts', `${name}.json`), 'utf8'))[0];
  const svgFile = path.join(outDir, 'parts', `${name}${pc === 'earring' ? '_L' : ''}.svg`);
  return { svg: fs.readFileSync(svgFile, 'utf8'), info };
}
// inline an SVG at a fixed scale (px per mm), stripping the xml prolog
const inline = (svg: string, pxPerMM: number) => {
  const w = +svg.match(/width="([\d.]+)mm"/)![1], h = +svg.match(/height="([\d.]+)mm"/)![1];
  return svg.replace(/^<\?xml[^>]*>\s*/, '').replace(/width="[\d.]+mm" height="[\d.]+mm"/, `width="${(w * pxPerMM).toFixed(0)}" height="${(h * pxPerMM).toFixed(0)}"`);
};
const chip = (hex: string) => `<i style="background:${hex}"></i>`;

// ---- sheet 1: palettes × sentences ----
const rows: string[] = [];
for (const pal of pals) {
  const P = PALETTES[pal];
  const cells: string[] = [];
  for (const [i, t] of texts.entries()) {
    const { svg, info } = gen(t, pal, piece, `cat_${pal}_${i}`);
    cells.push(`<td><div class="art">${inline(svg, 6)}</div><small>${info.sporeId} · ${info.parts} 件</small></td>`);
    console.log(`${pal} × "${t}" → ${info.sporeId} ${info.parts} parts`);
  }
  rows.push(`<tr><th><b>${P.zh}</b><code>--palette ${pal}</code><div class="chips">${chip(P.plate)}<span>+</span>${P.spools.map(chip).join('')}</div><p>${P.note}</p></th>${cells.join('')}</tr>`);
}

// ---- sheet 2: piece types, first sentence, three palettes ----
const pieceRows: string[] = [];
for (const pal of pals.filter((p) => ['cream', 'ocean', 'ink'].includes(p)).slice(0, 3)) {
  const cells: string[] = [];
  for (const pc of ['pendant', 'charm', 'earring']) {
    const { svg, info } = gen(texts[0], pal, pc, `pc_${pal}_${pc}`);
    const pair = pc === 'earring' ? inline(fs.readFileSync(path.join(outDir, 'parts', `pc_${pal}_${pc}_R.svg`), 'utf8'), 6) : '';
    cells.push(`<td><div class="art">${inline(svg, 6)}${pair}</div><small>${pc} · ${info.widthMM}×${info.heightMM} mm · ${info.parts} 件 · ${info.gramsPLA} g</small></td>`);
  }
  pieceRows.push(`<tr><th><b>${PALETTES[pal].zh}</b><code>--palette ${pal}</code></th>${cells.join('')}</tr>`);
}

const head = `<!doctype html><meta charset="utf-8"><title>Mycelium 首饰配色目录</title>
<style>
body{margin:0;padding:32px 40px;background:#f4f1ea;color:#333;font:14px/1.5 -apple-system,"PingFang SC","Noto Sans CJK SC",sans-serif}
h1{font-size:22px;margin:0 0 4px}h2{font-size:16px;margin:36px 0 12px;color:#555}
p.lead{margin:0 0 20px;color:#666}
table{border-collapse:collapse}td,th{vertical-align:top;padding:12px 14px;border-top:1px solid #e2ddd3;text-align:left}
th{width:190px;font-weight:normal}th b{font-size:15px}th code{display:block;color:#888;font-size:11px;margin:2px 0 6px}
th p{margin:6px 0 0;color:#777;font-size:12px}
.chips{display:flex;gap:4px;align-items:center}.chips i{display:inline-block;width:18px;height:18px;border-radius:4px;border:1px solid rgba(0,0,0,.12)}.chips span{color:#aaa;margin:0 2px}
.art{display:flex;gap:12px;align-items:flex-end;min-height:190px}
td small{display:block;color:#888;font-size:11px;margin-top:6px;font-family:ui-monospace,monospace}
thead td{color:#777;font-size:12px;border-top:none}
h1 span{color:#aaa;font-weight:normal;font-size:14px;margin-left:8px}
</style>`;
const lead = `<p class="lead">${piece} · 每格一句话一只孢子 · 底板色 + 身体耗材色,眼白 #f6f6f1 / 瞳孔 #121212 独立嵌件 · 零件数 = 底板 + 镶片 + 4 片眼睛</p>`;
const table = (rs: string[]) => `<table><thead><tr><td>配色</td>${texts.map((t) => `<td>“${t}”</td>`).join('')}</tr></thead><tbody>${rs.join('')}</tbody></table>`;
const html = `${head}<h1>Mycelium 首饰配色目录</h1>${lead}${table(rows)}
<h2>三种件 · “${texts[0]}”</h2>
<table><tbody>${pieceRows.join('')}</tbody></table>
`;
fs.writeFileSync(path.join(outDir, 'catalog.html'), html);
console.log(`wrote ${path.join(outDir, 'catalog.html')}`);

if (!process.argv.includes('--no-png')) {
  try {
    const { chromium } = await import('playwright-core');
    const exe = fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined;
    const browser = await chromium.launch(exe ? { executablePath: exe } : {});
    const page = await browser.newPage({ viewport: { width: 1500, height: 900 }, deviceScaleFactor: 2 });
    // one PNG per --per-page palettes (a single 16-row sheet is too tall to read), plus the piece sheet
    const per = Number(arg('per-page', '4'));
    const pages: string[] = [];
    for (let i = 0; i < rows.length; i += per)
      pages.push(`${head}<h1>Mycelium 首饰配色目录 <span>${i / per + 1} / ${Math.ceil(rows.length / per)}</span></h1>${lead}${table(rows.slice(i, i + per))}`);
    pages.push(`${head}<h1>三种件 · “${texts[0]}”</h1><table><tbody>${pieceRows.join('')}</tbody></table>`);
    for (const [i, pg] of pages.entries()) {
      await page.setContent(pg);
      const f = path.join(outDir, i < pages.length - 1 ? `catalog-${i + 1}.png` : 'catalog-pieces.png');
      await page.screenshot({ path: f, fullPage: true });
      console.log(`wrote ${f}`);
    }
    await browser.close();
  } catch (e) {
    console.log(`png skipped (${(e as Error).message.split('\n')[0]})`);
  }
}
