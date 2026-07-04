/**
 * PixelSprite — renders a MosaicSpec onto a single <canvas>.
 *
 * One canvas per creature (not a grid of DOM nodes): the mushroom is
 * ~150 static cells, so painting it to a canvas keeps each creature a
 * single DOM node. All the motion (float / wobble / breathe / greet /
 * grow / morph) lives on the parent motion.divs in Entity.tsx as CSS
 * transforms — the canvas rides along for free without repainting.
 *
 * The pupil is a self-contained animation: `gaze` is a DISCRETE target
 * (-1 = left cell, +1 = right cell); the black pupil dwells fully inside
 * one cell and, when the target flips, slides across quickly (a short
 * eased tween on an internal rAF, so it animates even in views that
 * don't re-render every frame, like the Gallery).
 *
 * The canvas otherwise repaints only when:
 *   - the spec changes (new creature)
 *   - a dye is in progress (infection → hybrid, per-cell recolor)
 *   - an infecting tint pulse is active
 *   - a blink toggles
 */
import { useEffect, useRef } from 'react';
import {
  CELL_PX,
  dyedCellColor,
  type MosaicSpec,
  type MosaicPaletteSpec,
} from '../core/mosaic';

export interface DyeState {
  progress: number;
  targetPalette: MosaicPaletteSpec;
  dirX?: number;
  dirY?: number;
}

export interface TintPulse {
  color: string;
  alpha: number;
}

export interface PixelSpriteProps {
  spec: MosaicSpec;
  /** DISCRETE pupil target: -1 = left cell, +1 = right cell. */
  gaze?: number;
  /** true → eyes shut for a blink frame. */
  blink?: boolean;
  dye?: DyeState | null;
  tintPulse?: TintPulse | null;
}

const PUPIL_SLIDE_MS = 150; // quick flick between the two eye cells

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
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

function dyeThreshold(
  spec: MosaicSpec,
  cell: { col: number; row: number; dyeBase: number },
  dye: DyeState,
): number {
  if (dye.dirX == null || dye.dirY == null) return cell.dyeBase;
  const nx = (cell.col - spec.center) / (spec.cols || 1);
  const ny = (cell.row - spec.rows / 2) / (spec.rows || 1);
  const proj = 0.5 + (nx * dye.dirX + ny * dye.dirY);
  const clamped = Math.max(0, Math.min(1, proj));
  return 0.7 * clamped + 0.3 * cell.dyeBase;
}

export function PixelSprite({ spec, gaze = 0, blink = false, dye = null, tintPulse = null }: PixelSpriteProps) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  // latest visual props, read inside the pupil-animation rAF
  const propsRef = useRef({ spec, blink, dye, tintPulse });
  propsRef.current = { spec, blink, dye, tintPulse };
  // displayed pupil position (-1..1) + slide-animation bookkeeping
  const pupilRef = useRef(gaze);
  const targetRef = useRef(gaze);
  const animRef = useRef<{ raf: number; t0: number; from: number }>({ raf: 0, t0: 0, from: gaze });

  // paint the whole sprite at a given pupil position
  const paint = (pupil: number) => {
    const canvas = ref.current;
    if (!canvas) return;
    const { spec: s, blink: bl, dye: dy, tintPulse: tp } = propsRef.current;
    const w = s.cols * CELL_PX;
    const h = s.rows * CELL_PX;
    if (canvas.width !== w) canvas.width = w;
    if (canvas.height !== h) canvas.height = h;
    const g = canvas.getContext('2d');
    if (!g) return;
    g.imageSmoothingEnabled = false;
    g.clearRect(0, 0, w, h);

    // body cells (optionally dyed toward target palette)
    for (let i = 0; i < s.cells.length; i++) {
      const cell = s.cells[i];
      let color = cell.color;
      if (dy && dy.progress > 0) {
        const thr = dyeThreshold(s, cell, dy);
        if (dy.progress >= thr) {
          color = dyedCellColor(s, cell, dy.targetPalette);
        } else if (dy.progress >= thr - 0.14) {
          color = mixHsl(cell.color, dyedCellColor(s, cell, dy.targetPalette), (dy.progress - (thr - 0.14)) / 0.14);
        }
      }
      g.globalAlpha = cell.alpha;
      g.fillStyle = color;
      g.fillRect(cell.col * CELL_PX, cell.row * CELL_PX, CELL_PX, CELL_PX);
    }
    g.globalAlpha = 1;

    // infecting tint pulse — soft-light partner color clipped to the body cells
    if (tp && tp.alpha > 0.01) {
      g.save();
      g.globalCompositeOperation = 'soft-light';
      g.globalAlpha = tp.alpha;
      g.fillStyle = tp.color;
      for (let i = 0; i < s.cells.length; i++) {
        const cell = s.cells[i];
        g.fillRect(cell.col * CELL_PX, cell.row * CELL_PX, CELL_PX, CELL_PX);
      }
      g.restore();
    }

    // eyes: two 2-cell eyes; the black pupil dwells in one cell and
    // slides across on a flick. `pupil` ∈ [-1,1] maps to sub-cell x.
    const y = s.eyes.row * CELL_PX;
    const gz = Math.max(-1, Math.min(1, pupil));
    const drawEye = (col0: number) => {
      const x = col0 * CELL_PX;
      g.fillStyle = '#fbfbf7';
      g.fillRect(x, y, CELL_PX * 2, CELL_PX);
      if (bl) {
        // closed: a dark lid line across both white cells
        g.fillStyle = '#211d1a';
        g.fillRect(x, y + CELL_PX * 0.40, CELL_PX * 2, CELL_PX * 0.28);
      } else {
        const px = x + (gz * 0.5 + 0.5) * CELL_PX;
        g.fillStyle = '#211d1a';
        g.fillRect(px, y, CELL_PX, CELL_PX);
      }
    };
    drawEye(s.eyes.L0);
    drawEye(s.eyes.R0);
  };

  // pupil slide animation: when the discrete target flips, ease the
  // displayed pupil across quickly, then rest fully inside the cell.
  useEffect(() => {
    if (gaze === targetRef.current) return;
    targetRef.current = gaze;
    animRef.current.from = pupilRef.current;
    animRef.current.t0 = 0;
    cancelAnimationFrame(animRef.current.raf);
    const step = (ts: number) => {
      const a = animRef.current;
      if (a.t0 === 0) a.t0 = ts;
      const k = Math.min(1, (ts - a.t0) / PUPIL_SLIDE_MS);
      pupilRef.current = a.from + (targetRef.current - a.from) * easeOutCubic(k);
      paint(pupilRef.current);
      if (k < 1) a.raf = requestAnimationFrame(step);
    };
    animRef.current.raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(animRef.current.raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gaze]);

  // repaint on visual changes (spec / dye / tint / blink), keeping the
  // current pupil position.
  useEffect(() => {
    paint(pupilRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spec, blink, dye, dye?.progress, tintPulse, tintPulse?.alpha]);

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
