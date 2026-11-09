#!/usr/bin/env node
/**
 * Portfolio → print-ready PDF in the poster sheet format (1620 × 585 pt), English and Chinese, from public/portfolio.html and
 * public/portfolio-zh.html — the same page the site serves, laid out for paper:
 *
 *   · headings never strand at a page bottom, cards / figures / tables never split across pages,
 *     and the page flows without half-empty pages
 *   · the live "Try it" demo is grown once with a sample sentence, so the page shows a real result
 *   · links point at the live site (mycelium.yueyao.design) so they stay clickable in the PDF
 *   · page numbers in the footer, no language toggle, animations settled
 *
 *   node scripts/portfolio-pdf/build.mjs            → design/portfolio/Mycelium_Portfolio_{EN,ZH}.pdf
 *
 * Needs Playwright with Chromium (`npm i -D playwright && npx playwright install chromium`
 * if it is not already on the machine).
 */
import path from 'node:path';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const out = path.join(root, 'design/portfolio');
const SITE = 'https://mycelium.yueyao.design';

const PRINT_CSS = `
@page { size: 1620pt 585.12pt; margin: 46pt 0 34pt; }
html, body { background: #F1F0EB !important; }
/* the poster sheet format: content flows down three columns, then on to the next sheet */
.wrap { padding: 0 48pt !important; max-width: none !important; columns: 3; column-gap: 44pt; column-fill: auto; }
.wrap > * { max-width: none !important; }
.wrap img, .wrap svg { max-width: 100%; height: auto; }
html, body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
#langtoggle { display: none !important; }
.fadein { animation: none !important; opacity: 1 !important; transform: none !important; }
.sec { padding-top: 0 !important; margin-top: 0 !important; break-before: column; }   /* one section per panel, like the poster */

.sec + .sec { border-top: 0; }
.sec-head, .sec-title, h2, h3, .eyebrow { break-after: avoid; page-break-after: avoid; }
.feat, .feats > *, .step, .rq, .cell, .loop, .glance, .pf, .hl, .fnote, .devcap, .demo, .demo-out,
.fammap, .iramp, .forestmap, .mycofig, .herocast, .browser, .phone, .phoneshow, .phonestrip,
figure, table, tr, img, svg, li, .rule {
  break-inside: avoid; page-break-inside: avoid;
}
p { orphans: 3; widows: 3; }
#whisper { caret-color: transparent; }
`;

async function build(file, sample, pdfName, lang) {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1180, height: 900 } });
  await page.goto('file://' + path.join(root, 'public', file), { waitUntil: 'load', timeout: 30000 });
  // grow one spore in the live demo so the printed page shows a real reading
  if (await page.$('#whisper')) {
    await page.fill('#whisper', sample);
    await page.click('#growBtn');
    await page.waitForTimeout(600);
  }
  // site-relative links → the live site, so they work from the PDF
  await page.evaluate((site) => {
    for (const a of document.querySelectorAll('a[href]')) {
      const h = a.getAttribute('href');
      if (h.startsWith('/')) a.setAttribute('href', site + h);
      else if (/^[\w-]+\.(pdf|html)$/.test(h)) a.setAttribute('href', site + '/' + h);
    }
  }, SITE);
  await page.addStyleTag({ content: PRINT_CSS });
  await page.emulateMedia({ media: 'print', reducedMotion: 'reduce' });
  // lazy images never load off-screen in a headless print: load them all now (with a time cap)
  await page.evaluate(() => {
    for (const i of document.images) { i.loading = 'eager'; if (!i.complete) { const s = i.src; i.src = ''; i.src = s; } }
    const all = Promise.all([...document.images].map((i) => i.complete ? 0 : new Promise((r) => { i.onload = i.onerror = r; })));
    return Promise.race([all, new Promise((r) => setTimeout(r, 8000))]);
  });
  await page.waitForTimeout(400);
  const foot = lang === 'zh' ? '作品集 · Yue Yao' : 'Portfolio · Yue Yao';
  await page.pdf({
    path: path.join(out, pdfName), printBackground: true, preferCSSPageSize: true,
    displayHeaderFooter: true,
    // header/footer bands painted in the page colour so the cream runs edge to edge
    // header/footer bands in the page colour (cream edge to edge), set like the poster's top bar
    headerTemplate: `<div style="position:absolute;top:0;left:0;right:0;height:46pt;background:#F1F0EB;-webkit-print-color-adjust:exact"></div>
      <div style="position:relative;width:100%;padding:16pt 48pt 0;display:flex;justify-content:space-between;align-items:baseline;font:9px 'JetBrains Mono',ui-monospace,monospace;letter-spacing:.12em;color:#8a857a">
      <span><b style="font:700 12px 'Chakra Petch',sans-serif;color:#17161a;letter-spacing:.04em">MYCELIUM</b>&nbsp;&nbsp;<span style="color:#5b4fd0">The Whisper Network</span>&nbsp;&nbsp;·&nbsp;&nbsp;${foot}</span>
      <span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>`,
    footerTemplate: `<div style="position:absolute;bottom:0;left:0;right:0;height:34pt;background:#F1F0EB;-webkit-print-color-adjust:exact"></div><span></span>`,
  });
  await browser.close();
  console.log('→', path.relative(root, path.join(out, pdfName)));
}

fs.mkdirSync(out, { recursive: true });
await build('portfolio.html', 'today, my heart feels like a quiet lake after rain', 'Mycelium_Portfolio_EN.pdf', 'en');
await build('portfolio-zh.html', '今天心里像雨后安静的湖', 'Mycelium_Portfolio_ZH.pdf', 'zh');
