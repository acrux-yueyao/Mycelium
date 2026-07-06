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

interface Props { creatures: FieldCreature[] }

const CAP = 150;
// movement — free & uncertain, gentle
const WANDER_K = 0.03, DAMP = 0.93, MAX_V = 1.3;
const SEP_R = 68, SEP_K = 0.95;
const WALL = 70, WALL_K = 0.045;
const CENTER_R = 220, CENTER_K = 0.05; // clear a hole for the input
// bonds — choose to meet, then leave
const CONNECT_R = 135, DISCONNECT_R = 205, BOND_REST = 96, BOND_K = 0.014;
const MAX_BONDS = 2;
// mother trees
const MOTHER_AGE = 40_000, ISOLATION_MS = 16_000, MOTHER_REACH = 380, SUPPORT_LIFE = 16_000;

interface Body {
  id: string; charId: CharId; x: number; y: number; vx: number; vy: number;
  bornAt: number; lastBondAt: number; cell: number; spec: MosaicSpec; name: string;
  // tile-swap dye toward a partner's palette during an encounter
  dyePal?: MosaicPaletteSpec | null; dyeStart?: number; dyeRelease?: number | null;
  dyeDirX?: number; dyeDirY?: number;
}
interface Bond { a: string; b: string; born: number; life: number; support: boolean }

const DYE_RAMP = 2200, DYE_MAX = 0.8, DYE_RELEASE = 1700;

function seed01(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) { h ^= id.charCodeAt(i); h = Math.imul(h, 16777619); }
  return ((h >>> 0) % 10000) / 10000;
}
function pairKey(a: string, b: string) { return a < b ? `${a}|${b}` : `${b}|${a}`; }

export function DitherField({ creatures }: Props) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const creaturesRef = useRef(creatures);
  creaturesRef.current = creatures;

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
          name: c.name ?? nameFor(c.id),
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

      // forces
      const cx = W / 2, cy = H * 0.5;
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
        // clear the centre for the input
        const ddx = a.x - cx, ddy = a.y - cy, dc = Math.hypot(ddx, ddy) || 1;
        if (dc < CENTER_R) { const p = (CENTER_R - dc) / CENTER_R * CENTER_K; fx += (ddx / dc) * p * CENTER_R * 0.12; fy += (ddy / dc) * p * CENTER_R * 0.12; }
        // walls
        if (a.x < WALL) fx += (WALL - a.x) * WALL_K; else if (a.x > W - WALL) fx -= (a.x - (W - WALL)) * WALL_K;
        if (a.y < WALL) fy += (WALL - a.y) * WALL_K; else if (a.y > H - WALL) fy -= (a.y - (H - WALL)) * WALL_K;

        a.vx = (a.vx + fx) * DAMP; a.vy = (a.vy + fy) * DAMP;
        const sp = Math.hypot(a.vx, a.vy);
        if (sp > MAX_V) { a.vx = (a.vx / sp) * MAX_V; a.vy = (a.vy / sp) * MAX_V; }
        a.x = Math.max(14, Math.min(W - 14, a.x + a.vx));
        a.y = Math.max(14, Math.min(H - 14, a.y + a.vy));
      }
    };

    const frame = () => {
      const now = performance.now();
      sync(now);
      step(now);

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      if (backdrop) ctx.drawImage(backdrop, 0, 0, W, H);

      // creatures — gaze toward their current bond partner if any; the
      // interaction shows as a tile-swap dye toward the partner's palette.
      const partnerOf = new Map<string, string>();
      for (const bd of bonds.values()) { partnerOf.set(bd.a, bd.b); partnerOf.set(bd.b, bd.a); }
      for (const a of bodies) {
        let gz = seed01(a.id) < 0.5 ? -0.85 : 0.85;
        const pid = partnerOf.get(a.id);
        const t = pid ? bodyById.get(pid) : null;
        if (t) gz = t.x > a.x ? 0.85 : -0.85;

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

        const ww = a.spec.cols * a.cell, hh = a.spec.rows * a.cell;
        drawMoshCreature(ctx, a.spec, a.x - ww / 2, a.y - hh / 2, a.cell, a.id, gz, dye);

        // resident name tag — small mono label beneath each creature, so
        // the whole colony reads as a catalogue of named library residents.
        const label = a.name.toLowerCase();
        ctx.font = '600 10px "JetBrains Mono", ui-monospace, monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        try { ctx.letterSpacing = '0.06em'; } catch { /* older browsers */ }
        const ly = a.y + hh / 2 + 5;
        ctx.fillStyle = 'rgba(16,16,16,0.34)';
        ctx.fillText(label, a.x + 0.6, ly + 0.6);   // faint drop for legibility
        ctx.fillStyle = 'rgba(16,16,16,0.7)';
        ctx.fillText(label, a.x, ly);
        try { ctx.letterSpacing = '0px'; } catch { /* noop */ }
      }
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      raf = requestAnimationFrame(frame);
    };

    buildBackdrop();
    frame();
    const onResize = () => { cancelAnimationFrame(raf); buildBackdrop(); frame(); };
    window.addEventListener('resize', onResize);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', onResize); };
  }, []);

  return (
    <canvas
      ref={ref}
      aria-hidden
      style={{
        position: 'fixed', inset: 0, width: '100%', height: '100%',
        imageRendering: 'pixelated', pointerEvents: 'none', zIndex: 0,
      }}
    />
  );
}
