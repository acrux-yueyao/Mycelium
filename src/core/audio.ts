/**
 * Audio — tiny web-audio synth that provides a gentle ambient bed
 * and a few event cues (spawn, connect, infect). All sounds are
 * generated live with oscillators + envelopes so we don't ship any
 * audio assets, and nothing plays until the user has interacted
 * with the page (browser autoplay policy).
 *
 * API:
 *   ensureAudioContext() — call after any user gesture.
 *   setMuted(on)         — global mute toggle, persisted via a ref.
 *   isMuted()            — current mute state.
 *   ambientStart() / ambientStop()  — gentle layered drone.
 *   cueSpawn()           — soft pluck when a new mushroom appears.
 *   cueConnect()         — bell-like tone when a tendril reaches target.
 *   cueInfect()          — low warm rumble when infection begins.
 */

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let muted = false;
let ambientNodes: OscillatorNode[] = [];
let ambientGain: GainNode | null = null;

export function ensureAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    try {
      const Ctor = window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      ctx = new Ctor();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.55;
      master.connect(ctx.destination);
    } catch {
      return null;
    }
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

export function setMuted(value: boolean): void {
  muted = value;
  if (master && ctx) {
    master.gain.cancelScheduledValues(ctx.currentTime);
    master.gain.linearRampToValueAtTime(muted ? 0 : 0.55, ctx.currentTime + 0.4);
  }
}

export function isMuted(): boolean {
  return muted;
}

/** Gentle ambient drone: two detuned sines + a very slow breathing gain. */
export function ambientStart(): void {
  ensureAudioContext();
  if (!ctx || !master) return;
  if (ambientNodes.length > 0) return;
  ambientGain = ctx.createGain();
  ambientGain.gain.value = 0;
  ambientGain.connect(master);
  // Swell in gently.
  ambientGain.gain.linearRampToValueAtTime(0.22, ctx.currentTime + 4);

  // Two layered sines, slightly detuned, with a very slow LFO on
  // one of them for "wind" feel.
  const freqs = [110, 165];   // A2 + E3 — warm, non-harmonic-1 open fifth
  for (const base of freqs) {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = base;
    const oscGain = ctx.createGain();
    oscGain.gain.value = base === 110 ? 0.45 : 0.3;
    // Slow detune LFO
    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 0.07 + Math.random() * 0.05;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 6; // cents range
    lfo.connect(lfoGain);
    lfoGain.connect(osc.detune);
    osc.connect(oscGain);
    oscGain.connect(ambientGain);
    osc.start();
    lfo.start();
    ambientNodes.push(osc, lfo);
  }
}

export function ambientStop(): void {
  if (!ctx || !ambientGain) return;
  const g = ambientGain;
  g.gain.cancelScheduledValues(ctx.currentTime);
  g.gain.linearRampToValueAtTime(0, ctx.currentTime + 1.2);
  const toKill = ambientNodes;
  ambientNodes = [];
  setTimeout(() => {
    for (const n of toKill) {
      try { n.stop(); } catch {}
    }
    try { g.disconnect(); } catch {}
    if (ambientGain === g) ambientGain = null;
  }, 1300);
}

/** One-shot envelope helper. */
function pluck(
  frequency: number,
  durationS: number,
  peak: number,
  type: OscillatorType = 'sine',
  bendTo?: number,
): void {
  if (!ctx || !master) return;
  const t0 = ctx.currentTime;
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.value = frequency;
  if (bendTo != null) {
    osc.frequency.linearRampToValueAtTime(bendTo, t0 + durationS * 0.9);
  }
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, t0);
  gain.gain.linearRampToValueAtTime(peak, t0 + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + durationS);
  osc.connect(gain);
  gain.connect(master);
  osc.start(t0);
  osc.stop(t0 + durationS + 0.1);
}

/** Soft pluck when a new mushroom is added to the stage. */
export function cueSpawn(): void {
  ensureAudioContext();
  if (!ctx || muted) return;
  const base = 440 + (Math.random() - 0.5) * 80;
  pluck(base, 1.6, 0.11, 'sine');
  // Tiny harmonic a 5th up, softer
  pluck(base * 1.5, 1.4, 0.04, 'triangle');
}

/** Bell-like tone when a tendril reaches its target (primary only). */
export function cueConnect(): void {
  ensureAudioContext();
  if (!ctx || muted) return;
  const base = 660 + (Math.random() - 0.5) * 60;
  pluck(base, 2.2, 0.08, 'sine');
  pluck(base * 2, 1.1, 0.02, 'sine');
}

/** Warm low rumble when an infection starts on an entity. */
export function cueInfect(): void {
  ensureAudioContext();
  if (!ctx || muted) return;
  const base = 80 + Math.random() * 30;
  // Downward glide gives the "gurgle" feel.
  pluck(base * 2, 2.2, 0.1, 'sawtooth', base);
}
