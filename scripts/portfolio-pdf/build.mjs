#!/usr/bin/env node
/**
 * Portfolio → print-ready PDF (A4), English and Chinese, from public/portfolio.html and
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
@page { size: A4; margin: 12mm 0 14mm; }
html, body { background: #F1F0EB !important; }
.wrap { padding: 0 14mm !important; }
html, body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
#langtoggle { display: none !important; }
.fadein { animation: none !important; opacity: 1 !important; transform: none !important; }
.sec { padding-top: 6mm !important; }
.sec + .sec { border-top: 0; }
.sec-head, .sec-title, h2, h3, .eyebrow { break-after: avoid; page-break-after: avoid; }
.feat, .feats > *, .step, .rq, .cell, .loop, .glance, .pf, .hl, .fnote, .devcap, .demo, .demo-out,
.fammap, .iramp, .forestmap, .mycofig, .herocast, figure, table, tr, img, svg, li, .rule {
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
  const foot = lang === 'zh' ? 'Mycelium · 作品集 · Yue Yao' : 'Mycelium · Portfolio · Yue Yao';
  await page.pdf({
    path: path.join(out, pdfName), format: 'A4', printBackground: true, preferCSSPageSize: true, scale: 0.9,
    displayHeaderFooter: true,
    // header/footer bands painted in the page colour so the cream runs edge to edge
    headerTemplate: `<div style="position:absolute;top:0;left:0;right:0;height:12mm;background:#F1F0EB;-webkit-print-color-adjust:exact"></div>`,
    footerTemplate: `<div style="position:absolute;bottom:0;left:0;right:0;height:14mm;background:#F1F0EB;-webkit-print-color-adjust:exact"></div>
      <div style="position:relative;width:100%;font:7.5px 'JetBrains Mono',ui-monospace,monospace;color:#8a857a;padding:0 14mm 2mm;display:flex;justify-content:space-between;letter-spacing:.08em">
      <span>${foot}</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>`,
  });
  await browser.close();
  console.log('→', path.relative(root, path.join(out, pdfName)));
}

fs.mkdirSync(out, { recursive: true });
await build('portfolio.html', 'today, my heart feels like a quiet lake after rain', 'Mycelium_Portfolio_EN.pdf', 'en');
await build('portfolio-zh.html', '今天心里像雨后安静的湖', 'Mycelium_Portfolio_ZH.pdf', 'zh');
