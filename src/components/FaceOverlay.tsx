/**
 * FaceOverlay — programmatic eyes + tiny smile mouth drawn on top of
 * an eye-less "clean" sprite. No skin patches: the bases have no
 * baked features to occlude.
 *
 * Layer stack (bottom → top):
 *   1. Pupils     — round dots translated by (gazeX, gazeY) via spring
 *                   motion values, scaleY-animated for blink / wink /
 *                   squint / happy.
 *   2. Smile arc  — a small SVG curve below the eyes; slightly widens
 *                   on the 'happy' expression.
 */
import { useEffect } from 'react';
import { motion, useMotionValue, animate } from 'framer-motion';
import type { FaceConfig } from '../data/characters';

export type ExpressionKind =
  | 'blink'
  | 'wink-left'
  | 'wink-right'
  | 'squint'
  | 'happy';

export interface FaceOverlayProps {
  face: FaceConfig;
  triggerKey: number;
  kind: ExpressionKind;
  /** Pupil offset in CSS px (parent computes from gaze target) */
  gazeX?: number;
  gazeY?: number;
}

const PUPIL_COLOR = '#2a2521';

export function FaceOverlay({
  face,
  triggerKey,
  kind,
  gazeX = 0,
  gazeY = 0,
}: FaceOverlayProps) {
  const pupilR = face.eyeSize * 0.72;

  const gxMv = useMotionValue(0);
  const gyMv = useMotionValue(0);

  useEffect(() => {
    animate(gxMv, gazeX, { type: 'spring', stiffness: 90, damping: 18, mass: 1 });
    animate(gyMv, gazeY, { type: 'spring', stiffness: 90, damping: 18, mass: 1 });
  }, [gazeX, gazeY, gxMv, gyMv]);

  const pupilStyle = (cxFrac: number): React.CSSProperties => ({
    position: 'absolute',
    left: `${(cxFrac - pupilR) * 100}%`,
    top: `${(face.eyeY - pupilR) * 100}%`,
    width: `${pupilR * 2 * 100}%`,
    height: `${pupilR * 2 * 100}%`,
    background: PUPIL_COLOR,
    borderRadius: '50%',
    pointerEvents: 'none',
    transformOrigin: 'center center',
  });

  // Small smile: a short curved line centered between the eyes.
  // Width ≈ eye-spacing * 0.38 so it stays clearly smaller than the eyes.
  const mouthCenterX = (face.eyeLeftX + face.eyeRightX) / 2;
  const eyeSpread = face.eyeRightX - face.eyeLeftX;
  const mouthW = Math.max(face.eyeSize * 1.6, eyeSpread * 0.38);
  const mouthH = mouthW * 0.45;
  const mouthBoxStyle: React.CSSProperties = {
    position: 'absolute',
    left: `${(mouthCenterX - mouthW / 2) * 100}%`,
    top: `${(face.mouthY - mouthH / 2) * 100}%`,
    width: `${mouthW * 100}%`,
    height: `${mouthH * 100}%`,
    pointerEvents: 'none',
    transformOrigin: 'center center',
    overflow: 'visible',
  };

  const isLeftClosed =
    kind === 'blink' || kind === 'wink-left' || kind === 'squint' || kind === 'happy';
  const isRightClosed =
    kind === 'blink' || kind === 'wink-right' || kind === 'squint' || kind === 'happy';

  const pupilScaleYSeq = (close: boolean): number[] => {
    if (!close) return [1];
    if (kind === 'squint') return [1, 0.3, 0.3, 1];
    if (kind === 'happy') return [1, 0.08, 0.08, 1];
    return [1, 0.05, 1];
  };

  const timeline =
    kind === 'squint' ? [0, 0.3, 0.7, 1]
    : kind === 'happy' ? [0, 0.18, 0.82, 1]
    : [0, 0.4, 1];
  const duration =
    kind === 'squint' ? 0.8
    : kind === 'happy' ? 1.4
    : 0.16;

  return (
    <div aria-hidden style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      <motion.div
        key={`pupilL-${triggerKey}`}
        style={{ ...pupilStyle(face.eyeLeftX), x: gxMv, y: gyMv }}
        initial={{ scaleY: 1 }}
        animate={{ scaleY: pupilScaleYSeq(isLeftClosed) }}
        transition={{ duration, times: timeline, ease: 'easeInOut' }}
      />
      <motion.div
        key={`pupilR-${triggerKey}`}
        style={{ ...pupilStyle(face.eyeRightX), x: gxMv, y: gyMv }}
        initial={{ scaleY: 1 }}
        animate={{ scaleY: pupilScaleYSeq(isRightClosed) }}
        transition={{ duration, times: timeline, ease: 'easeInOut' }}
      />

      <motion.div
        key={`mouth-${triggerKey}`}
        style={mouthBoxStyle}
        initial={{ scaleX: 1, scaleY: 1 }}
        animate={
          kind === 'happy'
            ? { scaleX: [1, 1.25, 1.25, 1], scaleY: [1, 1.35, 1.35, 1] }
            : { scaleX: 1, scaleY: 1 }
        }
        transition={
          kind === 'happy'
            ? { duration: 1.4, times: [0, 0.2, 0.82, 1], ease: 'easeOut' }
            : { duration: 0.3, ease: 'easeOut' }
        }
      >
        <svg
          viewBox="0 0 20 10"
          preserveAspectRatio="none"
          style={{ width: '100%', height: '100%', display: 'block', overflow: 'visible' }}
        >
          <path
            d="M 2 2 Q 10 10 18 2"
            fill="none"
            stroke={PUPIL_COLOR}
            strokeWidth={1.8}
            strokeLinecap="round"
          />
        </svg>
      </motion.div>
    </div>
  );
}
