/**
 * DitherField — the full-bleed "Beautiful Worlds" ecology canvas.
 *
 * Paints the ambient dithered backdrop plus every accumulated creature
 * (the piled-up colony from all past whispers) as datamosh pixel-spores
 * on a single canvas. This is the page's visual material: it sits behind
 * everything on both the landing poster and the live field.
 *
 * Redraws only when the creature list or the viewport size changes —
 * the colony is otherwise static, so there's no per-frame cost.
 */
import { useEffect, useRef } from 'react';
import {
  drawDitherField,
  drawMoshCreature,
  creatureSpec,
  type CreatureSeed,
} from '../core/fieldRender';
import type { MosaicSpec } from '../core/mosaic';
import { Rng, xmur3 } from '../core/seed';

export interface FieldCreature extends CreatureSeed {
  /** position as a fraction of the viewport (0..1). */
  x: number;
  y: number;
  /** pixel size per cell. */
  cell: number;
  /** archive metadata (whispered creatures carry these; demo/legacy
   *  fall back to deterministic values). */
  name?: string;
  primaryLabel?: string;
  rationale?: string;
  bornAt?: number;
}

interface Props {
  creatures: FieldCreature[];
  /** dim the whole field (e.g. behind the landing poster copy). */
  opacity?: number;
}

export function DitherField({ creatures, opacity = 1 }: Props) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const specCache = useRef<Map<string, MosaicSpec>>(new Map());

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;

    const draw = () => {
      const w = window.innerWidth, h = window.innerHeight, dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = w * dpr; canvas.height = h * dpr;
      canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
      const g = canvas.getContext('2d');
      if (!g) return;
      g.scale(dpr, dpr);
      g.clearRect(0, 0, w, h);

      drawDitherField(g, w, h);

      for (const c of creatures) {
        let spec = specCache.current.get(c.id);
        if (!spec) { spec = creatureSpec(c); specCache.current.set(c.id, spec); }
        const ww = spec.cols * c.cell, hh = spec.rows * c.cell;
        // resting gaze from id so idle pupils read clean
        const gz = (new Rng(xmur3(c.id + ':rest')()).next() < 0.5 ? -1 : 1) * 0.85;
        drawMoshCreature(g, spec, c.x * w - ww / 2, c.y * h - hh / 2, c.cell, c.id, gz);
      }
    };

    draw();
    window.addEventListener('resize', draw);
    return () => window.removeEventListener('resize', draw);
  }, [creatures]);

  return (
    <canvas
      ref={ref}
      aria-hidden
      style={{
        position: 'fixed', inset: 0, width: '100%', height: '100%',
        imageRendering: 'pixelated', pointerEvents: 'none', zIndex: 0,
        opacity,
        transition: 'opacity 0.8s ease',
      }}
    />
  );
}
