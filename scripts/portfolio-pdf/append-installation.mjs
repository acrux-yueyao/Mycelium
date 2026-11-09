#!/usr/bin/env node
/**
 * Portfolio PDF = the research poster (design/portfolio/source/mycelium-poster.pdf, 7 sheets, kept
 * byte-for-byte as sent) + new sheets about the physical installation appended after it, in the same
 * sheet format (1620 × 585.12 pt) and the poster's visual language. Photos and copy come from the
 * project section on yueyao.design (design/portfolio/photos/).
 *
 *   node scripts/portfolio-pdf/append-installation.mjs
 *     → design/portfolio/installation-sheets.pdf   (the new sheets alone)
 *     → design/portfolio/Mycelium_Portfolio.pdf     (poster + new sheets)
 *
 * Needs Playwright + Chromium and poppler's pdfunite.
 */
import path from 'node:path';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const out = path.join(root, 'design/portfolio');
const POSTER = path.join(out, 'source/mycelium-poster.pdf');
const POSTER_SHEETS = 7;
const SHEETS = 2;                       // appended below
const TOTAL = POSTER_SHEETS + SHEETS;
const fonts = fs.readFileSync(path.join(here, 'fonts.css'), 'utf8');
const photo = (f) => 'file://' + path.join(out, 'photos', f);

const css = `
${fonts}
:root{ --ground:#F1F0EB; --panel:#EBEAE3; --edge:#DAD9D0; --ink:#111110; --dim:#6b6a62; --soft:#9d9c92; --accent:#5b4fd0;
  --mono:'JetBrains Mono',ui-monospace,Menlo,monospace; --display:'Chakra Petch','JetBrains Mono',monospace; }
@page { size: 1620pt 585.12pt; margin: 0; }
* { box-sizing: border-box; }
html, body { margin: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { font-family: var(--mono); color: var(--ink); font-size: 10.6pt; line-height: 1.6; letter-spacing: .01em; }
.sheet { position: relative; width: 1620pt; height: 585.12pt; overflow: hidden; page-break-after: always; break-after: page;
  background:
    radial-gradient(60% 90% at 4% 10%, rgba(214,196,240,.55), transparent 60%),
    radial-gradient(45% 70% at 70% 0%, rgba(196,226,214,.45), transparent 60%),
    radial-gradient(40% 60% at 100% 100%, rgba(226,206,236,.40), transparent 60%),
    var(--ground); }
.sheet:last-child { page-break-after: auto; break-after: auto; }
.bar { position: absolute; left: 48pt; right: 48pt; top: 30pt; display: flex; align-items: baseline; gap: 14pt; font-size: 8.4pt; letter-spacing: .2em; text-transform: uppercase; color: var(--dim); }
.bar .brand { font-family: var(--display); font-weight: 700; font-size: 12.6pt; letter-spacing: .02em; text-transform: none; color: var(--ink); }
.bar .sub { font-size: 8.6pt; letter-spacing: .02em; text-transform: none; color: var(--accent); margin-right: 8pt; }
.bar .pg { margin-left: auto; display: flex; gap: 6pt; align-items: center; letter-spacing: .12em; }
.bar .pg i { display: inline-block; width: 5pt; height: 5pt; }
.foot { position: absolute; left: 48pt; right: 48pt; bottom: 20pt; border-top: 1px solid var(--edge); padding-top: 7pt; display: flex; justify-content: space-between; font-size: 8pt; color: var(--dim); letter-spacing: .04em; }
.foot b { color: var(--ink); font-weight: 700; }
.foot .url { color: var(--accent); }
.grid { position: absolute; left: 48pt; right: 48pt; top: 72pt; bottom: 54pt; display: grid; gap: 28pt; }
.panel { position: relative; min-width: 0; }
.panel + .panel::before { content: ""; position: absolute; left: -14pt; top: 0; bottom: 0; border-left: 1px solid var(--edge); }
.eyebrow { font-size: 7.8pt; letter-spacing: .26em; text-transform: uppercase; color: var(--accent); margin-bottom: 4pt; }
h2 { font-family: var(--display); font-weight: 700; font-size: 30pt; line-height: 1.02; margin: 0 0 9pt; letter-spacing: -.01em; }
.ghost { position: absolute; right: 0; top: -8pt; font-family: var(--display); font-weight: 700; font-size: 112pt; line-height: 1; color: rgba(17,17,16,.07); letter-spacing: -.03em; pointer-events: none; }
p { margin: 0 0 7pt; color: #333; }
p b { color: var(--ink); }
.dim { color: var(--dim); font-size: 9pt; }
.cap { font-size: 8pt; color: var(--dim); line-height: 1.45; margin-top: 4pt; }
.ph { background: var(--panel); border: 1px solid var(--edge); overflow: hidden; }
.ph img { display: block; width: 100%; height: 100%; object-fit: cover; }
table.spec { width: 100%; border-collapse: collapse; font-size: 9pt; margin: 6pt 0 2pt; }
table.spec td { padding: 4pt 6pt 4pt 0; border-bottom: 1px solid var(--edge); vertical-align: top; }
table.spec td:first-child { color: var(--accent); white-space: nowrap; width: 112pt; letter-spacing: .04em; }
.box { border: 1px dashed #b9b6ab; padding: 8pt 10pt; font-size: 9.2pt; color: #333; margin: 8pt 0; }
.kv { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1px; background: var(--edge); border: 1px solid var(--edge); margin: 8pt 0; }
.kv div { background: #f6f5f0; padding: 8pt 10pt; }
.kv .n { font-family: var(--display); font-weight: 700; font-size: 20pt; color: var(--accent); line-height: 1.1; }
.quote { border-left: 2px solid var(--accent); padding: 2pt 0 2pt 9pt; margin: 6pt 0; }
.qt { font-size: 8.7pt; line-height: 1.45; color: #222; font-family: var(--mono), 'PingFang SC', 'Noto Sans CJK SC', sans-serif; }
.qm { font-size: 7.4pt; color: var(--soft); letter-spacing: .06em; margin: 2pt 0 3pt; }
.sc { display: grid; grid-template-columns: 1fr 1fr; column-gap: 10pt; row-gap: 2pt; font-size: 6.8pt; color: var(--dim); }
.sc .row { display: flex; align-items: center; gap: 5pt; white-space: nowrap; }
.dots { display: inline-flex; gap: 2.2pt; }
.dots i { width: 5.2pt; height: 5.2pt; border-radius: 50%; border: 1px solid #b9b6ab; display: inline-block; }
.dots i.on { background: var(--accent); border-color: var(--accent); }
.kv .l { font-size: 8pt; color: var(--dim); line-height: 1.35; margin-top: 2pt; }
`;

const SCALES = [['bearable', 'harder to bear', 'easier to bear'], ['comprehensible', 'more confused', 'clearer'],
  ['expressible', 'harder to put into words', 'easier to put into words'], ['acceptance', 'push it away', 'let it stay open']];
// the three accounts left on the day (design/portfolio/source — nicknames withheld)
const QUOTES = [
  { text: 'I liked the way you can create a character based on how you feel and it can interact with other mycelium. I would like to see other ways to interact with mycelium. It’s a very creative idea and I love the software — super easy to use and very beautiful.', meta: '13:11 · 18–29 · not in a transition', s: [7, 7, 7, 7] },
  { text: 'The colors and animations drew me in. I thought that this was such a cool concept and the idea of people influencing each other being depicted as “exchanging colors” is very sweet and touching.', meta: '15:29 · 18–29 · in a life transition', s: [3, 3, 4, 3] },
  { text: '人们之间的互动，but why things get so digitalized nowadays', meta: '17:04 · 18–29 · in a life transition', s: [5, 4, 3, 6] },
];

const bar = (sections, n) => `<div class="bar"><span class="brand">MYCELIUM</span><span class="sub">The Whisper Network</span>${sections}
  <span class="pg"><i style="background:#c9a7e6"></i><i style="background:#49bd97"></i><i style="background:#b6d35a"></i><i style="background:#5b4fd0"></i>&nbsp;${n} / ${TOTAL}</span></div>`;
const foot = `<div class="foot"><span><b>MYCELIUM · The Whisper Network</b>&nbsp;&nbsp;Hyphal Column — steel · six screens · ESP32 · Pi · React · canvas 2D · Claude</span>
  <span><span class="url">mycelium.yueyao.design</span>&nbsp;&nbsp;·&nbsp;&nbsp;yueyao.design</span></div>`;

const sheet8 = `<section class="sheet">${bar('INSTALLATION · HYPHAL COLUMN · DETAILS', POSTER_SHEETS + 1)}
<div class="grid" style="grid-template-columns: 340pt 1fr 400pt">
  <div class="panel">
    <div class="ph" style="height:100%"><img src="${photo('p8-gallery.webp')}" alt="The tower in the gallery with wall text and three floor cushions"></div>
  </div>
  <div class="panel">
    <div class="ghost">24</div>
    <div class="eyebrow">24 · Installation</div>
    <h2>Hyphal Column</h2>
    <p>The Whisper Network now has a <b>body</b>: a five-foot steel column with six screens and a tree hole inside. Whisper one sentence and a pixel spore grows. <b>Your sentence never shows on any screen — only the spore it grew.</b></p>
    <p class="dim">Cushions down, tower running, plush guardian on top. The wall text introduces Mycelium, the system it grows from. Visitors sit, whisper to the tower, and watch their spore drift into the colony beside everyone who sat there before them.</p>
    <table class="spec">
      <tr><td>top</td><td>the plush guardian — the companion robot's seat</td></tr>
      <tr><td>sky screen</td><td>the whole colony at night — every spore ever whispered, drifting</td></tr>
      <tr><td>micro screen</td><td>one spore's record: name, family, intensity — the one being watched</td></tr>
      <tr><td>pocket screens</td><td>twin ESP32 eyes — the spore picked from the field, live</td></tr>
      <tr><td>field screen</td><td>the tree hole: type a sentence, a spore grows; QR to grow one on your phone</td></tr>
      <tr><td>roster strip</td><td>the newest arrivals, in a row, by name</td></tr>
    </table>
    <div class="box">One Pi runs the screens; the tower's screens and the desk companion share a LAN bus, so a spore picked on the field goes live on the small screens the moment it is touched. <b>No accounts. No feed. No metrics.</b></div>
  </div>
  <div class="panel">
    <div class="ghost">25</div>
    <div class="eyebrow">25 · Details</div>
    <h2>Up close</h2>
    <div class="ph" style="height:368pt"><img src="${photo('p9-details.webp')}" alt="Four detail shots: the field screen, twin pocket screens, and the roster strip"></div>
    <div class="cap">Details — the twin pocket screens, the spore field, the roster strip. The field runs inverted for the room: colour glows out of darkness; the web and phone experience stays paper-cream.</div>
  </div>
</div>${foot}</section>`;

const sheet9 = `<section class="sheet">${bar('CHARMS · COMPANION · BU ART MARKET', POSTER_SHEETS + 2)}
<div class="grid" style="grid-template-columns: 1fr 1fr 1.22fr">
  <div class="panel">
    <div class="ghost">26</div>
    <div class="eyebrow">26 · Off-screen</div>
    <h2>Spore charms</h2>
    <p>Spores printed into charms, <b>tile by tile</b>. Every charm comes with its own build chart, and the assembly tray has numbered pockets and magnets — so a visitor's spore can go home as an object.</p>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10pt;margin-top:6pt">
      <div><div class="ph" style="height:200pt"><img src="${photo('p3-charms.jpg')}" alt="3D-printed pixel charms"></div><div class="cap">Printed charms, one pixel per tile.</div></div>
      <div><div class="ph" style="height:200pt"><img src="${photo('p6-chart.png')}" alt="A charm build chart" style="object-position:left top"></div><div class="cap">Each charm's own build chart — letter = colour, number = height.</div></div>
    </div>
    <div class="ph" style="height:72pt;margin-top:8pt"><img src="${photo('p5-tray.jpg')}" alt="Numbered assembly tray with tiles" style="object-position:center 72%"></div>
    <div class="cap">The assembly tray — numbered pockets and magnets.</div>
  </div>
  <div class="panel">
    <div class="ghost">27</div>
    <div class="eyebrow">27 · In progress</div>
    <h2>Desk companion</h2>
    <p>A desk companion robot on the <b>same network as the tower</b>: a spore body built from magnetic voxels, two pixel eyes, a tree hole of its own. Board v1 just arrived — <b>ESP32, mic, time-of-flight eyes, touch pads</b>.</p>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10pt;margin-top:6pt">
      <div><div class="ph" style="height:262pt"><img src="${photo('p4-figure.jpg')}" alt="The companion robot's shell, built from magnetic voxels"></div><div class="cap">The shell — a spore body built from magnetic voxels.</div></div>
      <div><div class="ph" style="height:262pt"><img src="${photo('p7-board.jpg')}" alt="Custom PCB for the desk companion robot" style="object-position:center 70%"></div><div class="cap">MC03-F v1: XIAO ESP32-S3, MPR121 touch, INMP441 mic, VL53L0X eyes, OLED sockets.</div></div>
    </div>
  </div>
  <div class="panel">
    <div class="ghost">28</div>
    <div class="eyebrow">28 · Shown</div>
    <h2>BU Art Market</h2>
    <p class="dim">Fri, Oct 30, 2026 · 808 Commonwealth Ave, Boston</p>
    <p>People sat on the cushions and whispered their sentences to the tower. Spores grew, and some went home as charms. Three visitors left an anonymous account of what the work left with them — their words, and how they felt right after writing (1–7):</p>
    ${QUOTES.map((q) => `<div class="quote"><div class="qt">“${q.text}”</div><div class="qm">${q.meta}</div><div class="sc">${SCALES.map(([k, l, r], i) => `<span class="row"><span class="dots">${[1, 2, 3, 4, 5, 6, 7].map((n) => `<i class="${n === q.s[i] ? 'on' : ''}"></i>`).join('')}</span><span class="sr">${l} → ${r}</span></span>`).join('')}</div></div>`).join('')}
    <p class="dim" style="margin-top:5pt;font-size:8.2pt">Formative feedback, pre-IRB. The scales read the visitor's own state, not the work — the warmest words came with the lowest numbers, which is what they are for. &nbsp;<span style="color:var(--accent)">Grow one now →</span> mycelium.yueyao.design</p>
  </div>
</div>${foot}</section>`;

const html = `<!doctype html><html><head><meta charset="utf-8"><title>Mycelium — installation sheets</title><style>${css}</style></head><body>${sheet8}${sheet9}</body></html>`;
fs.mkdirSync(out, { recursive: true });
const htmlPath = path.join(out, 'installation-sheets.html');
fs.writeFileSync(htmlPath, html);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 2160, height: 780 } });
await page.goto('file://' + htmlPath, { waitUntil: 'load' });
await page.evaluate(() => Promise.all([...document.images].map((i) => i.complete ? 0 : new Promise((r) => { i.onload = i.onerror = r; }))));
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(300);
const sheetsPdf = path.join(out, 'installation-sheets.pdf');
await page.pdf({ path: sheetsPdf, width: '22.5in', height: '8.1267in', printBackground: true, preferCSSPageSize: true });
await browser.close();

const merged = path.join(out, 'Mycelium_Portfolio.pdf');
execFileSync('pdfunite', [POSTER, sheetsPdf, merged]);
if (!process.env.KEEP_HTML) fs.unlinkSync(htmlPath);
console.log('→', path.relative(root, sheetsPdf), `(${SHEETS} sheets)`);
console.log('→', path.relative(root, merged), `(poster ${POSTER_SHEETS} + ${SHEETS})`);
