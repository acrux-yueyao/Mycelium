/**
 * FaceOverlay — animated expressions painted over a character's baked face.
 *
 * Layers:
 *  - Eyelids: skin-colored ellipses at eye coords that flash closed for ~140ms
 *    during a blink, covering the PNG's baked eye dots.
 *
 * Triggers are controlled by the parent via keyed re-mounts (each new
 * `triggerKey` restarts the animation).
 */
import { motion } from 'framer-motion';
import type { FaceConfig } from '../data/characters';

export type ExpressionKind =
  | 'blink'
  | 'wink-left'
  | 'wink-right'
  | 'squint';

export interface FaceOverlayProps {
  face: FaceConfig;
  triggerKey: number;
  kind: ExpressionKind;
}

export function FaceOverlay({ face, triggerKey, kind }: FaceOverlayProps) {
  const padW = face.eyeSize * 1.8;
  const padH = face.eyeSize * 1.6;

  const leftStyle: React.CSSProperties = {
    position: 'absolute',
    left: `${(face.eyeLeftX - padW / 2) * 100}%`,
    top: `${(face.eyeY - padH / 2) * 100}%`,
    width: `${padW * 100}%`,
    height: `${padH * 100}%`,
    background: face.skinColor,
    borderRadius: '50%',
    pointerEvents: 'none',
    transformOrigin: 'center',
    willChange: 'transform',
  };
  const rightStyle: React.CSSProperties = {
    ...leftStyle,
    left: `${(face.eyeRightX - padW / 2) * 100}%`,
  };

  const shouldCloseLeft = kind === 'blink' || kind === 'wink-left' || kind === 'squint';
  const shouldCloseRight = kind === 'blink' || kind === 'wink-right' || kind === 'squint';

  const eyelidScaleSeq = (close: boolean): number[] => {
    if (!close) return [0];
    if (kind === 'squint') return [0, 0.6, 0.6, 0];
    return [0, 1, 0];
  };

  const times = kind === 'squint' ? [0, 0.3, 0.7, 1] : [0, 0.4, 1];
  const duration = kind === 'squint' ? 0.8 : 0.16;

  return (
    <div aria-hidden style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      <motion.div
        key={`L-${triggerKey}`}
        style={leftStyle}
        initial={{ scaleY: 0 }}
        animate={{ scaleY: eyelidScaleSeq(shouldCloseLeft) }}
        transition={{ duration, times, ease: 'easeInOut' }}
      />
      <motion.div
        key={`R-${triggerKey}`}
        style={rightStyle}
        initial={{ scaleY: 0 }}
        animate={{ scaleY: eyelidScaleSeq(shouldCloseRight) }}
        transition={{ duration, times, ease: 'easeInOut' }}
      />
    </div>
  );
}
