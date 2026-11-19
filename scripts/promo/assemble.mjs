#!/usr/bin/env node
/**
 * Promo cut — stitches the recorded footage, the caption overlays and the soundtrack into one film.
 *
 *   node scripts/promo/assemble.mjs <clips dir> <out.mp4>
 *
 * Reads <clips>/timeline.json (from record.mjs) so captions land on the moments they describe,
 * writes <clips>/cues.json for the soundtrack (spawn / connect plucks), renders the soundtrack, and
 * runs one ffmpeg pass: 1920 × 1080, 30 fps, H.264 + AAC.
 */
import path from 'node:path';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const clips = path.resolve(process.argv[2] || 'promo-clips');
const outFile = path.resolve(process.argv[3] || 'Mycelium_promo.mp4');
const T = JSON.parse(fs.readFileSync(path.join(clips, 'timeline.json'), 'utf8'));
const FPS = 30, XF = 0.8;                                     // crossfade between segments

// ---- segments: [source, in, out] in source seconds (trimmed footage, in order)
const s = T.site;
const SEG = [
  ['title', 0, 4.8],                                        // plain cream under the title card
  ['site', s.load + 0.4, s.release + 13.5],                // one take: landing → whisper → card → field
  ['dye', T.dye.field + 0.8, T.dye.field + 8.3],
  ['mother', T.mother.field + 14.8, T.mother.field + 23.3],
  ['elders', T.elders.field + 5.5, T.elders.field + 13.0],
  ['slides', 0.2, T.slides.total + 0.2],
  ['sky', 1.5, 12.5],
];
// segment start times on the final timeline (crossfades overlap by XF)
const start = []; let acc = 0;
SEG.forEach(([, a, b], i) => { start[i] = acc; acc += (b - a) - (i < SEG.length - 1 ? XF : 0); });
const total = acc;
const at = (i, srcT) => start[i] + (srcT - SEG[i][1]);      // final-timeline time of a source moment
const [I_TITLE, I_SITE, I_DYE, I_MOTHER, I_ELDERS, I_SLIDES, I_SKY] = [0, 1, 2, 3, 4, 5, 6];
const siteT = (k) => at(I_SITE, s[k]);
const sl = (k) => start[I_SLIDES] + k;

// ---- captions: [png key, show from, show to] on the final timeline
const CAP = [
  ['title', 0.5, start[I_SITE] + 0.5],
  ['whisper', siteT('typing') - 0.8, siteT('submit') - 0.2],
  ['reads', siteT('card') + 0.9, siteT('release') - 0.4],
  ['colony', siteT('release') + 1.6, start[I_DYE] + 0.2],
  ['dye', start[I_DYE] + 0.9, start[I_MOTHER] + 0.2],
  ['mother', start[I_MOTHER] + 0.9, start[I_ELDERS] + 0.2],
  ['elders', start[I_ELDERS] + 0.9, start[I_SLIDES] + 0.2],
  ['column', sl(0.8), sl(6.3)],
  ['market', sl(6.9), sl(11.2)],
  ['charms', sl(11.7), sl(15.0)],
  ['moony', sl(15.3), sl(18.4)],
  ['end', start[I_SKY] + 1.6, total + 1],
];
// ---- sound cues
const cues = [
  { t: siteT('card') + 0.2, kind: 'spawn' }, { t: siteT('release') + 0.3, kind: 'connect' },
  { t: start[I_DYE] + 1.4, kind: 'connect' }, { t: start[I_MOTHER] + 2.2, kind: 'spawn' }, { t: start[I_ELDERS] + 1.6, kind: 'connect' },
  { t: start[I_SKY] + 1.2, kind: 'spawn' },
];
fs.writeFileSync(path.join(clips, 'cues.json'), JSON.stringify(cues));
const wav = path.join(clips, 'soundtrack.wav');
execFileSync('node', [path.join(here, 'soundtrack.mjs'), String(Math.ceil(total + 1)), wav, path.join(clips, 'cues.json')], { stdio: 'inherit' });

// ---- ffmpeg graph
const inputs = []; let nIn = 0;
const add = (...args) => { inputs.push(...args); return nIn++; };
const vid = SEG.map(([n]) => n === 'title'
  ? add('-f', 'lavfi', '-i', `color=c=0xF1F0EB:s=1920x1080:r=${FPS}:d=6`)
  : add('-i', path.join(clips, `${n}.webm`)));
const aud = add('-i', wav);
const capIdx = CAP.map(([k]) => add('-loop', '1', '-i', path.join(clips, `cap-${k}.png`)));

let fc = '';
const ZOOM = { dye: 1.35, mother: 1.35, elders: 1.35 };           // the staged pairs sit small in a 1920 frame
SEG.forEach(([n, a, b], i) => {
  const z = ZOOM[n] || 1, cw = Math.round(1920 / z / 2) * 2, ch = Math.round(1080 / z / 2) * 2;
  const zoom = z > 1 ? `crop=${cw}:${ch}:(iw-${cw})/2:(ih-${ch})/2,` : '';
  fc += `[${vid[i]}:v]trim=start=${a}:end=${b},setpts=PTS-STARTPTS,fps=${FPS},${zoom}scale=1920:1080:flags=lanczos,format=yuv420p[v${i}];`;
});
// crossfade chain
let prev = 'v0';
for (let i = 1; i < SEG.length; i++) {
  const off = start[i];
  fc += `[${prev}][v${i}]xfade=transition=fade:duration=${XF}:offset=${off.toFixed(3)}[x${i}];`;
  prev = `x${i}`;
}
// caption overlays with alpha fades
CAP.forEach(([, from, to], i) => {
  const d = Math.max(0.3, to - from);
  fc += `[${capIdx[i]}:v]format=rgba,trim=duration=${(d + 0.01).toFixed(2)},setpts=PTS-STARTPTS+${from.toFixed(3)}/TB,` +
    `fade=t=in:st=${from.toFixed(3)}:d=0.7:alpha=1,fade=t=out:st=${(to - 0.7).toFixed(3)}:d=0.7:alpha=1[c${i}];`;
  fc += `[${prev}][c${i}]overlay=0:0:eof_action=pass[o${i}];`;
  prev = `o${i}`;
});
// fade in from cream, fade out to cream at the end
fc += `[${prev}]fade=t=in:st=0:d=0.8:color=0xF1F0EB,fade=t=out:st=${(total - 1.4).toFixed(3)}:d=1.4:color=black[vout];`;
fc += `[${aud}:a]atrim=0:${(total).toFixed(3)},volume=2.4,afade=t=in:st=0:d=2,afade=t=out:st=${(total - 3).toFixed(3)}:d=3,aformat=sample_rates=48000[aout]`;

const args = ['-y', '-loglevel', 'error', ...inputs, '-filter_complex', fc, '-map', '[vout]', '-map', '[aout]',
  '-c:v', 'libx264', '-crf', '18', '-preset', 'slow', '-r', String(FPS), '-t', total.toFixed(3),
  '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', outFile];
fs.writeFileSync(path.join(clips, 'ffmpeg-args.json'), JSON.stringify(args, null, 1));
execFileSync('ffmpeg', args, { stdio: 'inherit' });
console.log(`→ ${outFile}  (${total.toFixed(1)}s)`);
console.log('segments start at', start.map((v) => v.toFixed(1)).join(', '));
