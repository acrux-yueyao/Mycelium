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
import { stepField, findNearestBody, type PhysBody } from '../core/field';
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
      bodies = stepField(bodies, W, H, undefined, undefined, now) as Body[];

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
