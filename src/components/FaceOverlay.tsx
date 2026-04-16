/**
 * FaceOverlay — replaces the PNG's baked eye dots with a programmatic
 * face so eyes can gaze, blink, wink, squint, and smile.
 *
 * Layer stack (bottom → top):
 *   1. Skin patches  — permanent skin-color ellipses that occlude the
 *      baked-in eye dots of the PNG.
 *   2. Pupils        — black dots placed at the baked eye positions,
 *      translated by (gazeX, gazeY) via motion values (spring), and
 *      scaleY-animated for blink / wink / squint.
 *   3. Smile arcs    — black upper-half-circles shown only during the
 *      'happy' expression.
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
  const lidR = face.eyeSize;
  const pupilR = face.eyeSize * 0.72;

  // Spring-driven gaze, decoupled from blink animations.
  const gxMv = useMotionValue(0);
  const gyMv = useMotionValue(0);

  useEffect(() => {
    animate(gxMv, gazeX, { type: 'spring', stiffness: 90, damping: 18, mass: 1 });
    animate(gyMv, gazeY, { type: 'spring', stiffness: 90, damping: 18, mass: 1 });
  }, [gazeX, gazeY, gxMv, gyMv]);

  const skinPatch = (cxFrac: number): React.CSSProperties => ({
    position: 'absolute',
    left: `${(cxFrac - lidR) * 100}%`,
    top: `${(face.eyeY - lidR) * 100}%`,
    width: `${lidR * 2 * 100}%`,
    height: `${lidR * 2 * 100}%`,
    background: face.skinColor,
    borderRadius: '50%',
    pointerEvents: 'none',
  });

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

  const arcW = face.eyeSize * 2.6;
  const arcH = face.eyeSize * 1.5;
  const arcStyle = (cxFrac: number): React.CSSProperties => ({
    position: 'absolute',
    left: `${(cxFrac - arcW / 2) * 100}%`,
    top: `${(face.eyeY - arcH / 2) * 100}%`,
    width: `${arcW * 100}%`,
    height: `${arcH * 100}%`,
    background: PUPIL_COLOR,
    borderRadius: '50% 50% 0 0',
    pointerEvents: 'none',
    transformOrigin: 'center bottom',
  });

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
      <div style={skinPatch(face.eyeLeftX)} />
      <div style={skinPatch(face.eyeRightX)} />

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

      {kind === 'happy' && (
        <>
          <motion.div
            key={`arcL-${triggerKey}`}
            style={arcStyle(face.eyeLeftX)}
            initial={{ scaleY: 0, opacity: 0 }}
            animate={{ scaleY: [0, 1, 1, 0], opacity: [0, 1, 1, 0] }}
            transition={{ duration: 1.4, times: [0, 0.2, 0.82, 1], ease: 'easeOut' }}
          />
          <motion.div
            key={`arcR-${triggerKey}`}
            style={arcStyle(face.eyeRightX)}
            initial={{ scaleY: 0, opacity: 0 }}
            animate={{ scaleY: [0, 1, 1, 0], opacity: [0, 1, 1, 0] }}
            transition={{ duration: 1.4, times: [0, 0.2, 0.82, 1], ease: 'easeOut' }}
          />
        </>
      )}
    </div>
  );
}
