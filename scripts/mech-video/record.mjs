#!/usr/bin/env node
/**
 * Mechanism clips for the website — recorded from the real field renderer, not re-drawn.
 *
 * Each clip stages two or three spores on the live field (the built site, served locally, with
 * /api/creatures answered by a tiny hand-placed colony) and records what the colony does on its
 * own: contact-point dyeing, mother-tree support, two elders meeting. The recording is cropped
 * to the centre and encoded to mp4 (H.264) + webm (VP9) + a poster frame.
 *
 *   node_modules/.bin/vite build && node_modules/.bin/vite preview --port 4321 &
 *   node scripts/mech-video/record.mjs            → public/mech-{dye,mother,elders}.{mp4,webm,jpg}
 *
 * Needs Playwright + Chromium and ffmpeg.
 */
import path from 'node:path';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const outDir = path.join(root, 'public');
const tmp = path.join(process.env.TMPDIR || '/tmp', 'mech-video');
const PORT = process.env.PORT || 4321;
const W = 1280, H = 720;                 // recorded; the clip is the centre 1120 × 630
const CROP = 'crop=1120:630:80:45';

// mirrors DitherField's per-id helpers so the staged ids behave predictably
function seed01(id) { let h = 2166136261; for (let i = 0; i < id.length; i++) { h ^= id.charCodeAt(i); h = Math.imul(h, 16777619); } return ((h >>> 0) % 10000) / 10000; }
const pairKey = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);

const DAY = 86_400_000, now = Date.now();
const spore = (id, charId, x, y, cell, ageMs, hue) => ({
  id, charId, x, y, cell, bornAt: now - ageMs, intensity: 0.75,
  morphology: { density: 0.8, agitation: 0.35, tendrilCount: 5, glow: 0.15, tintHue: hue, particles: false },
});
// open the site through a share link (?s=) of a spore that is NOT in the colony: that lands on the
// specimen card with the whisper input already retired, so the field has no input, no centre hole
// and no "· you" label; from there one click on FIELD shows the plain field
const ghost = { i: 'ghost-0', c: 1, m: { density: 0.8, agitation: 0.3, tendrilCount: 5, glow: 0.15, tintHue: 200, particles: false }, n: 0.5, e: 5 };
const token = Buffer.from(JSON.stringify(ghost), 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
// an elder pair whose long encounter is one that imprints (seeded roll < HYBRID_CHANCE 0.4)
let eldB = 'eld-b-183';
for (let n = 0; n < 400 && seed01(pairKey('eld-a-289', eldB) + 'hyb') >= 0.4; n++) eldB = `eld-b-${n}`;

const CLIPS = [
  { name: 'dye', ms: 36_000, start: 3.0, dur: 30,
    // two compatible young spores placed just inside connect range: they bond at once, the dye
    // sweeps in from the contact side, tiles go back and forth, then the bond lapses and the
    // colour releases
    creatures: [spore('dye-a-121', 0, 0.46, 0.6, 10, 20 * 60_000, 20), spore('dye-b-88', 4, 0.54, 0.6, 10, 25 * 60_000, 170)] },
  { name: 'mother', ms: 50_000, start: 13.0, dur: 34,
    // an old spore (mother-tree age) and a lonely one ~200 px apart: after ~16 s alone, the mother
    // reaches over with slow feed tiles and the lonely one takes on her palette
    creatures: [spore('mom-70', 1, 0.42, 0.64, 10, 12 * DAY, 205), spore('lone-99', 5, 0.58, 0.64, 10, 30 * 60_000, 0)] },
  { name: 'elders', ms: 38_000, start: 3.0, dur: 32,
    // two mature spores (stage 4) meeting: bond, dye, matter exchange, breathing in step, and —
    // after a long enough encounter — a permanent trace of each other's colour
    creatures: [spore('eld-a-289', 2, 0.46, 0.6, 10, 25 * DAY, 30), spore(eldB, 3, 0.54, 0.6, 10, 28 * DAY, 230)] },
];

const HIDE = `nav, button, input, textarea, .field-prompt, .specimen-recall, .whisper-again, .mute-toggle,
  .kiosk-invite, .scene.feedback, .scene.survey { display: none !important; }`;

fs.rmSync(tmp, { recursive: true, force: true }); fs.mkdirSync(tmp, { recursive: true });
const browser = await chromium.launch();
for (const clip of CLIPS) {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, recordVideo: { dir: tmp, size: { width: W, height: H } } });
  const page = await ctx.newPage();
  await page.route('**/api/**', (r) => {
    const u = r.request().url();
    if (u.includes('/api/creatures')) return r.fulfill({ json: { creatures: clip.creatures, population: clip.creatures.length } });
    return r.fulfill({ json: {} });
  });
  await page.goto(`http://localhost:${PORT}/?s=${token}`, { waitUntil: 'load' });
  await page.waitForTimeout(800);
  await page.click('text=FIELD');
  await page.mouse.move(W / 2, H / 2);          // the colony notices the cursor: keep it in the middle
  await page.addStyleTag({ content: HIDE });
  await page.waitForTimeout(clip.ms);
  // sanity: the staged spores are on stage (names drawn from their ids)
  const video = page.video();
  await ctx.close();
  const src = await video.path();
  const base = path.join(outDir, `mech-${clip.name}`);
  const vf = `${CROP},fps=30,format=yuv420p`;
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', String(clip.start), '-t', String(clip.dur), '-i', src,
    '-vf', vf, '-an', '-c:v', 'libx264', '-crf', '18', '-preset', 'slow', '-movflags', '+faststart', `${base}.mp4`]);
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', String(clip.start), '-t', String(clip.dur), '-i', src,
    '-vf', vf, '-an', '-c:v', 'libvpx-vp9', '-crf', '30', '-b:v', '0', '-row-mt', '1', `${base}.webm`]);
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', String(clip.start + clip.dur * 0.45), '-i', src,
    '-vf', CROP, '-frames:v', '1', '-q:v', '2', `${base}.jpg`]);
  const kb = (f) => Math.round(fs.statSync(f).size / 1024);
  console.log(`mech-${clip.name}: ${clip.dur}s · mp4 ${kb(base + '.mp4')} KB · webm ${kb(base + '.webm')} KB · poster ${kb(base + '.jpg')} KB`);
}
await browser.close();
