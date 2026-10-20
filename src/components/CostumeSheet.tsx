/**
 * CostumeSheet — preview of the Halloween costumes (`?costumes`).
 * Grid: 6 families × (plain + 4 costumes), drawn with the field's own
 * datamosh renderer. `?costumes=field` shows a field-like scatter where
 * only a couple of spores wear one, the easter-egg density.
 */
import { useEffect, useRef } from 'react';
import { buildMosaic } from '../core/mosaic';
import { drawMoshCreature, drawDitherField } from '../core/fieldRender';
import { COSTUMES, COSTUME_HEADROOM, drawCostume, type Costume } from '../core/halloween';
import type { CharId } from '../data/characters';

const FAMILY_HUE: Record<number, number> = { 0: 24, 1: 205, 2: 32, 3: 268, 4: 158, 5: 222 };
const FAMILY_NAME = ['tender', 'calm', 'curious', 'dreamy', 'companion', 'lonely'];
const LABEL: Record<Costume | 'plain', string> = {
  plain: 'plain', pumpkin: 'pumpkin helmet', witch: 'witch hat', ghost: 'ghost sheet', lantern: 'lantern eyes',
};

function spec(id: string, charId: number, k: number) {
  return buildMosaic({
    id, charId: charId as CharId, intensity: 0.45 + 0.08 * k,
    morphology: { density: 0.7, agitation: 0.3, tendrilCount: 5, glow: 0.15, tintHue: FAMILY_HUE[charId], particles: false },
  });
}

function Sheet() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current; if (!cv) return;
    const cell = 9, tile = 200, tileH = 250, head = COSTUME_HEADROOM * cell;
    const cols = ['plain', ...COSTUMES] as const;
    cv.width = 150 + cols.length * tile; cv.height = 60 + 6 * tileH;
    const g = cv.getContext('2d')!;
    g.fillStyle = '#F1F0EB'; g.fillRect(0, 0, cv.width, cv.height);
    g.font = '600 15px ui-monospace, monospace'; g.fillStyle = '#101010';
    cols.forEach((c, i) => g.fillText(LABEL[c], 150 + i * tile + 20, 36));
    for (let f = 0; f < 6; f++) {
      const y0 = 60 + f * tileH;
      g.fillStyle = '#6E6D64'; g.fillText(FAMILY_NAME[f], 20, y0 + tileH / 2);
      const s = spec(`hw-${f}`, f, f);
      cols.forEach((c, i) => {
        const x0 = 150 + i * tile + (tile - s.cols * cell) / 2;
        const yy = y0 + head - 20;
        drawMoshCreature(g, s, x0, yy, cell, `hw-${f}`, 0.3, null, false);
        if (c !== 'plain') drawCostume(g, s, x0, yy, cell, c);
      });
    }
  }, []);
  return <canvas ref={ref} style={{ display: 'block' }} />;
}

function FieldScatter() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current; if (!cv) return;
    cv.width = 1200; cv.height = 750;
    const g = cv.getContext('2d')!;
    drawDitherField(g, cv.width, cv.height, 'hw-field');
    const cell = 4;
    const pts: Array<[number, number]> = [];
    for (let i = 0; i < 34; i++) pts.push([90 + ((i * 337) % 1000), 120 + ((i * 211) % 560)]);
    pts.forEach(([x, y], i) => {
      const s = spec(`fs-${i}`, i % 6, i % 7);
      drawMoshCreature(g, s, x, y, cell, `fs-${i}`, 0, null, false);
      if (i === 7) drawCostume(g, s, x, y, cell, 'pumpkin');
      if (i === 22) drawCostume(g, s, x, y, cell, 'ghost');
    });
  }, []);
  return <canvas ref={ref} style={{ display: 'block' }} />;
}

export function CostumeSheet({ mode }: { mode: string | null }) {
  return mode === 'field' ? <FieldScatter /> : <Sheet />;
}
