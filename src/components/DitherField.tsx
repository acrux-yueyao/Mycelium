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
import { drawDitherField, drawMoshCreature, creatureSpec, type CreatureSeed } from '../core/fieldRender';
import type { MosaicSpec, MosaicPaletteSpec } from '../core/mosaic';
import { compatibility, type CharId } from '../data/characters';
import { nameFor } from '../core/names';

export interface FieldCreature extends CreatureSeed {
  x: number; y: number; cell: number;
  name?: string; primaryLabel?: string; rationale?: string; bornAt?: number;
  /** the sentence the visitor whispered to grow this creature. */
  text?: string;
}

interface Props {
  creatures: FieldCreature[];
  /** landing: the colony huddles together in the middle; field: it spreads
   *  as the input box shoves a clear hole through the centre. */
  clustered?: boolean;
  /** id of THIS visitor's own creature — highlighted so they can find it. */
  mineId?: string | null;
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
const CONNECT_R = 135, DISCONNECT_R = 205, BOND_REST = 96, BOND_K = 0.014;
const MAX_BONDS = 2;
// mother trees
const MOTHER_AGE = 40_000, ISOLATION_MS = 16_000, MOTHER_REACH = 380, SUPPORT_LIFE = 16_000;
// how long the visitor's own creature stays visually flagged
const MINE_HIGHLIGHT_MS = 5 * 60_000;
// matter exchange — little mosaic tiles ferried between bonded partners
const MATTER_MIN = 620, MATTER_MAX = 1150, PACKET_CAP = 140;

interface Body {
  id: string; charId: CharId; x: number; y: number; vx: number; vy: number;
  bornAt: number; lastBondAt: number; cell: number; spec: MosaicSpec; name: string;
  appearAt: number; // when it first showed up on this client (for birth fx)
  blinkAt: number;  // wall-clock ms when the next blink starts
  // tile-swap dye toward a partner's palette during an encounter
  dyePal?: MosaicPaletteSpec | null; dyeStart?: number; dyeRelease?: number | null;
  dyeDirX?: number; dyeDirY?: number;
  // permanent residual tint left by a long past encounter (never released)
  permPal?: MosaicPaletteSpec | null; permProg?: number; permDX?: number; permDY?: number;
}
interface Bond { a: string; b: string; born: number; life: number; support: boolean; emitAt?: number; imprinted?: boolean }
// A mosaic tile in transit from one creature to its bond partner — reads
// as the two of them trading bits of substance.
interface Packet { toId: string; sx: number; sy: number; born: number; dur: number; color: string; size: number; perp: number }

// Colour exchange is slow and partial: it ramps in over ~6s and never
// covers more than ~45% of a creature, so everyone permanently keeps the
// palette they were born with — an encounter tints them, never rewrites them.
const DYE_RAMP = 6000, DYE_MAX = 0.45, DYE_RELEASE = 3000;
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

export function DitherField({ creatures, clustered, mineId }: Props) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const creaturesRef = useRef(creatures);
  creaturesRef.current = creatures;
  const clusteredRef = useRef(!!clustered);
  clusteredRef.current = !!clustered;
  const mineRef = useRef<string | null>(mineId ?? null);
  mineRef.current = mineId ?? null;

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
      let s = specCache.get(c.id); if (!s) { s = creatureSpec(c); specCache.set(c.id, s); } return s;
    };
    const bodyById = new Map<string, Body>();

    // pointer drag — pick a creature up, fling it on release
    let dragId: string | null = null;
    let dragX = 0, dragY = 0, dragPX = 0, dragPY = 0, dragPT = 0;

    // matter exchange: mosaic tiles in flight between bond partners
    let packets: Packet[] = [];
    const emitPacket = (from: Body, to: Body, now: number) => {
      const cells = from.spec.cells;
      const col = cells.length ? cells[(seed01(from.id + now) * cells.length) | 0].color : '#fff';
      // the two directions bow to opposite sides, so a bonded pair reads as
      // a visible circulation of matter rather than tiles lost in the overlap
      const dir = from.id < to.id ? 1 : -1;
      packets.push({
        toId: to.id, sx: from.x, sy: from.y, born: now,
        dur: 950 + seed01(to.id + now) * 700,
        color: col, size: Math.max(5, from.cell * 1.35),
        perp: dir * (40 + seed01(from.id + to.id + now) * 34),
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
      for (const c of creaturesRef.current) {
        if (known.has(c.id) || bodies.length >= CAP) continue;
        known.add(c.id);
        const a = seed01(c.id + 'v') * Math.PI * 2;
        const b: Body = {
          id: c.id, charId: c.charId,
          x: c.x * W, y: c.y * H, vx: Math.cos(a) * 0.3, vy: Math.sin(a) * 0.3,
          bornAt: c.bornAt ?? now, lastBondAt: now, cell: c.cell, spec: specOf(c),
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
    };

    // Freeze a small permanent tint of the partner's palette onto target,
    // from the contact side — the lasting mark of a long encounter.
    const imprint = (target: Body, partner: Body) => {
      const dx = partner.x - target.x, dy = partner.y - target.y, d = Math.hypot(dx, dy) || 1;
      target.permPal = partner.spec.palette;
      target.permProg = PERM_PROG;
      target.permDX = dx / d; target.permDY = dy / d;
    };

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
          bonds.set(k, { a: A.id, b: B.id, born: now, life: 5000 + seed01(k) * 6000, support: false });
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
        if (packets.length < PACKET_CAP) { emitPacket(A, B, now); emitPacket(B, A, now); }
      }

      // forces
      const cx = W / 2, cy = H * 0.5;
      const huddle = clusteredRef.current;
      const HUDDLE_R = Math.min(W, H) * HUDDLE_R_FRAC;
      for (const a of bodies) {
        let fx = 0, fy = 0;
        for (const b of bodies) {
          if (b === a) continue;
          const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1;
          if (d < SEP_R) { const f = SEP_K * (1 - d / SEP_R); fx -= (dx / d) * f; fy -= (dy / d) * f; }
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
        } else if (dc < CENTER_R) {
          // field: the input box shoves a clear hole through the centre,
          // so anyone caught in the middle gets pushed outward.
          const p = (CENTER_R - dc) / CENTER_R * CENTER_K;
          fx += (ddx / dc) * p * CENTER_R * 0.12;
          fy += (ddy / dc) * p * CENTER_R * 0.12;
        }
        // walls
        if (a.x < WALL) fx += (WALL - a.x) * WALL_K; else if (a.x > W - WALL) fx -= (a.x - (W - WALL)) * WALL_K;
        if (a.y < WALL) fy += (WALL - a.y) * WALL_K; else if (a.y > H - WALL) fy -= (a.y - (H - WALL)) * WALL_K;

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

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      // the ambient backdrop shows at full strength on the cover (landing),
      // and at half strength everywhere else so it reads as a faint ground.
      if (backdrop) {
        ctx.globalAlpha = clusteredRef.current ? 1 : 0.5;
        ctx.drawImage(backdrop, 0, 0, W, H);
        ctx.globalAlpha = 1;
      }

      // creatures — gaze toward their current bond partner if any; the
      // interaction shows as a tile-swap dye toward the partner's palette.
      const partnerOf = new Map<string, string>();
      for (const bd of bonds.values()) { partnerOf.set(bd.a, bd.b); partnerOf.set(bd.b, bd.a); }
      for (const a of bodies) {
        let gz = seed01(a.id) < 0.5 ? -0.85 : 0.85;
        const pid = partnerOf.get(a.id);
        const t = pid ? bodyById.get(pid) : null;
        if (t) {
          gz = t.x > a.x ? 0.85 : -0.85;
        } else {
          // idle: glance toward the nearest neighbour if one is close
          let nn: Body | null = null, best = GAZE_R;
          for (const o of bodies) {
            if (o === a) continue;
            const d = Math.hypot(o.x - a.x, o.y - a.y);
            if (d < best) { best = d; nn = o; }
          }
          if (nn) gz = nn.x > a.x ? 0.7 : -0.7;
        }

        // blink schedule — closed for BLINK_MS, then reschedule
        let blink = false;
        if (now >= a.blinkAt) {
          if (now < a.blinkAt + BLINK_MS) blink = true;
          else a.blinkAt = now + BLINK_MIN + seed01(a.id + (now | 0)) * BLINK_VAR;
        }

        // dye progress: ramp up while bonded, fade back after parting
        let dye = null as null | { palette: MosaicPaletteSpec; progress: number; dirX: number; dirY: number };
        if (a.dyePal && a.dyeStart != null) {
          let p: number;
          if (a.dyeRelease == null) {
            p = Math.min(DYE_MAX, (now - a.dyeStart) / DYE_RAMP);
          } else {
            const atRelease = Math.min(DYE_MAX, (a.dyeRelease - a.dyeStart) / DYE_RAMP);
            p = atRelease * Math.max(0, 1 - (now - a.dyeRelease) / DYE_RELEASE);
            if (p <= 0.001) { a.dyePal = null; a.dyeRelease = null; }
          }
          if (a.dyePal && p > 0) dye = { palette: a.dyePal, progress: p, dirX: a.dyeDirX ?? 0, dirY: a.dyeDirY ?? 0 };
        }
        // no active/releasing dye → fall back to the permanent residual tint
        if (!dye && a.permPal && (a.permProg ?? 0) > 0) {
          dye = { palette: a.permPal, progress: a.permProg!, dirX: a.permDX ?? 0, dirY: a.permDY ?? 0 };
        }

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

        drawMoshCreature(ctx, a.spec, a.x - ww / 2, a.y - hh / 2, a.cell, a.id, gz, dye, blink);

        // resident name tag — small mono label beneath each creature, so
        // the whole colony reads as a catalogue of named library residents.
        const label = mine ? `${a.name.toLowerCase()} · you` : a.name.toLowerCase();
        ctx.font = `${mine ? '700' : '600'} 10px "JetBrains Mono", ui-monospace, monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        try { ctx.letterSpacing = '0.06em'; } catch { /* older browsers */ }
        const ly = a.y + hh / 2 + 5;
        ctx.fillStyle = 'rgba(16,16,16,0.34)';
        ctx.fillText(label, a.x + 0.6, ly + 0.6);   // faint drop for legibility
        ctx.fillStyle = mine ? 'rgba(91,79,208,0.95)' : 'rgba(16,16,16,0.7)';
        ctx.fillText(label, a.x, ly);
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

      raf = requestAnimationFrame(frame);
    };

    // === pointer drag ===
    // The canvas fills the viewport (fixed inset:0), so client coords map
    // straight to canvas space. On press we grab the nearest creature whose
    // sprite is under the cursor; while held it tracks the pointer.
    const onDown = (e: PointerEvent) => {
      const x = e.clientX, y = e.clientY;
      let best: Body | null = null, bestD = Infinity;
      for (const b of bodies) {
        const ww = b.spec.cols * b.cell, hh = b.spec.rows * b.cell;
        const r = Math.max(ww, hh) / 2 + 12;
        const d = Math.hypot(b.x - x, b.y - y);
        if (d < r && d < bestD) { bestD = d; best = b; }
      }
      if (best) {
        dragId = best.id;
        dragX = dragPX = x; dragY = dragPY = y; dragPT = performance.now();
        canvas.style.cursor = 'grabbing';
      }
    };
    const onMove = (e: PointerEvent) => {
      if (dragId) { dragX = e.clientX; dragY = e.clientY; return; }
      // hover affordance: cursor turns to a grab hand over a creature
      let over = false;
      for (const b of bodies) {
        const ww = b.spec.cols * b.cell, hh = b.spec.rows * b.cell;
        if (Math.hypot(b.x - e.clientX, b.y - e.clientY) < Math.max(ww, hh) / 2 + 12) { over = true; break; }
      }
      canvas.style.cursor = over ? 'grab' : 'default';
    };
    const onUp = () => { if (dragId) { dragId = null; canvas.style.cursor = 'grab'; } };
    canvas.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);

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
      aria-hidden
      style={{
        position: 'fixed', inset: 0, width: '100%', height: '100%',
        imageRendering: 'pixelated', pointerEvents: 'auto', zIndex: 0,
      }}
    />
  );
}
