/**
 * DitherField — the living "Beautiful Worlds" ecology canvas.
 *
 * A faint dithered backdrop (drawn once to an offscreen canvas) with the
 * whole accumulated colony living on top. Every creature is FREE: it
 * wanders its own uncertain path, occasionally drifts toward a compatible
 * neighbour and forms a temporary bond (drawn as a coloured "call" line),
 * then — after the bond runs its course — cools off and leaves. Creatures
 * that have been on stage a long time quietly become mother trees and
 * reach a warm support line to any creature that has been alone too long.
 * They all keep clear of the centre, where the input sits.
 *
 * New creatures (the visitor's own whispers) are synced in each frame and
 * join the colony without resetting anyone — so your creature meets the
 * residents.
 */
import { useEffect, useRef } from 'react';
import { drawDitherField, drawMoshCreature, agedSpec, growthStage, type CreatureSeed, type DyeState } from '../core/fieldRender';
import type { MosaicSpec, MosaicPaletteSpec } from '../core/mosaic';
import { compatibility, type CharId } from '../data/characters';
import { nameFor } from '../core/names';

export interface FieldCreature extends CreatureSeed {
  x: number; y: number; cell: number;
  name?: string; primaryLabel?: string; rationale?: string; bornAt?: number;
  /** the sentence the visitor whispered to grow this creature. */
  text?: string;
}

/** live snapshot of one spore, for the observation card. */
export interface ObserveInfo {
  id: string; name: string; charId: CharId;
  /** ms this spore has been on stage in this session. */
  presentMs: number;
  bonds: number; mine: boolean;
  /** deterministic growth stage (0 = newborn, up to 5). */
  stage: number;
  dye: null | { from: string; progress: number; phase: 'exchanging' | 'holding' | 'fading' };
  /** carries a permanent residual tint from a past long encounter. */
  perm: boolean;
}

interface Props {
  creatures: FieldCreature[];
  /** landing: the colony huddles together in the middle; field: it spreads
   *  as the input box shoves a clear hole through the centre. */
  clustered?: boolean;
  /** id of THIS visitor's own creature — highlighted so they can find it. */
  mineId?: string | null;
  /** observation mode: tap a spore to watch it up close. Controlled id +
   *  callback; clicks only register while `observable`. */
  observable?: boolean;
  observedId?: string | null;
  onObserve?: (info: ObserveInfo | null) => void;
  /** draw the white magnifier box for the observed spore (default on). The
   *  tower field turns it off — its close-up lives on the 7" micro screen. */
  magnifier?: boolean;
  /** ~8×/s live state of the observed spore (colour exchange, blink,
   *  motion, held / petted) — streamed to the tower's micro screen. */
  onObserveFrame?: (f: ObserveFrame) => void;
  /** keep the centre clear for the whisper input (field scene only). */
  centerHole?: boolean;
}

/** live per-frame state of the observed spore. */
export interface ObserveFrame {
  id: string; dye: DyeState | null; blink: boolean;
  vx: number; vy: number; drag: boolean; pet: boolean;
}

const CAP = 150;
// movement — free & uncertain, gentle
const WANDER_K = 0.03, DAMP = 0.93, MAX_V = 1.3;
const SEP_R = 68, SEP_K = 0.95;
const WALL = 70, WALL_K = 0.045;
const CENTER_R = 220, CENTER_K = 0.05; // clear a hole for the input
// landing: a soft central well — creatures wander freely inside HUDDLE_R and
// only get a gentle nudge back once they stray past it, so the colony loosely
// gathers in the middle instead of clumping into one suspicious knot.
const HUDDLE_R_FRAC = 0.26, HUDDLE_K = 0.006;
// bonds — choose to meet, then leave
const CONNECT_R = 135, DISCONNECT_R = 205, BOND_REST = 116, BOND_K = 0.014;
const MAX_BONDS = 2;
// mother trees
const MOTHER_AGE = 40_000, ISOLATION_MS = 16_000, MOTHER_REACH = 380, SUPPORT_LIFE = 16_000;
// how long the visitor's own creature stays visually flagged
const MINE_HIGHLIGHT_MS = 5 * 60_000;
// matter exchange — little mosaic tiles ferried between bonded partners
const MATTER_MIN = 900, MATTER_MAX = 1600, PACKET_CAP = 140;
// closed loop: how often to poll the live cultivation chamber's telemetry
const BIO_POLL_MS = 10_000;

interface Body {
  id: string; charId: CharId; x: number; y: number; vx: number; vy: number;
  bornAt: number; lastBondAt: number; cell: number; spec: MosaicSpec; name: string;
  appearAt: number; // when it first showed up on this client (for birth fx)
  blinkAt: number;  // wall-clock ms when the next blink starts
  // tile-swap dye toward a partner's palette during an encounter
  dyePal?: MosaicPaletteSpec | null; dyeStart?: number; dyeRelease?: number | null;
  dyeDirX?: number; dyeDirY?: number; dyeSeam?: string; dyeFrom?: string;
  // permanent residual tint left by a long past encounter (never released)
  permPal?: MosaicPaletteSpec | null; permProg?: number; permDX?: number; permDY?: number;
}
interface Bond { a: string; b: string; born: number; life: number; support: boolean; emitAt?: number; imprinted?: boolean }
// A mosaic tile in transit from one creature to its bond partner — reads
// as the two of them trading bits of substance.
interface Packet { toId: string; sx: number; sy: number; born: number; dur: number; color: string; size: number; perp: number }

// Colour exchange is slow and partial: it ramps in over ~14s and never
// covers more than ~45% of a creature, so everyone permanently keeps the
// palette they were born with. After parting, the borrowed tint HOLDS for
// ~20s before fading out over ~12s — an encounter stays visible on the
// body for a while instead of vanishing at once.
const DYE_RAMP = 14000, DYE_MAX = 0.45, DYE_HOLD = 20000, DYE_RELEASE = 12000;
// blink + idle gaze
const BLINK_MS = 130, BLINK_MIN = 2600, BLINK_VAR = 4600, GAZE_R = 260;
// permanent hybridisation — a long encounter leaves a small, permanent
// residual of the partner's palette from the contact side (outline unchanged),
// like being quietly changed by a relationship. Rare and subtle.
const HYBRID_MIN_MS = 7000, HYBRID_CHANCE = 0.4, PERM_PROG = 0.17;

function seed01(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) { h ^= id.charCodeAt(i); h = Math.imul(h, 16777619); }
  return ((h >>> 0) % 10000) / 10000;
}
function pairKey(a: string, b: string) { return a < b ? `${a}|${b}` : `${b}|${a}`; }
// Map one live-fungus telemetry frame to a 0..1 "activity" the colony breathes
// with. Prefer the mycelium biopotential (its swing tracks metabolic activity);
// fall back to how far chamber humidity sits above a ~70% resting point.
function bioActivity(f: { biopotential?: number | null; humidity?: number | null }): number {
  if (f.biopotential != null) return Math.max(0, Math.min(1, Math.abs(f.biopotential) / 50));
  if (f.humidity != null) return Math.max(0, Math.min(1, (f.humidity - 70) / 30));
  return 0;
}
// a creature's "signature" colour = its most saturated cell — used as the
// bold seam colour when a partner dyes it, so the exchange reads clearly.
function satOf(hsl: string): number { const m = hsl.match(/(\d+(?:\.\d+)?)%/); return m ? parseFloat(m[1]) : 0; }
function sigColor(b: Body): string {
  let best = '#888', bestSat = -1;
  for (const c of b.spec.cells) { const s = satOf(c.color); if (s > bestSat) { bestSat = s; best = c.color; } }
  return best;
}

export function DitherField({ creatures, clustered, mineId, observable, observedId, onObserve, magnifier, onObserveFrame, centerHole }: Props) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const creaturesRef = useRef(creatures);
  creaturesRef.current = creatures;
  const clusteredRef = useRef(!!clustered);
  clusteredRef.current = !!clustered;
  const mineRef = useRef<string | null>(mineId ?? null);
  mineRef.current = mineId ?? null;
  const observableRef = useRef(!!observable);
  observableRef.current = !!observable;
  const centerHoleRef = useRef(centerHole !== false);
  centerHoleRef.current = centerHole !== false;
  const observedRef = useRef<string | null>(observedId ?? null);
  observedRef.current = observedId ?? null;
  const onObserveRef = useRef(onObserve);
  onObserveRef.current = onObserve;
  const magnifierRef = useRef(magnifier !== false);
  magnifierRef.current = magnifier !== false;
  const onObserveFrameRef = useRef(onObserveFrame);
  onObserveFrameRef.current = onObserveFrame;
  // closed loop: latest telemetry from the physical cultivation chamber.
  // `live` stays false until a real frame arrives, so with no installation
  // connected the colony looks exactly as it does today (zero added motion).
  const bioRef = useRef({ activity: 0, live: false, bpm: 0 });

  // Poll /api/bio for the fungus's live state. Degrades silently when the
  // endpoint is absent / not configured — the colony just keeps its resting look.
  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = async () => {
      try {
        const res = await fetch('/api/bio');
        if (res.ok) {
          const data = await res.json();
          const f = data?.latest;
          if (f) {
            bioRef.current.activity = bioActivity(f);
            bioRef.current.live = true;
            // the heartbeat dock rides the visitor's live BPM in the co2 slot
            const bpm = typeof f.co2 === 'number' ? f.co2 : 0;
            bioRef.current.bpm = bpm > 30 && bpm < 220 ? bpm : 0;
          }
        }
      } catch { /* offline / not configured — keep the last value */ }
      if (alive) timer = setTimeout(poll, BIO_POLL_MS);
    };
    poll();
    return () => { alive = false; if (timer) clearTimeout(timer); };
  }, []);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let W = 0, H = 0, dpr = 1, raf = 0;
    let backdrop: HTMLCanvasElement | null = null;
    const bodies: Body[] = [];
    const known = new Set<string>();
    const bonds = new Map<string, Bond>();
    const cooldown = new Map<string, number>();
    const specCache = new Map<string, MosaicSpec>();
    const specOf = (c: FieldCreature) => {
      // cache per growth stage: a spore that has aged re-derives its spec
      const key = `${c.id}@${growthStage(c.bornAt)}`;
      let s = specCache.get(key); if (!s) { s = agedSpec(c, c.bornAt); specCache.set(key, s); } return s;
    };
    const bodyById = new Map<string, Body>();

    // pointer drag — pick a creature up, fling it on release
    let dragId: string | null = null;
    let dragX = 0, dragY = 0, dragPX = 0, dragPY = 0, dragPT = 0;
    // tap-to-observe: a short, still press selects; the same on empty space closes
    let pressX = 0, pressY = 0, pressT = 0, pressBody: string | null = null;
    // cursor presence — the colony notices the mouse: position, velocity,
    // and which creature is being hovered (for petting)
    let curX = -9999, curY = -9999, curVX = 0, curVY = 0, curMoveT = 0;
    let hoverId: string | null = null, hoverSince = 0;
    // little rising tiles emitted while a creature is petted
    let petFx: Array<{ x: number; y: number; born: number; color: string; drift: number }> = [];
    let petEmitAt = 0;
    // per-family temperament toward the cursor: + approaches, − shies away
    const TEMPER: Record<number, number> = { 0: 0.006, 1: -0.010, 2: 0.016, 3: 0.009, 4: 0.013, 5: -0.016 };
    // landing cursor parallax — the whole field leans toward the cursor
    let paraX = 0, paraY = 0, paraTX = 0, paraTY = 0;
    const PARA_AMP = 26;

    // matter exchange: mosaic tiles in flight between bond partners
    let packets: Packet[] = [];
    const emitPacket = (from: Body, to: Body, now: number, feed = false) => {
      const cells = from.spec.cells;
      const col = cells.length ? cells[(seed01(from.id + now) * cells.length) | 0].color : '#fff';
      // feed = a mother-tree nourishing an isolated creature: a slow, near-straight
      // one-directional stream (in the mother's own colours). otherwise a peer
      // exchange that bows to opposite sides.
      const dir = from.id < to.id ? 1 : -1;
      packets.push({
        toId: to.id, sx: from.x, sy: from.y, born: now,
        dur: feed ? 1500 : 950 + seed01(to.id + now) * 700,
        color: col, size: feed ? Math.max(6, from.cell * 1.5) : Math.max(5, from.cell * 1.35),
        perp: feed ? dir * 14 : dir * (40 + seed01(from.id + to.id + now) * 34),
      });
    };

    const buildBackdrop = () => {
      W = window.innerWidth; H = window.innerHeight;
      dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = W * dpr; canvas.height = H * dpr;
      canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
      backdrop = document.createElement('canvas');
      backdrop.width = W * dpr; backdrop.height = H * dpr;
      const bg = backdrop.getContext('2d')!;
      bg.scale(dpr, dpr);
      bg.globalAlpha = 0.5;           // fainter ecology backdrop
      drawDitherField(bg, W, H);
      bg.globalAlpha = 1;
    };

    const sync = (now: number) => {
      if (!W || !H) return; // not laid out yet: don't seed bodies at 0,0
      // fewer live creatures on a phone so the small canvas doesn't turn into
      // an unreadable pile (extras stay baked into the backdrop / off-stage).
      const small = window.innerWidth < 640;
      const cap = small ? 34 : CAP;
      for (const c of creaturesRef.current) {
        if (known.has(c.id) || bodies.length >= cap) continue;
        known.add(c.id);
        const a = seed01(c.id + 'v') * Math.PI * 2;
        const b: Body = {
          id: c.id, charId: c.charId,
          x: c.x * W, y: c.y * H, vx: Math.cos(a) * 0.3, vy: Math.sin(a) * 0.3,
          bornAt: c.bornAt ?? now, lastBondAt: now,
          cell: c.cell * (small ? 0.82 : 1), spec: specOf(c),
          name: c.name ?? nameFor(c.id), appearAt: now,
          blinkAt: now + BLINK_MIN + seed01(c.id + 'blink') * BLINK_VAR,
        };
        bodies.push(b); bodyById.set(b.id, b);
      }
    };

    const setDye = (target: Body, partner: Body, now: number) => {
      const dx = partner.x - target.x, dy = partner.y - target.y, d = Math.hypot(dx, dy) || 1;
      target.dyePal = partner.spec.palette;
      target.dyeStart = now; target.dyeRelease = null;
      target.dyeDirX = dx / d; target.dyeDirY = dy / d;
      target.dyeSeam = sigColor(partner);
      target.dyeFrom = partner.name;
    };

    // Freeze a small permanent tint of the partner's palette onto target,
    // from the contact side — the lasting mark of a long encounter.
    const imprint = (target: Body, partner: Body) => {
      const dx = partner.x - target.x, dy = partner.y - target.y, d = Math.hypot(dx, dy) || 1;
      target.permPal = partner.spec.palette;
      target.permProg = PERM_PROG;
      target.permDX = dx / d; target.permDY = dy / d;
    };

    // dye progress with the hold-then-fade release (shared by the field
    // draw, the magnifier, and the observation card).
    const dyeProgress = (a: Body, now: number):
      | { p: number; phase: 'exchanging' | 'holding' | 'fading' } | null => {
      if (!a.dyePal || a.dyeStart == null) return null;
      if (a.dyeRelease == null) {
        return { p: Math.min(DYE_MAX, (now - a.dyeStart) / DYE_RAMP), phase: 'exchanging' };
      }
      const atRelease = Math.min(DYE_MAX, (a.dyeRelease - a.dyeStart) / DYE_RAMP);
      const since = now - a.dyeRelease;
      if (since <= DYE_HOLD) return { p: atRelease, phase: 'holding' };
      return { p: atRelease * Math.max(0, 1 - (since - DYE_HOLD) / DYE_RELEASE), phase: 'fading' };
    };
    const dyeVisual = (a: Body, now: number) => {
      const dp = dyeProgress(a, now);
      if (dp) {
        if (dp.phase === 'fading' && dp.p <= 0.001) { a.dyePal = null; a.dyeRelease = null; }
        else if (a.dyePal && dp.p > 0) {
          return { palette: a.dyePal, progress: dp.p, dirX: a.dyeDirX ?? 0, dirY: a.dyeDirY ?? 0, seam: a.dyeSeam };
        }
      }
      // no active/releasing dye → the permanent residual tint, if any
      if (a.permPal && (a.permProg ?? 0) > 0) {
        return { palette: a.permPal, progress: a.permProg!, dirX: a.permDX ?? 0, dirY: a.permDY ?? 0 };
      }
      return null;
    };
    const bondCountOf = (id: string) => {
      let n = 0;
      for (const bd of bonds.values()) if (bd.a === id || bd.b === id) n++;
      return n;
    };
    const observeInfo = (b: Body, now: number): ObserveInfo => {
      const dp = dyeProgress(b, now);
      return {
        id: b.id, name: b.name, charId: b.charId,
        presentMs: now - b.appearAt,
        bonds: bondCountOf(b.id), mine: b.id === mineRef.current,
        stage: growthStage(b.bornAt),
        dye: dp && dp.p > 0.001 && b.dyePal
          ? { from: b.dyeFrom ?? '…', progress: dp.p, phase: dp.phase }
          : null,
        perm: !!(b.permPal && (b.permProg ?? 0) > 0),
      };
    };
    let lastObsEmit = 0, lastFrameEmit = 0, lastFrameX = 0, lastFrameY = 0;
    let lastFrameId: string | null = null;

    const step = (now: number) => {
      // active-bond count per body
      const bcount = new Map<string, number>();
      for (const bd of bonds.values()) {
        bcount.set(bd.a, (bcount.get(bd.a) ?? 0) + 1);
        bcount.set(bd.b, (bcount.get(bd.b) ?? 0) + 1);
      }
      // form / expire bonds
      for (const [k, bd] of bonds) {
        const A = bodyById.get(bd.a), B = bodyById.get(bd.b);
        if (!A || !B) { bonds.delete(k); continue; }
        const d = Math.hypot(A.x - B.x, A.y - B.y);
        // long, sustained encounter → one roll for a permanent mutual imprint
        if (!bd.imprinted && now - bd.born > HYBRID_MIN_MS && d < DISCONNECT_R) {
          bd.imprinted = true;
          if (seed01(k + 'hyb') < HYBRID_CHANCE) { imprint(A, B); imprint(B, A); }
        }
        if (now - bd.born > bd.life || d > DISCONNECT_R) {
          bonds.delete(k);
          cooldown.set(k, now + 7000 + seed01(k) * 5000);
          A.lastBondAt = now; B.lastBondAt = now;
        }
      }
      for (let i = 0; i < bodies.length; i++) {
        for (let j = i + 1; j < bodies.length; j++) {
          const A = bodies[i], B = bodies[j];
          const k = pairKey(A.id, B.id);
          if (bonds.has(k)) continue;
          if ((bcount.get(A.id) ?? 0) >= MAX_BONDS || (bcount.get(B.id) ?? 0) >= MAX_BONDS) continue;
          const cd = cooldown.get(k); if (cd != null && now < cd) continue;
          const d = Math.hypot(A.x - B.x, A.y - B.y);
          if (d >= CONNECT_R) continue;
          if (compatibility(A.charId, B.charId) <= 0) continue;
          bonds.set(k, { a: A.id, b: B.id, born: now, life: 8000 + seed01(k) * 8000, support: false });
          bcount.set(A.id, (bcount.get(A.id) ?? 0) + 1);
          bcount.set(B.id, (bcount.get(B.id) ?? 0) + 1);
          A.lastBondAt = now; B.lastBondAt = now;
          setDye(A, B, now); setDye(B, A, now); // exchange colour blocks
        }
      }
      // mother-tree support for the lonely (one reach per frame)
      const mothers = bodies.filter((b) => now - b.bornAt > MOTHER_AGE);
      if (mothers.length) {
        for (const lonely of bodies) {
          if ((bcount.get(lonely.id) ?? 0) > 0) continue;
          if (now - lonely.lastBondAt < ISOLATION_MS) continue;
          let m: Body | null = null, best = MOTHER_REACH;
          for (const mo of mothers) {
            if (mo.id === lonely.id) continue;
            const d = Math.hypot(mo.x - lonely.x, mo.y - lonely.y);
            if (d < best) { best = d; m = mo; }
          }
          if (!m) continue;
          const k = pairKey(lonely.id, m.id);
          if (bonds.has(k)) continue;
          bonds.set(k, { a: m.id, b: lonely.id, born: now, life: SUPPORT_LIFE, support: true });
          lonely.lastBondAt = now;
          setDye(lonely, m, now); // the lonely one takes on the mother's palette
          break;
        }
      }
      // creatures that have parted (no active bond) start releasing their
      // borrowed colour back toward themselves.
      const active = new Set<string>();
      for (const bd of bonds.values()) { active.add(bd.a); active.add(bd.b); }
      for (const b of bodies) {
        if (b.dyePal && b.dyeRelease == null && !active.has(b.id)) b.dyeRelease = now;
      }

      // matter exchange: bonded partners lob mosaic tiles back and forth
      for (const bd of bonds.values()) {
        const A = bodyById.get(bd.a), B = bodyById.get(bd.b);
        if (!A || !B) continue;
        if (bd.emitAt == null) { bd.emitAt = now + 250 + seed01(bd.a + bd.b) * 400; continue; }
        if (now < bd.emitAt) continue;
        bd.emitAt = now + MATTER_MIN + seed01(bd.b + now) * (MATTER_MAX - MATTER_MIN);
        if (packets.length < PACKET_CAP) {
          if (bd.support) emitPacket(A, B, now, true);          // mother (a) feeds the lonely (b): warm, one-way
          else { emitPacket(A, B, now); emitPacket(B, A, now); }
        }
      }

      // cursor presence: curious families drift toward a resting cursor,
      // shy ones ease away; a fast swipe startles everyone it passes.
      if (!dragId && curX > -9000) {
        const sp = Math.hypot(curVX, curVY);
        for (const a of bodies) {
          const dx = curX - a.x, dy = curY - a.y, d = Math.hypot(dx, dy) || 1;
          if (d < 260) {
            const t = TEMPER[a.charId] ?? 0;
            if (t) { const f = t * (1 - d / 260); a.vx += (dx / d) * f; a.vy += (dy / d) * f; }
          }
          if (sp > 18 && d < 96) {
            const f = Math.min(0.9, sp * 0.02) * (1 - d / 96);
            a.vx -= (dx / d) * f; a.vy -= (dy / d) * f;
          }
        }
      }

      // forces
      const smallW = W < 640;
      const huddle = clusteredRef.current;
      // phones: the landing huddle drops to the lower third and tightens,
      // so the colony gathers beneath the poster text instead of on it
      // phones: gather lower-right, denser — clear of the left-aligned poster
      const cx = huddle && smallW ? W * 0.62 : W / 2;
      const cy = huddle && smallW ? H * 0.80 : H * 0.5;
      const HUDDLE_R = Math.min(W, H) * (huddle && smallW ? 0.15 : HUDDLE_R_FRAC);
      const sepR = smallW ? 46 : SEP_R;
      // On a phone the fixed 220px input hole and 70px wall margins eat almost
      // the whole width, so scale them to the viewport (desktop keeps its values).
      const centerR = Math.min(CENTER_R, W * 0.30);
      const wall = Math.min(WALL, W * 0.06);
      for (const a of bodies) {
        let fx = 0, fy = 0;
        for (const b of bodies) {
          if (b === a) continue;
          const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1;
          if (d < sepR) { const f = SEP_K * (1 - d / sepR); fx -= (dx / d) * f; fy -= (dy / d) * f; }
        }
        // bond attraction: stay near a partner while the bond lasts
        for (const bd of bonds.values()) {
          const other = bd.a === a.id ? bodyById.get(bd.b) : bd.b === a.id ? bodyById.get(bd.a) : null;
          if (!other) continue;
          const dx = other.x - a.x, dy = other.y - a.y, d = Math.hypot(dx, dy) || 1;
          if (d > BOND_REST) { const f = BOND_K * (d - BOND_REST); fx += (dx / d) * f; fy += (dy / d) * f; }
        }
        // free wander
        const s = seed01(a.id);
        const ang = Math.sin(now * 0.00031 + s * 8) * 2.4 + Math.sin(now * 0.00017 + s * 13) * 3.2;
        fx += Math.cos(ang) * WANDER_K; fy += Math.sin(ang) * WANDER_K;
        const ddx = a.x - cx, ddy = a.y - cy, dc = Math.hypot(ddx, ddy) || 1;
        if (huddle) {
          // landing: free wander inside the well, gentle pull back only when
          // a creature drifts past HUDDLE_R — a loose gathering, not a knot.
          if (dc > HUDDLE_R) {
            const f = (dc - HUDDLE_R) * HUDDLE_K;
            fx -= (ddx / dc) * f;
            fy -= (ddy / dc) * f;
          }
        } else if (centerHoleRef.current && dc < centerR) {
          // field: the input box shoves a clear hole through the centre,
          // so anyone caught in the middle gets pushed outward.
          const p = (centerR - dc) / centerR * CENTER_K;
          fx += (ddx / dc) * p * centerR * 0.12;
          fy += (ddy / dc) * p * centerR * 0.12;
        }
        // walls
        if (a.x < wall) fx += (wall - a.x) * WALL_K; else if (a.x > W - wall) fx -= (a.x - (W - wall)) * WALL_K;
        if (a.y < wall) fy += (wall - a.y) * WALL_K; else if (a.y > H - wall) fy -= (a.y - (H - wall)) * WALL_K;

        a.vx = (a.vx + fx) * DAMP; a.vy = (a.vy + fy) * DAMP;
        const sp = Math.hypot(a.vx, a.vy);
        if (sp > MAX_V) { a.vx = (a.vx / sp) * MAX_V; a.vy = (a.vy / sp) * MAX_V; }
        a.x = Math.max(14, Math.min(W - 14, a.x + a.vx));
        a.y = Math.max(14, Math.min(H - 14, a.y + a.vy));
      }

      // drag override: the held creature tracks the cursor and inherits a
      // velocity from cursor motion, so releasing flings it with momentum.
      if (dragId) {
        const b = bodyById.get(dragId);
        if (b) {
          const dtMs = Math.max(1, now - dragPT);
          b.vx = ((dragX - dragPX) / dtMs) * 12;
          b.vy = ((dragY - dragPY) / dtMs) * 12;
          b.x = dragX; b.y = dragY;
          dragPX = dragX; dragPY = dragY; dragPT = now;
        } else {
          dragId = null;
        }
      }
    };

    const frame = () => {
      const now = performance.now();
      sync(now);
      step(now);

      // closed loop: the live fungus's activity gives the whole colony a faint
      // shared breath — nothing at rest, fuller when the culture is active.
      const bio = bioRef.current;
      const breath = bio.live ? 0.015 + 0.11 * bio.activity : 0;
      // with a visitor's pulse on the dock the whole field beats AT their
      // heart rate; otherwise a slow ambient breath
      const breathW = bio.bpm > 0 ? (bio.bpm / 60) * 0.006283 : 0.0045;

      // landing cursor parallax — ease toward the cursor; snaps off (eases
      // back to 0) in the field so drag hit-testing stays pixel-accurate.
      const ptx = clusteredRef.current ? paraTX : 0;
      const pty = clusteredRef.current ? paraTY : 0;
      paraX += (ptx - paraX) * 0.05;
      paraY += (pty - paraY) * 0.05;
      canvas.style.transform =
        Math.abs(paraX) > 0.05 || Math.abs(paraY) > 0.05 ? `translate(${paraX}px,${paraY}px)` : 'none';

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      // the ambient backdrop shows at full strength on the cover (landing),
      // and at half strength everywhere else so it reads as a faint ground.
      if (backdrop && backdrop.width > 0 && backdrop.height > 0) {
        ctx.globalAlpha = clusteredRef.current ? 1 : 0.5;
        ctx.drawImage(backdrop, 0, 0, W, H);
        ctx.globalAlpha = 1;
      }

      // creatures — gaze toward their current bond partner if any; the
      // interaction shows as a tile-swap dye toward the partner's palette.
      const partnerOf = new Map<string, string>();
      for (const bd of bonds.values()) { partnerOf.set(bd.a, bd.b); partnerOf.set(bd.b, bd.a); }
      // a mother tree becomes visible only while it's actually supporting an
      // isolated creature — the supporter (a) of each live support bond.
      const supporterIds = new Set<string>();
      for (const bd of bonds.values()) { if (bd.support) supporterIds.add(bd.a); }
      // tower kiosk (15.6 field) enlarges the spores overall for viewing distance
      const kioskZoom = document.body.classList.contains('kiosk-mode') ? 1.3 : 1;
      for (const a of bodies) {
        let gz = seed01(a.id) < 0.5 ? -0.85 : 0.85;
        const pid = partnerOf.get(a.id);
        const t = pid ? bodyById.get(pid) : null;
        if (t) {
          gz = t.x > a.x ? 0.85 : -0.85;
        } else {
          // idle: watch the cursor if it is near, else glance at the
          // nearest neighbour
          const dc = Math.hypot(curX - a.x, curY - a.y);
          if (curX > -9000 && dc < 240) {
            gz = curX > a.x ? 0.8 : -0.8;
          } else {
            let nn: Body | null = null, best = GAZE_R;
            for (const o of bodies) {
              if (o === a) continue;
              const d = Math.hypot(o.x - a.x, o.y - a.y);
              if (d < best) { best = d; nn = o; }
            }
            if (nn) gz = nn.x > a.x ? 0.7 : -0.7;
          }
        }

        // blink schedule — closed for BLINK_MS, then reschedule
        let blink = false;
        if (now >= a.blinkAt) {
          if (now < a.blinkAt + BLINK_MS) blink = true;
          else a.blinkAt = now + BLINK_MIN + seed01(a.id + (now | 0)) * BLINK_VAR;
        }

        // dye: ramp up while bonded, hold then fade after parting; falls
        // back to the permanent residual tint (shared helper).
        const dye = dyeVisual(a, now);

        const ww = a.spec.cols * a.cell, hh = a.spec.rows * a.cell;
        // your own creature is highlighted — but only for the first 5
        // minutes, after which it quietly blends into the colony.
        const mine = a.id === mineRef.current && now - a.appearAt < MINE_HIGHLIGHT_MS;
        const rBase = Math.max(ww, hh) / 2 + 10;

        // "this one is yours" marker — a birth burst when it first appears,
        // then a soft pulsing dashed ring so you can always pick it out.
        if (mine) {
          const age = now - a.appearAt;
          ctx.save();
          if (age < 6000) {
            const t = (age % 1300) / 1300;
            ctx.beginPath();
            ctx.arc(a.x, a.y, rBase + t * 42, 0, Math.PI * 2);
            ctx.strokeStyle = `rgba(91,79,208,${(1 - t) * 0.55})`;
            ctx.lineWidth = 2;
            ctx.stroke();
          }
          const pulse = 0.5 + 0.5 * Math.sin(now * 0.004);
          ctx.beginPath();
          ctx.arc(a.x, a.y, rBase, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(91,79,208,${0.32 + pulse * 0.34})`;
          ctx.lineWidth = 1.5;
          ctx.setLineDash([4, 4]);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.restore();
        }

        // mother tree (currently supporting an isolated creature): render a
        // little larger, with a gentle sway and the occasional flicker — a
        // quiet living "elder" presence rather than a glowing halo.
        const isMother = supporterIds.has(a.id);
        let dcell = a.cell * kioskZoom, sway = 0, mAlpha = 1;
        if (isMother) {
          const s = seed01(a.id);
          dcell = a.cell * 1.4;                                  // bigger
          const gust = Math.max(0, Math.sin(now * 0.0006 + s * 10)); // slow 0..1
          sway = Math.sin(now * 0.004 + s * 6) * (2 + gust * 7);     // occasional stronger sway
          if (Math.sin(now * 0.02 + s * 20) > 0.93) mAlpha = 0.78;   // occasional flicker
        }
        // synchronised breathing for a bonded pair — both beat together, so
        // they read as "a couple" rather than two creatures that overlap.
        if (pid) {
          const key = a.id < pid ? a.id + pid : pid + a.id;
          dcell *= 1 + 0.05 * Math.sin(now * 0.0045 + seed01(key) * 6.283);
        }
        // whole-colony breath driven by the live fungus (0 when disconnected)
        // near-common phase: the colony inhales together, with a faint
        // ripple across bodies so it reads as alive rather than mechanical
        if (breath > 0) dcell *= 1 + breath * Math.sin(now * breathW + seed01(a.id) * 0.9);
        // petting: a slow cursor resting on a creature makes it squint
        // contentedly, wiggle, and shed a few soft tiles
        const petted = !dragId && hoverId === a.id && now - hoverSince > 500 &&
          Math.hypot(curVX, curVY) < 6;
        if (petted) {
          dcell *= 1 + 0.05 * Math.sin(now * 0.018);
          blink = blink || (now % 1400) < 320;          // happy squint
          if (now > petEmitAt && petFx.length < 24) {
            petEmitAt = now + 160 + seed01(a.id + (now | 0)) * 160;
            const ww2 = a.spec.cols * dcell;
            petFx.push({
              x: a.x + (seed01(a.id + 'p' + (now | 0)) - 0.5) * ww2 * 0.9,
              y: a.y - (a.spec.rows * dcell) / 2,
              born: now, color: sigColor(a),
              drift: (seed01(a.id + 'd' + (now | 0)) - 0.5) * 14,
            });
          }
        }
        const dw = a.spec.cols * dcell, dh = a.spec.rows * dcell;
        const drawA = mAlpha * (clusteredRef.current && W < 640 ? 0.55 : 1);
        if (drawA < 1) ctx.globalAlpha = drawA;
        drawMoshCreature(ctx, a.spec, a.x + sway - dw / 2, a.y - dh / 2, dcell, a.id, gz, dye, blink);
        if (drawA < 1) ctx.globalAlpha = 1;

        // resident name tag — small mono label beneath each creature.
        // phones: tags only for your own / the observed spore (and none on
        // the landing huddle) — a full colony of labels reads as noise.
        const smallTag = W < 640;
        if (smallTag && (clusteredRef.current || !(mine || a.id === observedRef.current))) continue;
        const label = mine ? `${a.name.toLowerCase()} · you` : a.name.toLowerCase();
        ctx.font = `${mine ? '700' : '600'} 10px "JetBrains Mono", ui-monospace, monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        try { ctx.letterSpacing = '0.06em'; } catch { /* older browsers */ }
        const ly = a.y + dh / 2 + 5;
        const nightInk = document.body.classList.contains('kiosk-mode');
        ctx.fillStyle = nightInk ? 'rgba(0,0,0,0.5)' : 'rgba(16,16,16,0.34)';
        ctx.fillText(label, a.x + sway + 0.6, ly + 0.6);   // faint drop for legibility
        ctx.fillStyle = mine ? 'rgba(91,79,208,0.95)' : nightInk ? 'rgba(237,236,227,0.75)' : 'rgba(16,16,16,0.7)';
        ctx.fillText(label, a.x + sway, ly);
        try { ctx.letterSpacing = '0px'; } catch { /* noop */ }
      }
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';

      // matter packets — mosaic tiles in flight toward their target creature
      if (packets.length) {
        const keep: Packet[] = [];
        for (const p of packets) {
          const to = bodyById.get(p.toId);
          if (!to) continue;
          const t = (now - p.born) / p.dur;
          if (t >= 1) continue;                       // delivered
          const ease = t * t * (3 - 2 * t);
          const dx = to.x - p.sx, dy = to.y - p.sy, L = Math.hypot(dx, dy) || 1;
          const wob = Math.sin(t * Math.PI) * p.perp;
          const x = p.sx + dx * ease + (-dy / L) * wob;
          const y = p.sy + dy * ease + (dx / L) * wob;
          const fade = Math.min(1, Math.min(t, 1 - t) / 0.16);
          ctx.fillStyle = p.color;
          ctx.globalAlpha = 0.28 * fade;            // soft glow halo
          ctx.fillRect(x - p.size, y - p.size, p.size * 2, p.size * 2);
          ctx.globalAlpha = 0.45 * fade;            // trail behind it
          ctx.fillRect(x - p.size / 2 - (dx / L) * 4, y - p.size / 2 - (dy / L) * 4, p.size * 0.7, p.size * 0.7);
          ctx.globalAlpha = 0.95 * fade;            // the tile itself
          ctx.fillRect(x - p.size / 2, y - p.size / 2, p.size, p.size);
          keep.push(p);
        }
        ctx.globalAlpha = 1;
        packets = keep;
      }

      // pet tiles: tiny squares rising off a petted creature, then gone
      if (petFx.length) {
        const keep2: typeof petFx = [];
        for (const f of petFx) {
          const t = (now - f.born) / 900;
          if (t >= 1) continue;
          ctx.fillStyle = f.color;
          ctx.globalAlpha = 0.8 * (1 - t);
          const sz = 4 - t * 2;
          ctx.fillRect(f.x + f.drift * t - sz / 2, f.y - t * 26 - sz / 2, sz, sz);
          keep2.push(f);
        }
        ctx.globalAlpha = 1;
        petFx = keep2;
      }

      // === observation mode: one spore watched up close ===
      const obs = observedRef.current ? bodyById.get(observedRef.current) : null;
      if (obs) {
        // keep the card's numbers (dye %, phase, presence) ticking
        if (onObserveRef.current && now - lastObsEmit > 700) {
          lastObsEmit = now;
          onObserveRef.current(observeInfo(obs, now));
        }
        // dashed ring on the field body so you can see who is on the bench
        const rr = (Math.max(obs.spec.cols, obs.spec.rows) * obs.cell) / 2 + 12;
        ctx.save();
        ctx.beginPath();
        ctx.arc(obs.x, obs.y, rr, 0, Math.PI * 2);
        // the tower field is dark: a pale ring, or visitors can't see their pick
        const darkGround = document.body.classList.contains('kiosk-mode');
        ctx.strokeStyle = darkGround ? 'rgba(237,236,227,0.8)' : 'rgba(91,79,208,0.75)';
        ctx.lineWidth = darkGround ? 2 : 1.5;
        ctx.setLineDash([5, 4]);
        ctx.stroke();
        ctx.setLineDash([]);
        const mblink = now >= obs.blinkAt && now < obs.blinkAt + BLINK_MS;
        const dv = dyeVisual(obs, now);
        // live stream for the tower's micro screen (~8×/s)
        if (onObserveFrameRef.current && now - lastFrameEmit > 120) {
          // velocity from actual displacement (px per ~16ms frame): a held
          // spore moves with the pointer, not with its own vx
          const dtf = Math.max(16, now - lastFrameEmit);
          const same = lastFrameId === obs.id;
          const fvx = same ? ((obs.x - lastFrameX) / dtf) * 16 : 0;
          const fvy = same ? ((obs.y - lastFrameY) / dtf) * 16 : 0;
          lastFrameEmit = now; lastFrameId = obs.id; lastFrameX = obs.x; lastFrameY = obs.y;
          onObserveFrameRef.current({
            id: obs.id, dye: dv ?? null, blink: mblink,
            vx: Math.round(fvx * 100) / 100, vy: Math.round(fvy * 100) / 100,
            drag: dragId === obs.id,
            pet: !dragId && hoverId === obs.id && now - hoverSince > 500,
          });
        }
        // live magnifier: the same spore, big, with its current dye + blink
        if (magnifierRef.current) {
          const small = W < 640;
          const box = small ? Math.min(230, W - 48) : 230;
          const cxm = small ? W / 2 : W - 160;
          const cym = small ? box / 2 + 78 : 212;
          ctx.fillStyle = 'rgba(246,245,240,0.94)';
          ctx.strokeStyle = 'rgba(28,28,26,0.55)';
          ctx.lineWidth = 1;
          ctx.fillRect(cxm - box / 2, cym - box / 2, box, box);
          ctx.strokeRect(cxm - box / 2, cym - box / 2, box, box);
          const mk = Math.min(3.4, (box - 44) / (Math.max(obs.spec.cols, obs.spec.rows) * obs.cell));
          const mcell = obs.cell * mk;
          const mw = obs.spec.cols * mcell, mh = obs.spec.rows * mcell;
          drawMoshCreature(ctx, obs.spec, cxm - mw / 2, cym - mh / 2, mcell, obs.id, 0, dv, mblink);
        }
        ctx.restore();
      }

      raf = requestAnimationFrame(frame);
    };

    // === pointer drag ===
    // The canvas fills the viewport (fixed inset:0), so client coords map
    // straight to canvas space. On press we grab the nearest creature whose
    // sprite is under the cursor; while held it tracks the pointer.
    // touch fingers need a bigger target than a mouse cursor.
    const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
    const grabPad = coarse ? 30 : 12;
    const onDown = (e: PointerEvent) => {
      const x = e.clientX, y = e.clientY;
      let best: Body | null = null, bestD = Infinity;
      for (const b of bodies) {
        const ww = b.spec.cols * b.cell, hh = b.spec.rows * b.cell;
        const r = Math.max(ww, hh) / 2 + grabPad;
        const d = Math.hypot(b.x - x, b.y - y);
        if (d < r && d < bestD) { bestD = d; best = b; }
      }
      pressX = x; pressY = y; pressT = performance.now(); pressBody = best?.id ?? null;
      if (best) {
        dragId = best.id;
        dragX = dragPX = x; dragY = dragPY = y; dragPT = performance.now();
        canvas.style.cursor = 'grabbing';
        try { canvas.setPointerCapture(e.pointerId); } catch { /* not supported */ }
      }
    };
    const onMove = (e: PointerEvent) => {
      paraTX = (e.clientX / W - 0.5) * PARA_AMP;
      paraTY = (e.clientY / H - 0.5) * PARA_AMP;
      // cursor presence: position + smoothed velocity (px/frame-ish)
      const tNow = performance.now();
      const dt = Math.max(8, tNow - curMoveT);
      const nvx = ((e.clientX - curX) / dt) * 16, nvy = ((e.clientY - curY) / dt) * 16;
      if (curX > -9000) { curVX = curVX * 0.6 + nvx * 0.4; curVY = curVY * 0.6 + nvy * 0.4; }
      curX = e.clientX; curY = e.clientY; curMoveT = tNow;
      if (dragId) { dragX = e.clientX; dragY = e.clientY; return; }
      // hover affordance + pet target: which creature is under the cursor
      let over: string | null = null;
      for (const b of bodies) {
        const ww = b.spec.cols * b.cell, hh = b.spec.rows * b.cell;
        if (Math.hypot(b.x - e.clientX, b.y - e.clientY) < Math.max(ww, hh) / 2 + 12) { over = b.id; break; }
      }
      if (over !== hoverId) { hoverId = over; hoverSince = tNow; }
      canvas.style.cursor = over ? 'grab' : 'default';
    };
    const onUp = (e: PointerEvent) => {
      // a short, still press = observe; dragging & flinging is untouched
      if (observableRef.current && onObserveRef.current) {
        const moved = Math.hypot(e.clientX - pressX, e.clientY - pressY);
        if (performance.now() - pressT < 350 && moved < 8) {
          if (pressBody) {
            observedRef.current = pressBody;
            const b = bodyById.get(pressBody);
            if (b) onObserveRef.current(observeInfo(b, performance.now()));
          } else if (observedRef.current) {
            observedRef.current = null;
            onObserveRef.current(null);
          }
        }
      }
      pressBody = null;
      if (dragId) { dragId = null; canvas.style.cursor = 'grab'; }
    };
    canvas.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);

    // debug hook: expose live body positions so automated layout checks
    // can park the cursor on a creature (only under ?debug)
    if (new URLSearchParams(window.location.search).has('debug')) {
      (window as unknown as Record<string, unknown>).__fieldBodies =
        () => bodies.map((b) => ({ id: b.id, x: b.x, y: b.y, name: b.name }));
    }

    buildBackdrop();
    frame();
    const onResize = () => { cancelAnimationFrame(raf); buildBackdrop(); frame(); };
    window.addEventListener('resize', onResize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      canvas.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, []);

  return (
    <canvas
      ref={ref}
      className="dither-canvas"
      aria-hidden
      style={{
        position: 'fixed', inset: 0, width: '100%', height: '100%',
        imageRendering: 'pixelated', pointerEvents: 'auto', zIndex: 0,
        touchAction: 'none',
      }}
    />
  );
}
