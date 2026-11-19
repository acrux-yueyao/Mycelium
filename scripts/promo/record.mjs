#!/usr/bin/env node
/**
 * Promo footage — everything recorded from the real site (built, served locally) at 1920 × 1080:
 *   site.webm    landing → ENTER → a whisper typed into the tree hole → the specimen card → released
 *   dye / mother / elders .webm   the three mechanisms, staged like scripts/mech-video/record.mjs
 *   sky.webm     the tower's night sky panel (?kiosk=sky)
 *   slides.webm  installation photos with a slow Ken Burns drift (an HTML page, recorded)
 * Writes <out>/timeline.json with the moments captions need (enter, typing, submit, card, release).
 *
 *   node_modules/.bin/vite preview --port 4323 &
 *   node scripts/promo/record.mjs <out dir>
 */
import path from 'node:path';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const out = path.resolve(process.argv[2] || 'promo-clips');
const PORT = process.env.PORT || 4323;
const W = 1920, H = 1080;
fs.mkdirSync(out, { recursive: true });

// ---- a lively, deterministic colony for the landing / field / sky
let seed = 11; const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; };
const DAY = 86_400_000, now = Date.now();
const spore = (id, charId, x, y, cell, ageMs, hue, extra = {}) => ({
  id, charId, x, y, cell, bornAt: now - ageMs, intensity: 0.5 + rnd() * 0.45,
  morphology: { density: 0.6 + rnd() * 0.35, agitation: 0.2 + rnd() * 0.4, tendrilCount: 5, glow: 0.15, tintHue: hue, particles: false }, ...extra,
});
const colony = [];
for (let i = 0; i < 44; i++) {
  const c = i % 6;
  colony.push(spore(`promo-${i}`, c, 0.08 + rnd() * 0.84, 0.1 + rnd() * 0.8, 4 + Math.floor(rnd() * 4), rnd() * 30 * DAY, (24 + c * 47 + rnd() * 50) % 360));
}
const READING = { primary: { label: 'calm', weight: 0.72 }, secondary: { label: 'hope', weight: 0.28 }, intensity: 0.58, topic: 'self',
  morphology: { density: 0.74, agitation: 0.22, tendrilCount: 5, glow: 0.2, tintHue: 206, particles: false },
  rationale: 'still water after weather — calm with a little light under it' };
const SENTENCE = 'today, my heart feels like a quiet lake after rain';

function seed01(id) { let h = 2166136261; for (let i = 0; i < id.length; i++) { h ^= id.charCodeAt(i); h = Math.imul(h, 16777619); } return ((h >>> 0) % 10000) / 10000; }
const pairKey = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);
let eldB = 'eld-b-183';
for (let n = 0; n < 400 && seed01(pairKey('eld-a-289', eldB) + 'hyb') >= 0.4; n++) eldB = `eld-b-${n}`;
const stage = (id, charId, x, y, age, hue) => spore(id, charId, x, y, 12, age, hue, { intensity: 0.75 });
const MECH = {
  dye: [stage('dye-a-121', 0, 0.465, 0.56, 20 * 60_000, 20), stage('dye-b-88', 4, 0.535, 0.56, 25 * 60_000, 170)],
  mother: [stage('mom-70', 1, 0.44, 0.6, 12 * DAY, 205), stage('lone-99', 5, 0.56, 0.6, 30 * 60_000, 0)],
  elders: [stage('eld-a-289', 2, 0.465, 0.56, 25 * DAY, 30), stage(eldB, 3, 0.535, 0.56, 28 * DAY, 230)],
};
const ghost = { i: 'ghost-0', c: 1, m: READING.morphology, n: 0.5, e: 5 };
const token = Buffer.from(JSON.stringify(ghost)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const HIDE = `nav, button, input, textarea, .field-prompt, .specimen-recall, .whisper-again, .mute-toggle, .kiosk-invite,
  .scene.feedback, .scene.survey { display: none !important; }`;

const browser = await chromium.launch();
const ONLY = process.env.ONLY || null;
let timeline = {};
try { if (ONLY) timeline = JSON.parse(fs.readFileSync(path.join(out, 'timeline.json'), 'utf8')); } catch { /* fresh */ }
async function record(name, creatures, run) {
  if (ONLY && ONLY !== name) return;
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, recordVideo: { dir: out, size: { width: W, height: H } } });
  const page = await ctx.newPage();
  await page.route('**/api/**', (r) => {
    const u = r.request().url();
    if (u.includes('/api/creatures')) return r.fulfill({ json: { creatures, population: 6857 } });
    if (u.includes('/api/emotion')) return r.fulfill({ json: READING });
    return r.fulfill({ json: {} });
  });
  const t0 = Date.now();
  const mark = (k) => { (timeline[name] ??= {})[k] = +((Date.now() - t0) / 1000).toFixed(2); };
  await run(page, mark);
  const v = page.video(); await ctx.close();
  const p = await v.path(); fs.renameSync(p, path.join(out, `${name}.webm`));
  console.log(`${name}.webm`, JSON.stringify(timeline[name] || {}));
}

// 1 · landing → whisper → card → field
await record('site', colony, async (page, mark) => {
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'load' }); mark('load');
  await page.mouse.move(300, 700);
  for (let i = 0; i <= 60; i++) { await page.mouse.move(300 + i * 22, 700 - i * 6); await page.waitForTimeout(120); }   // slow parallax glide
  await page.waitForTimeout(600);
  await page.click('.landing-enter'); mark('enter');
  await page.waitForTimeout(2600);
  await page.click('textarea'); mark('typing');
  await page.keyboard.type(SENTENCE, { delay: 75 });
  await page.waitForTimeout(1300);
  await page.keyboard.press('Enter'); mark('submit');
  await page.waitForTimeout(600); mark('card');
  await page.waitForTimeout(7500);
  await page.click('.spec-stage'); mark('release');            // a click on the card releases it into the field
  await page.mouse.move(W / 2, H / 2);
  for (let i = 0; i < 6; i++) { await page.waitForTimeout(2300); await page.mouse.move(W / 2 + (i % 2 ? 160 : -160), H / 2 + 40); }
  mark('end');
});

// 2 · the three mechanisms
for (const [name, crs] of Object.entries(MECH)) {
  await record(name, crs, async (page, mark) => {
    await page.goto(`http://localhost:${PORT}/?s=${token}`, { waitUntil: 'load' });
    await page.waitForTimeout(800);
    await page.click('text=FIELD'); mark('field');
    await page.mouse.move(W / 2, H / 2);
    await page.addStyleTag({ content: HIDE });
    await page.waitForTimeout(name === 'mother' ? 30_000 : 18_000);
  });
}

// 3 · the tower's sky
await record('sky', colony, async (page) => {
  await page.goto(`http://localhost:${PORT}/?kiosk=sky`, { waitUntil: 'load' });
  await page.waitForTimeout(14_000);
});

// 4 · installation photos, slow drift
const photos = (f) => 'file://' + path.join(root, 'design/portfolio/photos', f);
const SLIDES = [['p8-gallery.webp', 6.5, 'scale(1.0) translate(0,2%)', 'scale(1.08) translate(0,-2%)'],
  ['p9-details.webp', 5, 'scale(1.06) translate(1.5%,1%)', 'scale(1.0) translate(0,0)'],
  ['p3-charms.jpg', 3.6, 'scale(1.1) translate(0,3%)', 'scale(1.02) translate(0,-1%)'],
  ['p4-figure.jpg', 3.6, 'scale(1.0) translate(0,0)', 'scale(1.08) translate(-1%,-2%)']];
let keyframes = '', slides = '', acc = 0;
SLIDES.forEach(([f, d, from, to], i) => {
  keyframes += `@keyframes kb${i}{from{transform:${from}}to{transform:${to}}}`;
  slides += `<div class="s" style="animation:show ${d}s linear ${acc}s both"><img src="${photos(f)}" style="animation:kb${i} ${d + 1}s linear ${acc}s both"></div>`;
  acc += d;
});
const slidesHtml = `<!doctype html><html><head><meta charset="utf-8"><style>
html,body{margin:0;width:1920px;height:1080px;background:#F1F0EB;overflow:hidden}
.s{position:absolute;inset:0;display:grid;place-items:center;justify-items:end;padding-right:120px;opacity:0}
.s img{height:100%;width:auto;object-fit:cover;box-shadow:0 20px 60px rgba(0,0,0,.14)}
@keyframes show{0%{opacity:0}8%{opacity:1}92%{opacity:1}100%{opacity:0}} ${keyframes}
</style></head><body>${slides}</body></html>`;
const slidesPath = path.join(out, 'slides.html'); fs.writeFileSync(slidesPath, slidesHtml);
await record('slides', [], async (page) => {
  await page.goto('file://' + slidesPath, { waitUntil: 'load' });
  await page.waitForTimeout(acc * 1000 + 400);
});
if (!ONLY || ONLY === 'slides') timeline.slides = { total: acc };
fs.writeFileSync(path.join(out, 'timeline.json'), JSON.stringify(timeline, null, 1));
await browser.close();
console.log('→', path.relative(root, out));
