#!/usr/bin/env python3
"""
moony-listen — the ear Moony borrows from the tower's Raspberry Pi 5.

Moony (XIAO ESP32-S3) records a few seconds while its head is held and
POSTs the raw audio here. This service, on the same LAN (phone hotspot):

  1. transcribes it locally with faster-whisper — the audio never leaves
     the Pi and is never written to disk;
  2. checks for an offline command (hello / sleep / wake up / look at me /
     dance / sing) — these work with no internet at all;
  3. otherwise sends ONLY the text to the site's /api/emotion (the same
     reading the tower uses: Claude reads it, never answers it) and
     returns the family + a few numbers for Moony's melody and eyes.

Moony never receives the words back, and nothing here logs them
(pass --debug to print transcripts while testing at home).

  POST /hear     body: little-endian int16 mono PCM, header X-Rate (default 16000)
                 → {"kind":"command","cmd":"sleep"}
                 → {"kind":"reading","family":3,"label":"dreamy","intensity":0.62,
                    "agitation":0.30,"glow":0.55,"hue":268}
                 → {"kind":"none"}            (silence / nothing understood)
                 → {"kind":"offline"}         (heard words, but no internet for a reading)
  GET  /         → {"ok":true,"model":"base"}

Run:  python3 moony_listen.py [--port 8766] [--model base] [--debug]
"""
import argparse
import json
import re
import sys
import threading
import time
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import numpy as np

EMOTION_URL = 'https://mycelium.yueyao.design/api/emotion'

# label → family id (src/data/characters.ts):
# 0 tender · 1 calm · 2 curious · 3 dreamy · 4 companion · 5 lonely
FAMILY = {
    'tender': 0, 'nostalgic': 0, 'soft': 0,
    'calm': 1, 'clear': 1, 'empty': 1,
    'curious': 2, 'playful': 2, 'clumsy': 2,
    'dreamy': 3, 'excited': 3, 'romantic': 3,
    'companion': 4, 'social': 4, 'attached': 4,
    'lonely': 5, 'restrained': 5, 'quiet': 5,
}

# Offline commands. Checked in order; the whole utterance must be short
# (a command, not a sentence that happens to contain "sing").
COMMANDS = [
    ('sleep', r'\b(go to )?sleep\b|\bgood ?night\b|\bnap\b|睡觉|晚安'),
    ('wake', r'\bwake( up)?\b|醒醒|起床'),
    ('look', r'\blook at me\b|\bwatch me\b|\bsee me\b|看我'),
    ('dance', r'\bdance\b|跳舞'),
    ('sing', r'\bsing\b|\bsong\b|唱歌'),
    ('hello', r'^\s*(hi|hello|hey|hiya|good (morning|afternoon|evening))\b|^\s*(你好|嗨|哈喽)'),
]
COMMAND_MAX_WORDS = 6

model = None
model_lock = threading.Lock()
DEBUG = False


def load_model(name):
    global model
    from faster_whisper import WhisperModel
    t0 = time.time()
    model = WhisperModel(name, device='cpu', compute_type='int8')
    print(f'[moony-listen] whisper "{name}" ready in {time.time() - t0:.1f}s', flush=True)


def transcribe(pcm, rate):
    audio = pcm.astype(np.float32) / 32768.0
    if rate != 16000:                          # Moony sends 16 kHz; resample defensively
        n = int(len(audio) * 16000 / rate)
        audio = np.interp(np.linspace(0, len(audio), n, endpoint=False), np.arange(len(audio)), audio)
    with model_lock:
        segments, info = model.transcribe(audio, beam_size=1, vad_filter=True,
                                          condition_on_previous_text=False)
        text = ''.join(s.text for s in segments).strip()
    return text


def match_command(text):
    t = text.lower().strip(' .!?,。！？，')
    if len(t.split()) > COMMAND_MAX_WORDS and not re.search(r'[一-鿿]', t):
        return None
    if re.search(r'[一-鿿]', t) and len(t) > 8:
        return None
    for cmd, pat in COMMANDS:
        if re.search(pat, t):
            return cmd
    return None


def read_emotion(text):
    req = urllib.request.Request(EMOTION_URL, data=json.dumps({'text': text[:500]}).encode(),
                                 headers={'content-type': 'application/json'}, method='POST')
    with urllib.request.urlopen(req, timeout=20) as r:
        d = json.loads(r.read())
    label = (d.get('primary') or {}).get('label', 'calm')
    m = d.get('morphology') or {}
    return {
        'kind': 'reading',
        'family': FAMILY.get(label, 1),
        'label': label,
        'intensity': round(float(d.get('intensity', 0.5)), 2),
        'agitation': round(float(m.get('agitation', 0.3)), 2),
        'glow': round(float(m.get('glow', 0.3)), 2),
        'hue': int(m.get('tintHue', 200)),
    }


class Handler(BaseHTTPRequestHandler):
    def _send(self, obj, code=200):
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header('content-type', 'application/json')
        self.send_header('content-length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *a):                 # keep the console quiet
        pass

    def do_GET(self):
        self._send({'ok': model is not None, 'model': ARGS.model})

    def do_POST(self):
        if self.path != '/hear':
            return self._send({'error': 'not-found'}, 404)
        n = int(self.headers.get('content-length', 0))
        if n < 3200 or n > 16000 * 2 * 12:      # 0.1 s .. 12 s
            return self._send({'kind': 'none'})
        rate = int(self.headers.get('x-rate', 16000))
        pcm = np.frombuffer(self.rfile.read(n), dtype='<i2')
        t0 = time.time()
        try:
            text = transcribe(pcm, rate)
        except Exception as e:                  # never crash the ear
            print('[moony-listen] whisper error', e, flush=True)
            return self._send({'kind': 'none'})
        if DEBUG:
            print(f'[heard {time.time() - t0:.1f}s] {text!r}', flush=True)
        if len(text.strip(' .!?,。！？，')) < 2:
            return self._send({'kind': 'none'})
        cmd = match_command(text)
        if cmd:
            print(f'[moony-listen] command {cmd}', flush=True)
            return self._send({'kind': 'command', 'cmd': cmd})
        try:
            out = read_emotion(text)
        except Exception as e:
            print('[moony-listen] reading unavailable:', type(e).__name__, flush=True)
            return self._send({'kind': 'offline'})
        print(f'[moony-listen] reading {out["label"]} {out["intensity"]}', flush=True)
        self._send(out)


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--port', type=int, default=8766)
    ap.add_argument('--model', default='base', help='tiny / base / small (multilingual)')
    ap.add_argument('--debug', action='store_true', help='print transcripts (testing only)')
    ARGS = ap.parse_args()
    DEBUG = ARGS.debug
    load_model(ARGS.model)
    print(f'[moony-listen] listening on :{ARGS.port}', flush=True)
    ThreadingHTTPServer(('0.0.0.0', ARGS.port), Handler).serve_forever()
