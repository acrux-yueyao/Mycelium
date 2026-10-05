/**
 * jewel_catalog — a design catalogue of wearable spores, faithful to the site:
 * every card is a different sentence → a different creature (its own shape,
 * its own engine palette), rendered as the glue-up charm. Sheets:
 *
 *   catalog-own.png      本色: each spore's own colours, quantised to --colors filaments
 *   catalog-family.png   家族色卷: the same spores on the fixed per-family spool sets
 *   catalog-pieces.png   三种件: pendant / charm / mirrored earrings for a few sentences
 *   catalog-styles-*.png (only with --styles) the off-site style palettes from jewel_palettes.ts
 *
 *   npx tsx scripts/jewel_catalog.mts [--texts "句子一|句子二|…"] [--colors 2] [--out out/jewel/catalog]
 *       [--styles] [--no-png]
 *
 * The site picks a spore's family from the emotion reading, not from the
 * sentence hash, so the catalogue cycles the six families over the sentences
 * (--family) to show every family; the shape and palette are the engine's.
 * Each card is produced by scripts/spore_jewel.mts with a fixed --cell per
 * piece type, so eye tiles stay interchangeable across the whole sheet.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { PALETTES, PALETTE_NAMES } from './jewel_palettes';

const arg = (k: string, d?: string) => { const i = process.argv.indexOf(`--${k}`); return i >= 0 ? process.argv[i + 1] : d; };
const flag = (k: string) => process.argv.includes(`--${k}`);
const DEFAULT_TEXTS = [
  '轻轻地生长', '今晚的月亮很安静', 'I miss the sea', '把今天的我留在这里',
  '想被人记得', '雨停了就出门', 'small, warm, and a little late', '一个人也可以',
  '谢谢你还在', '今天什么都没发生', 'the room hums when you leave', '慢慢来',
];
const texts = arg('texts') ? arg('texts')!.split('|') : DEFAULT_TEXTS;
const FAMS = ['tender', 'calm', 'curious', 'dreamy', 'companion', 'lonely'];
const FAM_ZH: Record<string, string> = { tender: '温柔', calm: '平静', curious: '好奇', dreamy: '梦幻', companion: '陪伴', lonely: '孤独' };
const colors = arg('colors', '2')!;
const outDir = arg('out', 'out/jewel/catalog')!;
const CELL: Record<string, number> = { pendant: 2.3, charm: 1.7, earring: 1.4 };
fs.mkdirSync(path.join(outDir, 'parts'), { recursive: true });

interface Card { svg: string; info: Record<string, unknown>; pair?: string }
function gen(text: string, pc: string, name: string, extra: string[]): Card {
  const r = spawnSync('npx', ['tsx', 'scripts/spore_jewel.mts', '--text', text, '--piece', pc, '--cell', String(CELL[pc]),
    '--colors', colors, '--name', name, '--out', path.join(outDir, 'parts'), ...extra], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(r.stderr || r.stdout);
  const info = JSON.parse(fs.readFileSync(path.join(outDir, 'parts', `${name}.json`), 'utf8'))[0];
  const read = (suffix: string) => fs.readFileSync(path.join(outDir, 'parts', `${name}${suffix}.svg`), 'utf8');
  return pc === 'earring' ? { svg: read('_L'), pair: read('_R'), info } : { svg: read(''), info };
}
const inline = (svg: string, pxPerMM: number) => {
  const w = +svg.match(/width="([\d.]+)mm"/)![1], h = +svg.match(/height="([\d.]+)mm"/)![1];
  return svg.replace(/^<\?xml[^>]*>\s*/, '').replace(/width="[\d.]+mm" height="[\d.]+mm"/, `width="${(w * pxPerMM).toFixed(0)}" height="${(h * pxPerMM).toFixed(0)}"`);
};
const chip = (hexc: string) => `<i style="background:${hexc}"></i>`;
type Spools = Record<string, { name: string; zh: string }>;
const chips = (fil: Record<string, string>, sp: Spools = {}) => {
  const g = Object.entries(fil).filter(([k]) => !['white', 'black'].includes(k)).sort(([a], [b]) => (a === 'base' ? -1 : b === 'base' ? 1 : a.localeCompare(b)));
  const names = g.map(([k]) => sp[k]?.zh || sp[k]?.name).filter(Boolean);
  return `<div class="chips">${g.map(([, v], i) => (i === 1 ? '<span>+</span>' : '') + chip(v)).join('')}${names.length ? `<em>${names.join(' · ')}</em>` : ''}</div>`;
};
const card = (c: Card, title: string, sub: string) =>
  `<figure><div class="art">${inline(c.svg, 6)}${c.pair ? inline(c.pair, 6) : ''}</div><figcaption><b>${title}</b><small>${sub}</small>${chips(c.info.filaments as Record<string, string>, c.info.spools as Spools)}</figcaption></figure>`;

const head = `<!doctype html><meta charset="utf-8"><title>Mycelium 首饰目录</title>
<style>
body{margin:0;padding:32px 40px;background:#f4f1ea;color:#333;font:14px/1.5 -apple-system,"PingFang SC","Noto Sans CJK SC",sans-serif}
h1{font-size:22px;margin:0 0 4px}h1 span{color:#aaa;font-weight:normal;font-size:14px;margin-left:8px}
p.lead{margin:0 0 22px;color:#666;max-width:1100px}
.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:18px 22px;max-width:1400px}
figure{margin:0;background:#fbf9f5;border:1px solid #e6e1d8;border-radius:10px;padding:16px 14px 12px}
.art{display:flex;gap:12px;align-items:flex-end;justify-content:center;min-height:190px}
figcaption{margin-top:10px}figcaption b{display:block;font-size:14px}figcaption small{display:block;color:#888;font-size:11px;font-family:ui-monospace,monospace;margin:2px 0 6px}
.chips{display:flex;gap:4px;align-items:center}.chips i{display:inline-block;width:16px;height:16px;border-radius:4px;border:1px solid rgba(0,0,0,.12)}.chips span{color:#aaa;margin:0 2px}.chips em{font-style:normal;color:#777;font-size:11px;margin-left:8px}
.famrow{display:flex;gap:22px;flex-wrap:wrap;margin:0 0 18px}.famrow div{font-size:12px;color:#666}.famrow b{display:block;color:#333;font-size:13px}
table{border-collapse:collapse}td,th{vertical-align:top;padding:12px 14px;border-top:1px solid #e2ddd3;text-align:left}th{width:190px;font-weight:normal}
th b{font-size:15px}th code{display:block;color:#888;font-size:11px;margin:2px 0 6px}th p{margin:6px 0 0;color:#777;font-size:12px}
td small{display:block;color:#888;font-size:11px;margin-top:6px;font-family:ui-monospace,monospace}thead td{color:#777;font-size:12px;border-top:none}
</style>`;
const pages: Array<[string, string]> = [];   // [file, html]

// ---- sheet 1: own colours ----
const own: Card[] = [];
for (const [i, t] of texts.entries()) {
  const fam = FAMS[i % 6];
  const c = gen(t, 'charm', `own_${i}`, ['--family', fam]);
  own.push(c);
  console.log(`own  ${c.info.sporeId} ${fam} "${t}" → ${c.info.parts} parts`);
}
pages.push(['catalog-own.png', `${head}<h1>Mycelium 首饰目录 <span>本色 → 手上的卷 · ${colors} 卷身体色 + 底板</span></h1>
<p class="lead">每张卡一句话一只孢子:形状是网站引擎长出来的那只,颜色是它自己的调色板压成 ${colors} 档,每档就近落到 design/filaments.json 里你手上的卷(Lab 色差,保持明暗顺序),底板选一卷更深的。卡片下方是选中的耗材名。挂件尺寸,格 ${CELL.charm} mm;眼白 / 瞳孔用白色 / 黑色卷。</p>
<div class="grid">${own.map((c, i) => card(c, `“${texts[i]}”`, `${c.info.sporeId} · ${FAM_ZH[c.info.family as string]} ${c.info.family} · ${c.info.widthMM}×${c.info.heightMM} mm · ${c.info.parts} 件`)).join('')}</div>`]);

// ---- sheet 2: family spool sets ----
const fam: Card[] = [];
for (const [i, t] of texts.entries()) {
  const c = gen(t, 'charm', `fam_${i}`, ['--family', FAMS[i % 6], '--spool-map', 'family']);
  fam.push(c);
  console.log(`fam  ${c.info.sporeId} "${t}" → ${c.info.parts} parts`);
}
const famSets = FAMS.map((f) => {
  const c = fam.find((x) => x.info.family === f)!;
  return `<div><b>${FAM_ZH[f]} ${f}</b>${chips(c.info.filaments as Record<string, string>, c.info.spools as Spools)}</div>`;
});
pages.push(['catalog-family.png', `${head}<h1>Mycelium 首饰目录 <span>家族色卷 · 六组固定耗材,可批量</span></h1>
<p class="lead">同样的孢子,身体色换成按家族固定的色卷(按引擎 FAMILY 表的色相在手上的卷里选定,见 design/filaments.json 的 families;每家族 1 卷底板 + ${colors} 卷身体色)。
一个家族的所有作品共用一组卷,镶片可以跨作品批量打印;代价是丢掉每只孢子自己的色相微差。</p>
<div class="famrow">${famSets.join('')}</div>
<div class="grid">${fam.map((c, i) => card(c, `“${texts[i]}”`, `${c.info.sporeId} · ${FAM_ZH[c.info.family as string]} · ${c.info.parts} 件`)).join('')}</div>`]);

// ---- sheet 3: piece types ----
const pieceCards: string[] = [];
for (const i of [0, 1, 2, 3]) {
  const cs = ['pendant', 'charm', 'earring'].map((pc) => gen(texts[i], pc, `pc_${i}_${pc}`, ['--family', FAMS[i % 6]]));
  pieceCards.push(`<tr><th><b>“${texts[i]}”</b><code>${cs[0].info.sporeId} · ${FAM_ZH[cs[0].info.family as string]}</code>${chips(cs[0].info.filaments as Record<string, string>, cs[0].info.spools as Spools)}</th>${cs.map((c) =>
    `<td><div class="art">${inline(c.svg, 6)}${c.pair ? inline(c.pair, 6) : ''}</div><small>${c.info.piece} · ${c.info.widthMM}×${c.info.heightMM} mm · ${c.info.parts} 件 · ${c.info.gramsPLA} g</small></td>`).join('')}</tr>`);
}
pages.push(['catalog-pieces.png', `${head}<h1>Mycelium 首饰目录 <span>三种件</span></h1>
<p class="lead">吊坠 32 mm(格 ${CELL.pendant})· 挂件 24 mm(格 ${CELL.charm})· 耳饰 20 mm(格 ${CELL.earring},镜像一对)。同一只孢子三种大小。</p>
<table><tbody>${pieceCards.join('')}</tbody></table>`]);

// ---- optional: style palettes (deliberately off-site colours) ----
if (flag('styles')) {
  const per = 4, rows: string[] = [];
  const styleTexts = texts.slice(0, 4);
  for (const pal of PALETTE_NAMES) {
    const P = PALETTES[pal];
    const cells = styleTexts.map((t, i) => { const c = gen(t, 'charm', `sty_${pal}_${i}`, ['--family', FAMS[i % 6], '--palette', pal]);
      return `<td><div class="art">${inline(c.svg, 6)}</div><small>${c.info.sporeId} · ${c.info.parts} 件</small></td>`; }).join('');
    rows.push(`<tr><th><b>${P.zh}</b><code>--palette ${pal}</code><div class="chips">${chip(P.plate)}<span>+</span>${P.spools.map(chip).join('')}</div><p>${P.note}</p></th>${cells}</tr>`);
    console.log(`style ${pal}`);
  }
  for (let i = 0; i < rows.length; i += per)
    pages.push([`catalog-styles-${i / per + 1}.png`, `${head}<h1>Mycelium 首饰目录 <span>风格款 ${i / per + 1}/${Math.ceil(rows.length / per)} · 偏离网站配色,仅作选项</span></h1>
<table><thead><tr><td>配色</td>${styleTexts.map((t) => `<td>“${t}”</td>`).join('')}</tr></thead><tbody>${rows.slice(i, i + per).join('')}</tbody></table>`]);
}

fs.writeFileSync(path.join(outDir, 'catalog.html'), pages.map(([, h]) => h).join('\n<hr style="margin:40px 0;border:0;border-top:1px solid #ddd">\n'));
console.log(`wrote ${path.join(outDir, 'catalog.html')}`);
if (!flag('no-png')) {
  try {
    const { chromium } = await import('playwright-core');
    const exe = fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined;
    const browser = await chromium.launch(exe ? { executablePath: exe } : {});
    const page = await browser.newPage({ viewport: { width: 1500, height: 900 }, deviceScaleFactor: 2 });
    for (const [file, html] of pages) {
      await page.setContent(html);
      await page.screenshot({ path: path.join(outDir, file), fullPage: true });
      console.log(`wrote ${path.join(outDir, file)}`);
    }
    await browser.close();
  } catch (e) { console.log(`png skipped (${(e as Error).message.split('\n')[0]})`); }
}
