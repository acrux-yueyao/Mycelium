/**
 * FaceOverlay — animated expressions painted over a character's baked face.
 *
 * Layers:
 *  - Eyelids  : skin-colored ellipses that close over the baked eye dots
 *               (blink / wink-left / wink-right / squint)
 *  - Smile arcs (happy): black upper-half-circles placed on top of the
 *               closed eyelids, giving a ^^ kawaii smile-eye look.
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
  | 'squint'
  | 'happy';

export interface FaceOverlayProps {
  face: FaceConfig;
  triggerKey: number;
  kind: ExpressionKind;
}

export function FaceOverlay({ face, triggerKey, kind }: FaceOverlayProps) {
  // Eyelid size: slightly larger than the baked eye to fully occlude it.
  const lidW = face.eyeSize * 1.8;
  const lidH = face.eyeSize * 1.6;

  const makeLidStyle = (cxFrac: number): React.CSSProperties => ({
    position: 'absolute',
    left: `${(cxFrac - lidW / 2) * 100}%`,
    top: `${(face.eyeY - lidH / 2) * 100}%`,
    width: `${lidW * 100}%`,
    height: `${lidH * 100}%`,
    background: face.skinColor,
    borderRadius: '50%',
    pointerEvents: 'none',
    transformOrigin: 'center',
    willChange: 'transform',
  });

  // Smile arc: upper-half-circle (flat bottom) that looks like ^
  const arcW = face.eyeSize * 2.6;
  const arcH = face.eyeSize * 1.5;
  const makeArcStyle = (cxFrac: number): React.CSSProperties => ({
    position: 'absolute',
    left: `${(cxFrac - arcW / 2) * 100}%`,
    top: `${(face.eyeY - arcH / 2) * 100}%`,
    width: `${arcW * 100}%`,
    height: `${arcH * 100}%`,
    background: '#2a2521',
    borderRadius: '50% 50% 0 0',
    pointerEvents: 'none',
    transformOrigin: 'center bottom',
    willChange: 'transform',
  });

  const isLeftClosed =
    kind === 'blink' || kind === 'wink-left' || kind === 'squint' || kind === 'happy';
  const isRightClosed =
    kind === 'blink' || kind === 'wink-right' || kind === 'squint' || kind === 'happy';

  const eyelidSeq = (close: boolean): number[] => {
    if (!close) return [0];
    if (kind === 'squint') return [0, 0.6, 0.6, 0];
    if (kind === 'happy') return [0, 1, 1, 0];
    return [0, 1, 0];
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
        key={`L-${triggerKey}`}
        style={makeLidStyle(face.eyeLeftX)}
        initial={{ scaleY: 0 }}
        animate={{ scaleY: eyelidSeq(isLeftClosed) }}
        transition={{ duration, times: timeline, ease: 'easeInOut' }}
      />
      <motion.div
        key={`R-${triggerKey}`}
        style={makeLidStyle(face.eyeRightX)}
        initial={{ scaleY: 0 }}
        animate={{ scaleY: eyelidSeq(isRightClosed) }}
        transition={{ duration, times: timeline, ease: 'easeInOut' }}
      />

      {kind === 'happy' && (
        <>
          <motion.div
            key={`AL-${triggerKey}`}
            style={makeArcStyle(face.eyeLeftX)}
            initial={{ scaleY: 0, opacity: 0 }}
            animate={{ scaleY: [0, 1, 1, 0], opacity: [0, 1, 1, 0] }}
            transition={{ duration: 1.4, times: [0, 0.2, 0.82, 1], ease: 'easeOut' }}
          />
          <motion.div
            key={`AR-${triggerKey}`}
            style={makeArcStyle(face.eyeRightX)}
            initial={{ scaleY: 0, opacity: 0 }}
            animate={{ scaleY: [0, 1, 1, 0], opacity: [0, 1, 1, 0] }}
            transition={{ duration: 1.4, times: [0, 0.2, 0.82, 1], ease: 'easeOut' }}
          />
        </>
      )}
    </div>
  );
}
