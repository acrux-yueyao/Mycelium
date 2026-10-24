#!/usr/bin/env python3
"""
Moony's voice — a small creature synth for auditioning sounds on a laptop before they go
into the firmware. No words, no samples: every call is synthesised from a seeded
"personality" (the idea follows Pollen Robotics' Microduck voice, Apache-2.0,
github.com/pollen-robotics/microduck_emotions — this is an independent implementation).

  personality(seed)  → pitch centre, timbre (harmonic tilt, brightness, nasal), vibrato,
                        jitter, breath, "flutter" (fast amplitude buzz, the quacky part),
                        attack sharpness, speed. Same seed → same voice, always.
  call(p, dur, contour, env, ...) → one vocalisation: 7 harmonics on a pitch contour
                        (multiples of the pitch centre) × envelope.
  SOUNDS             → Moony's event sounds (pat, listen, curious, sad, sleep ...) and a
                        short sung phrase for each of the six emotion families.

The speaker is a 30×20 mm driver: nothing useful below ~300 Hz, so the pitch centre is
kept in 330–560 Hz and the low end of every contour stays above ~250 Hz.

Usage: python3 scripts/moony-voice/voice.py <out_dir> [seed ...]
       one seed → every sound as its own wav + all.wav;  several seeds → a comparison reel
"""
import math
import os
import sys
import wave

import numpy as np

SR = 22050          # what the firmware will run at
TAU = 2 * math.pi


def personality(seed):
    r = np.random.default_rng(seed)
    u = lambda lo, hi: float(r.uniform(lo, hi))
    return dict(
        seed=seed,
        pitch=u(330, 560),          # Hz, centre of the voice
        spread=u(0.5, 1.1),         # how far contours swing
        tilt=u(1.5, 2.6),           # harmonic roll-off: high = soft/round, low = bright
        bright=u(0.05, 0.4),        # lift of the upper harmonics
        nasal=u(0.1, 0.8),          # boost of harmonics 2–3
        vib_hz=u(4.0, 8.0), vib_st=u(0.05, 0.5),
        jitter_st=u(0.03, 0.25),
        breath=u(0.02, 0.18),
        flutter=u(0.15, 0.7),       # depth of the fast AM buzz (the "quack")
        flutter_hz=u(20, 45),
        attack=u(0.0, 1.0),         # 0 soft … 1 snappy
        speed=u(0.88, 1.15),
    )


def harmonics(p, n=7):
    w = []
    for k in range(1, n + 1):
        v = 1.0 / k ** p['tilt'] + p['bright'] * (k / n) ** 1.5 + (p['nasal'] * 0.5 if k in (2, 3) else 0)
        w.append(v)
    w[0] = max(w[0], 0.7)
    return np.array(w)


def _env(t, kind, a, b):
    if kind == 'decay':                      # quick attack, exponential tail
        return np.clip(t / max(a, 1e-4), 0, 1) * np.exp(-np.maximum(t - a, 0) / max(b, 1e-4))
    rel = max(t[-1] - b, 0)                  # 'bell': attack, hold, linear release
    e = np.ones_like(t)
    e = np.where(t < a, t / max(a, 1e-4), e)
    return np.clip(np.where(t > rel, 1 - (t - rel) / max(b, 1e-4), e), 0, 1)


def call(p, dur, contour, env=('bell', None, None), *, flutter=1.0, breath=1.0, soft=0.0,
         warble=0.0, seed=0):
    """One vocalisation. contour = [(t_frac, pitch_mul), ...] over 0..1 of the duration."""
    dur /= p['speed']
    t = np.arange(int(dur * SR)) / SR
    r = np.random.default_rng((p['seed'] * 7919 + seed) & 0xFFFFFFFF)
    f = np.interp(t / dur, [c[0] for c in contour], [c[1] for c in contour]) * p['pitch']
    f *= 2 ** (p['vib_st'] * np.sin(TAU * p['vib_hz'] * t + r.uniform(0, TAU)) / 12)
    jit = np.convolve(r.standard_normal(len(t)), np.ones(40) / 40, 'same')
    f *= 2 ** (p['jitter_st'] * jit * 3 / 12)
    if warble:
        f *= 2 ** (warble * np.sin(TAU * 11 * t) / 12)
    ph = TAU * np.cumsum(f) / SR
    w = harmonics(p)
    if soft:                                  # muffled: roll off the upper harmonics
        w = w * np.array([1 / (1 + soft * k * k * 0.3) for k in range(len(w))])
    body = sum(wk * np.sin((k + 1) * ph) for k, wk in enumerate(w))
    d = p['flutter'] * flutter
    if d > 0.01:
        body *= 1 - d * (0.5 + 0.5 * np.sin(TAU * p['flutter_hz'] * t))
    if p['breath'] * breath > 0:
        x = r.standard_normal(len(t)); y = np.empty_like(x); acc = 0.0
        for i, v in enumerate(x):            # one-pole pink-ish noise (same as the firmware will do)
            acc = 0.97 * acc + v; y[i] = acc
        body += p['breath'] * breath * y / (np.abs(y).max() + 1e-9) * 2
    kind, a, b = env
    if a is None:
        a = 0.03 * dur - 0.025 * dur * p['attack']
    if b is None:
        b = 0.5 * dur
    return body * _env(t, kind, a, b)


def gap(s):
    return np.zeros(int(s * SR))


def seq(*parts):
    return np.concatenate(parts)


# ---- Moony's sounds. Contours are pitch multiples of the personality's centre.
def s_hello(p):      # "hi-i!" two rising notes
    return seq(call(p, 0.14, [(0, 0.9), (1, 1.2)], ('decay', None, 0.1), seed=1), gap(0.05),
               call(p, 0.30, [(0, 1.1), (0.4, 1.55), (1, 1.4)], seed=2))


def s_pat(p):        # a soft content coo when patted
    return call(p, 0.38, [(0, 0.85), (0.35, 0.95), (1, 0.72)], ('bell', 0.04, 0.22), flutter=0.25,
                breath=1.6, soft=1.0, seed=3)


def s_listen(p):     # muffled rising "mm?" — I'm listening
    return call(p, 0.36, [(0, 0.72), (1, 1.0)], ('bell', 0.05, 0.12), flutter=0.0, soft=2.5, seed=4)


def s_think(p):      # three tiny hums at wandering pitch
    return seq(*[x for i, m in enumerate((0.9, 1.05, 0.95))
                 for x in (call(p, 0.11, [(0, m), (1, m * 1.03)], ('bell', 0.02, 0.05), flutter=0.2,
                                soft=2.0, seed=10 + i), gap(0.09))])


def s_curious(p):    # "what? what?" two rising chirps
    return seq(call(p, 0.15, [(0, 1.0), (1, 1.5)], ('decay', None, 0.12), seed=20), gap(0.12),
               call(p, 0.18, [(0, 1.15), (1, 1.85)], ('decay', None, 0.14), seed=21))


def s_happy(p):      # quick bouncy trill up
    notes = (1.0, 1.26, 1.12, 1.5)
    return seq(*[x for i, m in enumerate(notes)
                 for x in (call(p, 0.09, [(0, m), (1, m * 1.04)], ('decay', None, 0.07), seed=30 + i),
                           gap(0.03))])


def s_sad(p):        # a slow coo gliding down
    return call(p, 0.95, [(0, 1.05), (0.25, 1.1), (1, 0.6)], ('bell', 0.08, 0.4),
                flutter=0.4, breath=1.4, seed=40)


def s_startle(p):    # alarm: sharp up, falls away
    s = 1 + 0.3 * p['spread']
    return call(p, 0.26, [(0, 1.3 * s), (0.06, 1.6 * s), (1, 1.0 * s)], ('decay', 0.003, 0.11),
                flutter=0.6, seed=50)


def s_grumpy(p):     # shaken: low buzzy growl
    q = dict(p, flutter=0.9, flutter_hz=24)
    return call(q, 0.5, [(0, 0.66), (0.5, 0.62), (1, 0.58)], ('bell', 0.02, 0.15), seed=60)


def s_dizzy(p):      # upside down: a wobbling woo-oo
    return call(p, 0.9, [(0, 1.2), (0.5, 0.9), (1, 1.1)], ('bell', 0.05, 0.3), warble=1.6,
                flutter=0.3, seed=70)


def s_sleep(p):      # yawn: up, then a long slide down into breath
    return call(p, 1.3, [(0, 0.95), (0.25, 1.35), (1, 0.55)], ('bell', 0.12, 0.6), flutter=0.15,
                breath=2.5, soft=1.2, seed=80)


def s_wake(p):       # stretching rise
    return call(p, 0.55, [(0, 0.65), (0.7, 1.45), (1, 1.35)], ('bell', 0.06, 0.15), breath=1.5,
                seed=90)


def s_reunion(p):    # three-note greeting after a while alone
    return seq(call(p, 0.13, [(0, 1.0), (1, 1.05)], ('decay', None, 0.1), seed=100), gap(0.06),
               call(p, 0.13, [(0, 1.26), (1, 1.3)], ('decay', None, 0.1), seed=101), gap(0.06),
               call(p, 0.34, [(0, 1.5), (0.5, 1.62), (1, 1.5)], seed=102))


def s_puzzled(p):    # didn't catch that: a short "hm?"
    return call(p, 0.22, [(0, 0.9), (1, 1.15)], ('bell', 0.03, 0.08), flutter=0.1, soft=1.5, seed=110)


# the six emotion families, sung with the voice (scale degrees as pitch multiples)
MAJ = [1, 9 / 8, 5 / 4, 3 / 2, 5 / 3, 2]
MIN = [1, 9 / 8, 6 / 5, 4 / 3, 3 / 2, 8 / 5]
WHOLE = [1, 9 / 8, 5 / 4, 1.414, 1.587, 1.782]
FAMILIES = {
    'tender':    (MAJ, [0, 2, 3, 2, 4], 0.20, dict(soft=0.8, flutter=0.3)),
    'calm':      (MAJ, [2, 1, 0, 0], 0.30, dict(soft=1.5, flutter=0.1)),
    'curious':   (MAJ, [0, 3, 1, 4, 5], 0.10, dict()),
    'dreamy':    (WHOLE, [0, 2, 4, 3, 5], 0.22, dict(soft=1.0, breath=1.8)),
    'companion': (MAJ, [0, 2, 4, 2, 0], 0.16, dict(flutter=0.6)),
    'lonely':    (MIN, [3, 2, 1, 0], 0.30, dict(soft=1.2, breath=1.5)),
}


def s_family(p, name):
    scale, steps, d, kw = FAMILIES[name]
    out = []
    for i, k in enumerate(steps):
        m = scale[k] * 0.8
        last = i == len(steps) - 1
        out += [call(p, d * (1.8 if last else 1), [(0, m * 0.98), (0.2, m), (1, m * (0.97 if last else 1))],
                     ('bell', 0.02, d * 0.5), seed=200 + i, **kw), gap(0.04)]
    return seq(*out)


SOUNDS = dict(hello=s_hello, pat=s_pat, listen=s_listen, think=s_think, puzzled=s_puzzled,
              curious=s_curious, happy=s_happy, sad=s_sad, startle=s_startle, grumpy=s_grumpy,
              dizzy=s_dizzy, sleep=s_sleep, wake=s_wake, reunion=s_reunion)


def write(path, x, peak=0.7):
    x = x / (np.abs(x).max() + 1e-9) * peak
    with wave.open(path, 'w') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes((x * 32767).astype(np.int16).tobytes())


def main(out, seeds):
    os.makedirs(out, exist_ok=True)
    norm = lambda x: x / (np.abs(x).max() + 1e-9)
    if len(seeds) == 1:
        p = personality(seeds[0])
        allx = []
        for name, fn in SOUNDS.items():
            x = fn(p); write(f'{out}/{name}.wav', x); allx += [norm(x), gap(0.6)]
        for name in FAMILIES:
            x = s_family(p, name); write(f'{out}/family_{name}.wav', x); allx += [norm(x), gap(0.6)]
        write(f'{out}/all.wav', seq(*allx))
        print({k: round(v, 2) if isinstance(v, float) else v for k, v in p.items()})
    else:
        reel = []
        for s in seeds:
            p = personality(s)
            reel += [norm(x) for x in (s_hello(p), gap(0.3), s_pat(p), gap(0.3), s_curious(p), gap(0.3),
                                       s_sad(p))] + [gap(1.2)]
            print(s, f"{p['pitch']:.0f} Hz", f"flutter {p['flutter']:.2f}", f"tilt {p['tilt']:.2f}")
        write(f'{out}/voices.wav', seq(*reel))


if __name__ == '__main__':
    main(sys.argv[1], [int(s) for s in sys.argv[2:]] or [7])
