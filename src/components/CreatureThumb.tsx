/**
 * CreatureThumb — renders a single creature to a small canvas, used by
 * the Archive grid and the Feedback specimen card. Deterministic; static.
 */
import { useEffect, useRef } from 'react';
import { creatureSpec, drawMoshCreature, type CreatureSeed } from '../core/fieldRender';
import { Rng, xmur3 } from '../core/seed';

interface Props {
  creature: CreatureSeed;
  /** pixel size per cell. */
  cell?: number;
  /** display height in px (width auto from aspect). */
  height?: number;
}

export function CreatureThumb({ creature, cell = 6, height = 120 }: Props) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const spec = creatureSpec(creature);
    const pad = 6; // cells of margin for streak tails
    const w = (spec.cols + pad) * cell;
    const h = (spec.rows + pad) * cell;
    const dpr = 2;
    cv.width = w * dpr; cv.height = h * dpr;
    const g = cv.getContext('2d');
    if (!g) return;
    g.scale(dpr, dpr);
    g.clearRect(0, 0, w, h);
    const gz = (new Rng(xmur3(creature.id + ':rest')()).next() < 0.5 ? -1 : 1) * 0.85;
    drawMoshCreature(g, spec, (pad / 2) * cell, (pad / 3) * cell, cell, creature.id, gz);
    const scale = height / h;
    cv.style.height = height + 'px';
    cv.style.width = w * scale + 'px';
  }, [creature, cell, height]);

  return <canvas ref={ref} style={{ imageRendering: 'pixelated', display: 'block' }} aria-hidden />;
}
