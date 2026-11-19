#!/usr/bin/env node
/**
 * Soundtrack for the promo — the site's own sound, rendered offline. Mirrors src/core/audio.ts:
 * a soft layered pad (detuned sines with slow tremolo), a random walk over the C-major pentatonic
 * (plucks with a little harmonic), and a bell when something connects. No samples, no deps.
 *
 *   node scripts/promo/soundtrack.mjs <seconds> <out.wav> [events.json]
 *   events.json: [{ "t": 21.5, "kind": "spawn" | "connect" }, ...] — cues placed on the timeline
 */
import fs from 'node:fs';

const [, , secArg = '84', out = 'soundtrack.wav', evPath] = process.argv;
const SR = 48000, N = Math.round(Number(secArg) * SR);
const L = new Float32Array(N), R = new Float32Array(N);
let seed = 7;
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; };
const TAU = Math.PI * 2;

// ---- pad: C2/G2/C3/E3 — same voicing idea as ambientStart(), each tone with its own slow LFO
const pad = [[65.41, 0.030], [98.0, 0.022], [130.81, 0.020], [164.81, 0.012]];
for (const [f, g] of pad) {
  const lfoHz = 0.06 + rnd() * 0.05, det = 1 + (rnd() - 0.5) * 0.004, phL = rnd() * TAU, phR = rnd() * TAU;
  for (let i = 0; i < N; i++) {
    const t = i / SR;
    const env = Math.min(1, t / 6) * Math.min(1, (N / SR - t) / 6);           // 6 s in / out
    const trem = 0.78 + 0.22 * Math.sin(TAU * lfoHz * t);
    const a = g * env * trem;
    L[i] += a * (Math.sin(TAU * f * t + phL) + 0.35 * Math.sin(TAU * f * det * 2 * t));
    R[i] += a * (Math.sin(TAU * f * det * t + phR) + 0.35 * Math.sin(TAU * f * 2 * t));
  }
}
// ---- breath: very quiet filtered noise swelling every ~9 s
let lp = 0;
for (let i = 0; i < N; i++) {
  const t = i / SR;
  lp += (rnd() * 2 - 1 - lp) * 0.012;
  const sw = 0.5 + 0.5 * Math.sin(TAU * t / 9 - 1.2);
  const env = Math.min(1, t / 8) * Math.min(1, (N / SR - t) / 8);
  L[i] += lp * 0.05 * sw * env; R[i] += lp * 0.05 * (1 - 0.3 * sw) * env;
}
// ---- plucks: the melody walk (C4 → E5 pentatonic), one note every 2–5 s, never two big leaps
const SCALE = [261.63, 293.66, 329.63, 392.0, 440.0, 523.25, 587.33, 659.25];
function pluck(t0, f, dur, vol, pan = 0.5, bend = 0) {
  const i0 = Math.round(t0 * SR), n = Math.round(dur * SR);
  for (let k = 0; k < n && i0 + k < N; k++) {
    const t = k / SR, p = k / n;
    const env = Math.min(1, t / 0.012) * Math.pow(1 - p, 2.2);
    const fr = f * (1 + bend * p);
    const s = env * vol * (Math.sin(TAU * fr * t) + 0.18 * Math.sin(TAU * fr * 2 * t) * (1 - p));
    L[i0 + k] += s * (1 - pan); R[i0 + k] += s * pan;
  }
}
let idx = 2, t = 7;
while (t < N / SR - 4) {
  const step = [-2, -1, -1, 1, 1, 2][Math.floor(rnd() * 6)];
  idx = Math.max(0, Math.min(SCALE.length - 1, idx + step));
  pluck(t, SCALE[idx], 1.6 + rnd(), 0.055 + rnd() * 0.02, 0.35 + rnd() * 0.3);
  t += 2 + rnd() * 3;
}
// ---- event cues on the timeline (cueSpawn / cueConnect)
const events = evPath ? JSON.parse(fs.readFileSync(evPath, 'utf8')) : [];
for (const e of events) {
  if (e.kind === 'spawn') { pluck(e.t, 523.25, 1.6, 0.11, 0.5, 0.02); pluck(e.t, 784.0, 1.4, 0.04, 0.55); }
  if (e.kind === 'connect') { pluck(e.t, 659.25, 2.2, 0.08, 0.5); pluck(e.t, 1318.5, 1.1, 0.02, 0.5); }
}
// ---- master: gentle soft-clip, 16-bit stereo wav
const buf = Buffer.alloc(44 + N * 4);
buf.write('RIFF', 0); buf.writeUInt32LE(36 + N * 4, 4); buf.write('WAVEfmt ', 8); buf.writeUInt32LE(16, 16);
buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22); buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 4, 28);
buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(N * 4, 40);
const sc = (v) => Math.max(-1, Math.min(1, Math.tanh(v * 1.4)));
for (let i = 0; i < N; i++) { buf.writeInt16LE(Math.round(sc(L[i]) * 32767), 44 + i * 4); buf.writeInt16LE(Math.round(sc(R[i]) * 32767), 46 + i * 4); }
fs.writeFileSync(out, buf);
console.log(`${out}: ${secArg}s, ${events.length} cues`);
