/**
 * Entity — a living character on stage.
 *
 * Composed animation layers (nested motion.divs so transforms don't clash):
 *   1. Grow        scale 0 → 1.1 → 1 on mount (1.8s ease-out)
 *   2. Float       y [0, -5, 0] infinite (5s)
 *   3. Wobble      rotate ±1.5° infinite (8s)
 *   4. Greet       scale bounce on greetingPulse++
 *   5. Breathe     scale [1, 1.04, 1] infinite (3.5s)
 *
 * Saturation filter (Phase C): CSS `saturate(...)` applied to the img
 * tracks the parent-computed loneliness exposure.
 */
import { useEffect, useRef, useState } from 'react';
import { motion, useAnimationControls } from 'framer-motion';
import { CHARACTERS, charAsset, type CharId } from '../data/characters';
import { FaceOverlay, type ExpressionKind } from './FaceOverlay';

export interface EntityProps {
  id: string;
  charId: CharId;
  x: number;
  y: number;
  size?: number;
  phaseOffset?: number;
  gazeTargetX?: number | null;
  gazeTargetY?: number | null;
  greetingPulse?: number;
  /** 0..1 CSS saturate() factor. Phase C desaturates on lonely exposure. */
  saturation?: number;
  onMount?: () => void;
}

const BLINK_MIN_MS = 2000;
const BLINK_MAX_MS = 5000;
const FACE_EXPR_MIN_MS = 9000;
const FACE_EXPR_MAX_MS = 16000;

const NON_BLINK_EXPRESSIONS: ExpressionKind[] = [
  'wink-left',
  'wink-right',
  'squint',
  'happy',
  'happy',
];

const GAZE_RANGE_PX = 5;

export function Entity({
  id,
  charId,
  x,
  y,
  size = 180,
  phaseOffset = 0,
  gazeTargetX,
  gazeTargetY,
  greetingPulse = 0,
  saturation = 1,
  onMount,
}: EntityProps) {
  const character = CHARACTERS[charId];
  const breatheDelay = (phaseOffset % 1) * 3.5;
  const floatDelay = (phaseOffset % 1) * 5;
  const wobbleDelay = (phaseOffset % 1) * 8;

  const [exprKey, setExprKey] = useState(0);
  const [expr, setExpr] = useState<ExpressionKind>('blink');
  const blinkTimer = useRef<number | null>(null);
  const funnyTimer = useRef<number | null>(null);

  useEffect(() => {
    const scheduleBlink = () => {
      const delay = BLINK_MIN_MS + Math.random() * (BLINK_MAX_MS - BLINK_MIN_MS);
      blinkTimer.current = window.setTimeout(() => {
        setExpr('blink');
        setExprKey((k) => k + 1);
        scheduleBlink();
      }, delay);
    };
    const scheduleFunny = () => {
      const delay = FACE_EXPR_MIN_MS + Math.random() * (FACE_EXPR_MAX_MS - FACE_EXPR_MIN_MS);
      funnyTimer.current = window.setTimeout(() => {
        const kind = NON_BLINK_EXPRESSIONS[
          Math.floor(Math.random() * NON_BLINK_EXPRESSIONS.length)
        ];
        setExpr(kind);
        setExprKey((k) => k + 1);
        scheduleFunny();
      }, delay);
    };
    scheduleBlink();
    scheduleFunny();
    return () => {
      if (blinkTimer.current) window.clearTimeout(blinkTimer.current);
      if (funnyTimer.current) window.clearTimeout(funnyTimer.current);
    };
  }, []);

  let gazeX = 0;
  let gazeY = 0;
  if (gazeTargetX != null && gazeTargetY != null) {
    const dx = gazeTargetX - x;
    const dy = gazeTargetY - y;
    const d = Math.hypot(dx, dy) || 1;
    gazeX = (dx / d) * GAZE_RANGE_PX;
    gazeY = (dy / d) * GAZE_RANGE_PX;
  }

  const greetControls = useAnimationControls();
  const greetSeen = useRef(0);
  useEffect(() => {
    if (greetingPulse > greetSeen.current) {
      greetSeen.current = greetingPulse;
      greetControls.start({
        scale: [1, 1.12, 0.96, 1.04, 1],
        transition: { duration: 0.7, times: [0, 0.25, 0.55, 0.82, 1], ease: 'easeOut' },
      });
    }
  }, [greetingPulse, greetControls]);

  return (
    <motion.div
      className="entity"
      data-id={id}
      style={{
        position: 'absolute',
        left: x - size / 2,
        top: y - size / 2,
        width: size,
        height: size,
        pointerEvents: 'none',
        willChange: 'transform',
      }}
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: [0, 1.1, 1], opacity: 1 }}
      transition={{
        scale: { duration: 1.8, times: [0, 0.7, 1], ease: 'easeOut' },
        opacity: { duration: 1.4, ease: 'easeOut' },
      }}
      onAnimationComplete={() => onMount?.()}
    >
      <motion.div
        style={{ width: '100%', height: '100%', willChange: 'transform' }}
        animate={{ y: [0, -5, 0] }}
        transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut', delay: floatDelay }}
      >
        <motion.div
          style={{ width: '100%', height: '100%', willChange: 'transform' }}
          animate={{ rotate: [-1.5, 1.5, -1.5] }}
          transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut', delay: wobbleDelay }}
        >
          <motion.div
            style={{ width: '100%', height: '100%', willChange: 'transform' }}
            animate={greetControls}
          >
            <motion.div
              style={{ width: '100%', height: '100%', position: 'relative', willChange: 'transform' }}
              animate={{ scale: [1, 1.04, 1] }}
              transition={{ duration: 3.5, repeat: Infinity, ease: 'easeInOut', delay: breatheDelay }}
            >
              <motion.img
                src={charAsset(charId)}
                alt=""
                draggable={false}
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'contain',
                  display: 'block',
                  userSelect: 'none',
                }}
                animate={{ filter: `saturate(${saturation})` }}
                transition={{ duration: 1.2, ease: 'easeOut' }}
              />
              <FaceOverlay
                face={character.face}
                triggerKey={exprKey}
                kind={expr}
                gazeX={gazeX}
                gazeY={gazeY}
              />
            </motion.div>
          </motion.div>
        </motion.div>
      </motion.div>
    </motion.div>
  );
}
