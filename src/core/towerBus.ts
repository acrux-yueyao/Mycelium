/**
 * towerBus — live link between the tower's kiosk screens.
 *
 * The 15.6" field (Pi 5) and the 7" micro (Pi 4) are two Chromium kiosks on
 * two machines. Each Pi runs a tiny relay on loopback (spore-bus.py, in the
 * Arduino repo's scripts/tower/): pages POST messages to it and read a
 * Server-Sent-Events stream back; the Pi 5 relay forwards to the Pi 4 one
 * over the LAN. No cloud round-trip, so a spore picked on the field shows up
 * on the micro within a frame or two, and its live colour / motion follow.
 *
 * A public https page may reach http://127.0.0.1 only because the kiosk
 * Chromium carries the LocalNetworkAccessAllowedForUrls policy for this
 * origin. Off the tower (phones, laptops) nothing here ever runs: callers
 * gate on kiosk mode, and every failure is silent.
 */
import type { CharId } from '../data/characters';
import type { Morphology } from './emotion';
import type { DyeState } from './fieldRender';

const BUS = 'http://127.0.0.1:8765';

/** everything the micro needs to redraw the spore — never the whisper text. */
export interface TowerSeed {
  id: string; charId: CharId; morphology: Morphology; intensity: number;
  secondaryLabel?: string; name: string; bornAt?: number;
}

export interface TowerInfo {
  bonds: number; stage: number; perm: boolean;
  dye: null | { from: string; progress: number; phase: 'exchanging' | 'holding' | 'fading' };
}

export type TowerMsg =
  /** a spore is on the bench — sent on select and ~1.4×/s while it stays */
  | { t: 'obs'; seed: TowerSeed; info: TowerInfo; at: number }
  /** its live state, ~8×/s: current colour exchange, blink, motion */
  | { t: 'frame'; id: string; dye: DyeState | null; blink: boolean;
      vx: number; vy: number; drag: boolean; pet: boolean; at: number }
  /** released: the micro goes back to the newest resident */
  | { t: 'rel'; at: number };

export function towerPublish(msg: TowerMsg): void {
  // text/plain keeps it a CORS "simple" request (no extra preflight)
  fetch(`${BUS}/pub`, {
    method: 'POST',
    headers: { 'content-type': 'text/plain' },
    body: JSON.stringify(msg),
    keepalive: true,
  }).catch(() => { /* relay down or not on the tower: ignore */ });
}

/** Subscribe to the bus. EventSource reconnects by itself (relay sends
 *  `retry: 1000`), so a relay restart heals without a page reload. */
export function towerSubscribe(onMsg: (m: TowerMsg) => void): () => void {
  let es: EventSource | null = null;
  try {
    es = new EventSource(`${BUS}/sub`);
    es.onmessage = (e) => {
      try { onMsg(JSON.parse(e.data) as TowerMsg); } catch { /* ignore junk */ }
    };
  } catch { /* EventSource unavailable */ }
  return () => es?.close();
}
