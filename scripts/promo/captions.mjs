#!/usr/bin/env node
/**
 * Caption overlays for the promo — 1920 × 1080 PNGs with transparent background, set in the
 * site's own type (Chakra Petch / JetBrains Mono, embedded) with small Chinese under the English.
 *
 *   node scripts/promo/captions.mjs <out dir>      → <out>/cap-<key>.png for every entry in CAPTIONS
 */
import path from 'node:path';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const out = path.resolve(process.argv[2] || 'promo-clips');
const fonts = fs.readFileSync(path.join(root, 'scripts/portfolio-pdf/fonts.css'), 'utf8');

let qr = '';
try { qr = fs.readFileSync(path.join(out, 'qr.svg'), 'utf8'); } catch { /* no QR available */ }

export const CAPTIONS = {
  title: { kind: 'title' },
  whisper: { eye: '01 · tree hole', en: 'Whisper a sentence.', zh: '对它说一句话。' },
  reads: { eye: '02 · reading', en: 'An AI reads the feeling inside it and grows a creature.<br><span class="soft">The words themselves are never shown.</span>', zh: 'AI 读出句子里的感受，长出一只生命体。你说的话不会出现在任何地方。' },
  colony: { eye: '03 · colony', en: 'It drifts into a shared colony — with everyone who whispered before you.', zh: '它漂进一片共享的菌落，和之前每一个说过话的人在一起。' },
  dye: { eye: '04 · contact-point dyeing', en: 'Compatible spores meet and take on each other’s colour, from where they touch.', zh: '相容的孢子相遇，从接触的地方开始彼此染色。' },
  mother: { eye: '05 · mother tree', en: 'An elder notices one left alone too long — and reaches over.', zh: '老孢子会注意到独处太久的那只，伸手过去。' },
  elders: { eye: '06 · a long encounter', en: 'Stay together long enough and each keeps a trace of the other. Permanently.', zh: '待得够久，彼此身上都会留下对方的一点颜色，再也不褪。' },
  column: { narrow: true, eye: '07 · off-screen', en: 'Hyphal Column — a five-foot steel column, six screens, a tree hole inside.', zh: '菌柱——五英尺钢柱，六块屏，树洞装在里面。' },
  market: { narrow: true, eye: 'BU Art Market · Oct 30, 2026', en: 'People sat down and whispered to the tower.', zh: '大家坐在蒲团上，对塔说了自己的句子。' },
  charms: { narrow: true, eye: '08 · take one home', en: 'Spores go home as charms, tile by tile.', zh: '孢子变成吊坠，一格一格带回家。' },
  moony: { narrow: true, eye: '09 · in progress', en: 'A desk companion is on its way.', zh: '桌面陪伴小机器人正在路上。' },
  end: { kind: 'end' },
};

const css = `${fonts}
html,body{margin:0;width:1920px;height:1080px;background:transparent;overflow:hidden}
body{font-family:'JetBrains Mono',ui-monospace,monospace;color:#111110}
.zh{font-family:'PingFang SC','Noto Sans CJK SC','WenQuanYi Zen Hei',sans-serif}
.cap{position:absolute;left:96px;bottom:84px;max-width:1180px;padding:26px 34px 24px;background:rgba(241,240,235,.86);
  border-left:4px solid #5b4fd0;backdrop-filter:blur(8px);box-shadow:0 10px 40px rgba(17,17,16,.08)}
.eye{font-size:17px;letter-spacing:.26em;text-transform:uppercase;color:#5b4fd0;margin-bottom:10px}
.en{font-family:'Chakra Petch','JetBrains Mono',monospace;font-weight:700;font-size:44px;line-height:1.15;letter-spacing:-.005em}
.en .soft{font-weight:700;color:#6b6a62}
.cap.narrow{max-width:790px}
.cap .zh{font-size:20px;color:#6b6a62;margin-top:12px;line-height:1.5}
.title{position:absolute;inset:0;display:flex;flex-direction:column;justify-content:center;padding-left:140px}
.title .eye{font-size:19px}
.title h1{font-family:'Chakra Petch',monospace;font-weight:700;font-size:210px;line-height:.9;margin:14px 0 30px;letter-spacing:-.02em}
.title .sub{font-family:'Chakra Petch',monospace;font-weight:700;font-size:40px;color:#5b4fd0}
.title .tag{font-size:22px;color:#4a463e;margin-top:10px}
.title .tag .zh{margin-left:14px;color:#6b6a62}
.end{position:absolute;inset:0;display:grid;grid-template-columns:1fr 360px;align-items:center;padding:0 160px;gap:70px}
.end .panel{background:rgba(241,240,235,.93);padding:52px 60px 48px;border-left:4px solid #5b4fd0;backdrop-filter:blur(8px)}
.end .eye{font-size:19px}
.end h2{font-family:'Chakra Petch',monospace;font-weight:700;font-size:96px;line-height:1;margin:14px 0 22px;letter-spacing:-.015em}
.end .url{font-size:36px;color:#5b4fd0}
.end .tag{font-size:22px;color:#4a463e;margin-top:26px;line-height:1.5}
.end .qr{background:#fff;padding:18px;border:1px solid #DAD9D0;justify-self:end}
.end .qr svg{display:block;width:324px;height:324px}
.end .qrcap{text-align:right;font-size:16px;color:#6b6a62;margin-top:10px;letter-spacing:.12em}`;

const page_ = (body) => `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body>${body}</body></html>`;
const render = (k, c) => {
  if (c.kind === 'title') return page_(`<div class="title"><div class="eye">A research + design project · 2026</div><h1>MYCELIUM</h1>
    <div class="sub">The Whisper Network</div><div class="tag">an underground web of feeling<span class="zh">一张地下的情绪之网</span></div></div>`);
  if (c.kind === 'end') return page_(`<div class="end"><div class="panel"><div class="eye">mycelium.yueyao.design</div><h2>Grow one now.</h2>
    <div class="url zh">现在就种一只 →</div><div class="tag">No accounts. No feed. No metrics.<br>The same sentence always grows the same spore.<span class="zh" style="display:block;color:#6b6a62">同一句话永远长出同一只孢子。</span></div></div>
    ${qr ? `<div><div class="qr">${qr}</div><div class="qrcap">SCAN TO WHISPER</div></div>` : '<div></div>'}</div>`);
  return page_(`<div class="cap${c.narrow ? ' narrow' : ''}"><div class="eye">${c.eye}</div><div class="en">${c.en}</div><div class="zh">${c.zh}</div></div>`);
};

fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
for (const [k, c] of Object.entries(CAPTIONS)) {
  await page.setContent(render(k, c), { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: path.join(out, `cap-${k}.png`), omitBackground: true });
}
await browser.close();
console.log(`${Object.keys(CAPTIONS).length} captions →`, path.relative(root, out));
