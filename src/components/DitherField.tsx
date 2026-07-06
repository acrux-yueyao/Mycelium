/**
 * DitherField — the full-bleed "Beautiful Worlds" ecology canvas.
 *
 * The ambient dithered backdrop (colour masses + spires + spray) is
 * expensive to draw, so it's rendered ONCE to an offscreen canvas and
 * blitted each frame. The accumulated colony creatures live on top and
 * are ALIVE: they run the original field physics (`stepField` — wander
 * drift, compatibility attraction / repulsion, soft walls, isolation
 * drift, damping) every frame, and their pupils gaze toward the nearest
 * neighbour. Datamosh is redrawn per frame at the new positions
 * (deterministic per creature, so streaks don't flicker).
 *
 * To keep hundreds of creatures smooth, only the most recent ANIMATE_CAP
 * drift; any overflow is baked into the static backdrop.
 */
import { useEffect, useRef } from 'react';
import {
  drawDitherField,
  drawMoshCreature,
  creatureSpec,
  type CreatureSeed,
} from '../core/fieldRender';
import type { MosaicSpec } from '../core/mosaic';
import { findNearestBody, type PhysBody } from '../core/field';
import { compatibility } from '../data/characters';
import { Rng, xmur3 } from '../core/seed';

export interface FieldCreature extends CreatureSeed {
  /** position as a fraction of the viewport (0..1). */
  x: number;
  y: number;
  /** pixel size per cell. */
  cell: number;
  name?: string;
  primaryLabel?: string;
  rationale?: string;
  bornAt?: number;
}

interface Props {
  creatures: FieldCreature[];
}

const ANIMATE_CAP = 140; // how many creatures run live physics

interface Body extends PhysBody {
  cell: number;
  spec: MosaicSpec;
}

// ---- colony flocking: gather into emotional communities ----
// Tuned so compatible creatures actively clump and drift together (a
// community), with only a small personal-space bubble; incompatible
// pairs keep a gentle distance. Distinct from the stage's stepField,
// which is repulsion-dominant and tuned for a few creatures.
const COH_R = 340;    // radius to look for community members
const COH_K = 0.048;  // pull toward the compatible-neighbour centroid
const ALIGN_K = 0.05; // move with the group
const SEP_R = 82;     // personal space — keeps individuals distinct in a group
const SEP_K = 1.15;
const NEG_R = 230;    // incompatible creatures keep this much distance
const NEG_K = 0.05;
const WANDER_K = 0.012;
const DAMP = 0.9;
const MAX_V = 1.15;
const WALL = 70, WALL_K = 0.045;

function seed01(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) { h ^= id.charCodeAt(i); h = Math.imul(h, 16777619); }
  return ((h >>> 0) % 10000) / 10000;
}

function stepColony(bodies: Body[], W: number, H: number, now: number) {
  for (const a of bodies) {
    let sumX = 0, sumY = 0, cohW = 0, alignX = 0, alignY = 0, sepX = 0, sepY = 0;
    for (const b of bodies) {
      if (b === a) continue;
      const dx = b.x - a.x, dy = b.y - a.y;
      const d = Math.hypot(dx, dy) || 1;
      if (d < SEP_R) {
        const f = SEP_K * (1 - d / SEP_R);
        sepX -= (dx / d) * f; sepY -= (dy / d) * f;
      }
      if (d < COH_R) {
        const compat = compatibility(a.charId, b.charId);
        if (compat > 0) {
          sumX += b.x * compat; sumY += b.y * compat; cohW += compat;
          alignX += b.vx; alignY += b.vy;
        } else if (d < NEG_R) {
          const f = NEG_K * (1 - d / NEG_R) * -compat;
          sepX -= (dx / d) * f; sepY -= (dy / d) * f;
        }
      }
    }
    let fx = sepX, fy = sepY;
    if (cohW > 0) {
      const cx = sumX / cohW, cy = sumY / cohW;
      const ddx = cx - a.x, ddy = cy - a.y, dd = Math.hypot(ddx, ddy) || 1;
      fx += (ddx / dd) * COH_K * Math.min(1, dd / 160);
      fy += (ddy / dd) * COH_K * Math.min(1, dd / 160);
      fx += (alignX / cohW) * ALIGN_K * 0.02;
      fy += (alignY / cohW) * ALIGN_K * 0.02;
    }
    // gentle wander so groups keep milling
    const s = seed01(a.id);
    const ang = Math.sin(now * 0.00028 + s * 8) * 2.4 + Math.sin(now * 0.00015 + s * 13) * 3;
    fx += Math.cos(ang) * WANDER_K; fy += Math.sin(ang) * WANDER_K;
    // soft walls
    if (a.x < WALL) fx += (WALL - a.x) * WALL_K; else if (a.x > W - WALL) fx -= (a.x - (W - WALL)) * WALL_K;
    if (a.y < WALL) fy += (WALL - a.y) * WALL_K; else if (a.y > H - WALL) fy -= (a.y - (H - WALL)) * WALL_K;

    a.vx = (a.vx + fx) * DAMP; a.vy = (a.vy + fy) * DAMP;
    const sp = Math.hypot(a.vx, a.vy);
    if (sp > MAX_V) { a.vx = (a.vx / sp) * MAX_V; a.vy = (a.vy / sp) * MAX_V; }
    a.x = Math.max(16, Math.min(W - 16, a.x + a.vx));
    a.y = Math.max(16, Math.min(H - 16, a.y + a.vy));
  }
}

export function DitherField({ creatures }: Props) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const creaturesRef = useRef(creatures);
  creaturesRef.current = creatures;

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let W = 0, H = 0, dpr = 1;
    let backdrop: HTMLCanvasElement | null = null;
    let bodies: Body[] = [];
    let raf = 0;
    const specCache = new Map<string, MosaicSpec>();

    const specOf = (c: FieldCreature) => {
      let s = specCache.get(c.id);
      if (!s) { s = creatureSpec(c); specCache.set(c.id, s); }
      return s;
    };

    const rebuild = () => {
      W = window.innerWidth; H = window.innerHeight;
      dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = W * dpr; canvas.height = H * dpr;
      canvas.style.width = W + 'px'; canvas.style.height = H + 'px';

      const list = creaturesRef.current;
      const animated = list.slice(0, ANIMATE_CAP);
      const overflow = list.slice(ANIMATE_CAP);

      // static backdrop: dithered ecology + overflow creatures, drawn once
      backdrop = document.createElement('canvas');
      backdrop.width = W * dpr; backdrop.height = H * dpr;
      const bg = backdrop.getContext('2d')!;
      bg.scale(dpr, dpr);
      drawDitherField(bg, W, H);
      for (const c of overflow) {
        const spec = specOf(c);
        const gz = (new Rng(xmur3(c.id + ':rest')()).next() < 0.5 ? -1 : 1) * 0.85;
        drawMoshCreature(bg, spec, c.x * W - (spec.cols * c.cell) / 2, c.y * H - (spec.rows * c.cell) / 2, c.cell, c.id, gz);
      }

      // animated bodies with px positions + a gentle initial velocity
      bodies = animated.map((c) => {
        const r = new Rng(xmur3(c.id + ':vel')());
        const a = r.next() * Math.PI * 2;
        return {
          id: c.id, charId: c.charId,
          x: c.x * W, y: c.y * H,
          vx: Math.cos(a) * 0.3, vy: Math.sin(a) * 0.3,
          bornAt: c.bornAt ?? 0,
          cell: c.cell, spec: specOf(c),
        };
      });
    };

    const frame = () => {
      const now = performance.now();
      stepColony(bodies, W, H, now);

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      if (backdrop) ctx.drawImage(backdrop, 0, 0, W, H);

      for (const b of bodies) {
        const t = findNearestBody(b, bodies, 420);
        const gz = t ? Math.max(-1, Math.min(1, (t.x - b.x) / 14 > 0 ? 0.85 : -0.85)) : 0.85;
        const ww = b.spec.cols * b.cell, hh = b.spec.rows * b.cell;
        drawMoshCreature(ctx, b.spec, b.x - ww / 2, b.y - hh / 2, b.cell, b.id, gz);
      }
      raf = requestAnimationFrame(frame);
    };

    rebuild();
    frame();
    const onResize = () => { cancelAnimationFrame(raf); rebuild(); frame(); };
    window.addEventListener('resize', onResize);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', onResize); };
  }, [creatures]);

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
