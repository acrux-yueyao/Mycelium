/**
 * PixelSprite — renders a MosaicSpec onto a single <canvas>.
 *
 * One canvas per creature (not a grid of DOM nodes): the mushroom is
 * ~150 static cells, so painting it to a canvas keeps each creature a
 * single DOM node. All the motion (float / wobble / breathe / greet /
 * grow / morph) lives on the parent motion.divs in Entity.tsx as CSS
 * transforms — the canvas rides along for free without repainting.
 *
 * The canvas only repaints when:
 *   - the spec changes (new creature)
 *   - a dye is in progress (infection → hybrid, per-cell recolor)
 *   - an infecting tint pulse is active
 *   - the gaze target moves (pupil slides)
 *
 * Rendering is nearest-neighbour (imageRendering: pixelated) so cells
 * stay crisp; low-density creatures get a css blur from spec.blur.
 */
import { useEffect, useRef } from 'react';
import {
  CELL_PX,
  colorFromBand,
  dyedCellColor,
  type MosaicSpec,
  type MosaicPaletteSpec,
} from '../core/mosaic';

export interface DyeState {
  /** 0..1 progress of the dye wavefront. */
  progress: number;
  /** palette the creature is being dyed toward. */
  targetPalette: MosaicPaletteSpec;
  /** unit direction the dye sweeps from (toward partner); optional. */
  dirX?: number;
  dirY?: number;
}

export interface TintPulse {
  color: string;
  /** 0..1 overlay strength. */
  alpha: number;
}

export interface PixelSpriteProps {
  spec: MosaicSpec;
  /** -1..1 pupil offset; slides the black pupil cell across its 2-cell eye. */
  gaze?: number;
  /** true → eyes shut for a blink frame. */
  blink?: boolean;
  dye?: DyeState | null;
  tintPulse?: TintPulse | null;
}

function parseHsl(s: string): [number, number, number] {
  const m = s.match(/hsl\(([-\d.]+),([\d.]+)%,([\d.]+)%\)/);
  return m ? [parseFloat(m[1]), parseFloat(m[2]), parseFloat(m[3])] : [0, 0, 50];
}
function lerpHue(a: number, b: number, t: number): number {
  const d = ((b - a + 540) % 360) - 180;
  return a + d * t;
}
function mixHsl(a: string, b: string, t: number): string {
  const A = parseHsl(a);
  const B = parseHsl(b);
  const h = lerpHue(A[0], B[0], t);
  const s = A[1] + (B[1] - A[1]) * t;
  const l = A[2] + (B[2] - A[2]) * t;
  return `hsl(${((h % 360) + 360) % 360 | 0},${Math.round(s)}%,${Math.round(l)}%)`;
}

/** Per-cell dye threshold: base jitter, optionally biased by sweep dir. */
function dyeThreshold(spec: MosaicSpec, cell: { col: number; row: number; dyeBase: number }, dye: DyeState): number {
  if (dye.dirX == null || dye.dirY == null) return cell.dyeBase;
  // project the cell position (centered) onto the sweep direction, 0..1
  const nx = (cell.col - spec.center) / (spec.cols || 1);
  const ny = (cell.row - spec.rows / 2) / (spec.rows || 1);
  const proj = 0.5 + (nx * dye.dirX + ny * dye.dirY);
  const clamped = Math.max(0, Math.min(1, proj));
  return 0.7 * clamped + 0.3 * cell.dyeBase;
}

export function PixelSprite({ spec, gaze = 0, blink = false, dye = null, tintPulse = null }: PixelSpriteProps) {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const w = spec.cols * CELL_PX;
    const h = spec.rows * CELL_PX;
    if (canvas.width !== w) canvas.width = w;
    if (canvas.height !== h) canvas.height = h;
    const g = canvas.getContext('2d');
    if (!g) return;
    g.imageSmoothingEnabled = false;
    g.clearRect(0, 0, w, h);

    // body cells (optionally dyed toward target palette)
    for (let i = 0; i < spec.cells.length; i++) {
      const cell = spec.cells[i];
      let color = cell.color;
      if (dye && dye.progress > 0) {
        const thr = dyeThreshold(spec, cell, dye);
        if (dye.progress >= thr) {
          color = dyedCellColor(spec, cell, dye.targetPalette);
        } else if (dye.progress >= thr - 0.14) {
          color = mixHsl(cell.color, dyedCellColor(spec, cell, dye.targetPalette), (dye.progress - (thr - 0.14)) / 0.14);
        }
      }
      g.globalAlpha = cell.alpha;
      g.fillStyle = color;
      g.fillRect(cell.col * CELL_PX, cell.row * CELL_PX, CELL_PX, CELL_PX);
    }
    g.globalAlpha = 1;

    // infecting tint pulse — soft-light partner color clipped to the body cells
    if (tintPulse && tintPulse.alpha > 0.01) {
      g.save();
      g.globalCompositeOperation = 'soft-light';
      g.globalAlpha = tintPulse.alpha;
      g.fillStyle = tintPulse.color;
      for (let i = 0; i < spec.cells.length; i++) {
        const cell = spec.cells[i];
        g.fillRect(cell.col * CELL_PX, cell.row * CELL_PX, CELL_PX, CELL_PX);
      }
      g.restore();
    }

    // eyes: two 2-cell eyes, white pair + sliding black pupil cell
    const gz = Math.max(-1, Math.min(1, gaze));
    const y = spec.eyes.row * CELL_PX;
    const drawEye = (col0: number) => {
      const x = col0 * CELL_PX;
      g.fillStyle = '#fbfbf7';
      g.fillRect(x, y, CELL_PX * 2, CELL_PX);
      if (blink) {
        // closed: a dark lid line across both white cells
        g.fillStyle = '#211d1a';
        g.fillRect(x, y + CELL_PX * 0.42, CELL_PX * 2, CELL_PX * 0.22);
      } else {
        const px = x + (gz * 0.5 + 0.5) * CELL_PX;
        g.fillStyle = '#211d1a';
        g.fillRect(px, y, CELL_PX, CELL_PX);
      }
    };
    drawEye(spec.eyes.L0);
    drawEye(spec.eyes.R0);
  }, [spec, gaze, blink, dye, dye?.progress, tintPulse, tintPulse?.alpha]);

  return (
    <canvas
      ref={ref}
      aria-hidden
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        objectFit: 'contain',
        imageRendering: 'pixelated',
        filter: spec.blur > 0.05 ? `blur(${spec.blur.toFixed(2)}px)` : 'none',
        pointerEvents: 'none',
      }}
    />
  );
}

// re-export so Entity can build dye colors without importing mosaic twice
export { colorFromBand };
