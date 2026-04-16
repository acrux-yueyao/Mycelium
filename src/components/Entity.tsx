/**
 * Entity — a living mushroom on stage.
 *
 * Composed animation layers (nested motion.divs so transforms don't clash):
 *   1. Grow        scale 0 → 1.1 → 1 on mount
 *   2. Float       y [0, -5, 0] infinite
 *   3. Wobble      rotate ±1.5° infinite
 *   4. Greet       scale bounce on greetingPulse++
 *   5. Breathe     scale [1, 1.04, 1] infinite
 *
 * Infection / transformation state machine lives in App.tsx and is
 * expressed visually here:
 *   - 'normal'        → base PNG only; character face(s)
 *   - 'infecting'     → base PNG + partner-color tint pulse; character face(s)
 *   - 'transforming'  → base PNG fades out, hybrid PNG fades in (sprite
 *                       crossfade + scale pulse + wobble jitter); faces
 *                       crossfade from character → HYBRID_FACE
 *   - 'hybrid'        → hybrid PNG + HYBRID_FACE; one-shot aura ring on
 *                       the frame we entered this state
 */
import { useEffect, useRef, useState } from 'react';
import { motion, useAnimationControls } from 'framer-motion';
import {
  CHARACTERS,
  charAsset,
  hybridAsset,
  hybridFaces,
  type CharId,
} from '../data/characters';
import { FaceOverlay, type ExpressionKind } from './FaceOverlay';
import type { InfectionState } from '../App';

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
  /** Current point in the transformation state machine. Default 'normal'. */
  infectionState?: InfectionState;
  /** Sorted [lo, hi] CharIds for the target hybrid PNG. */
  infectionPair?: [CharId, CharId];
  /** Character color of the entity currently infecting this one; drives tint. */
  partnerColor?: string;
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

// Sprite crossfade duration (seconds). Should roughly match TRANSFORM_MS
// in App.tsx so the crossfade finishes as the state flips to 'hybrid'.
const CROSSFADE_S = 2.4;

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
  infectionState = 'normal',
  infectionPair,
  partnerColor,
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

  // One-shot aura the first time this entity enters the 'hybrid' state.
  const auraControls = useAnimationControls();
  const auraFiredRef = useRef(false);
  useEffect(() => {
    if (infectionState === 'hybrid' && !auraFiredRef.current) {
      auraFiredRef.current = true;
      auraControls.start({
        scale: [0.5, 2.4],
        opacity: [0.8, 0],
        transition: { duration: 1.4, ease: 'easeOut' },
      });
    }
  }, [infectionState, auraControls]);

  const isInfecting = infectionState === 'infecting';
  const isMidTransform = infectionState === 'transforming';
  const isHybridNow = infectionState === 'hybrid';

  const baseSrc = charAsset(charId);
  const hybridSrc = infectionPair
    ? hybridAsset(infectionPair[0], infectionPair[1])
    : null;

  // Crossfade: base is fully visible up through 'infecting'; hybrid takes
  // over during 'transforming' and stays at 1 in 'hybrid'.
  const baseOpacity = isMidTransform || isHybridNow ? 0 : 1;
  const hybridOpacity = isMidTransform || isHybridNow ? 1 : 0;

  // Extra wobble during transformation so the morph doesn't feel flat.
  const morphScale = isMidTransform ? [1, 1.07, 1] : 1;

  const imgBaseStyle: React.CSSProperties = {
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%',
    objectFit: 'contain',
    display: 'block',
    userSelect: 'none',
  };

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
      {/* Aura: invisible until the moment we transition into 'hybrid'. */}
      <motion.div
        initial={{ scale: 0.5, opacity: 0 }}
        animate={auraControls}
        style={{
          position: 'absolute',
          inset: '10%',
          borderRadius: '50%',
          border: '3px solid rgba(255, 230, 180, 0.75)',
          pointerEvents: 'none',
          zIndex: -1,
        }}
      />

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
              <motion.div
                style={{ width: '100%', height: '100%', position: 'relative' }}
                animate={{ scale: morphScale }}
                transition={{ duration: CROSSFADE_S, ease: 'easeInOut' }}
              >
                {/* Base sprite: fades out during transform. */}
                <motion.img
                  src={baseSrc}
                  alt=""
                  draggable={false}
                  style={imgBaseStyle}
                  animate={{
                    opacity: baseOpacity,
                    filter: `saturate(${saturation})`,
                  }}
                  transition={{
                    opacity: { duration: CROSSFADE_S, ease: 'easeInOut' },
                    filter: { duration: 1.2, ease: 'easeOut' },
                  }}
                />

                {/* Hybrid sprite: fades in during transform, stays at 1 in hybrid. */}
                {hybridSrc && (
                  <motion.img
                    src={hybridSrc}
                    alt=""
                    draggable={false}
                    style={imgBaseStyle}
                    initial={{ opacity: 0 }}
                    animate={{
                      opacity: hybridOpacity,
                      filter: `saturate(${saturation})`,
                    }}
                    transition={{
                      opacity: { duration: CROSSFADE_S, ease: 'easeInOut' },
                      filter: { duration: 1.2, ease: 'easeOut' },
                    }}
                  />
                )}

                {/* Infecting tint: partner's color pulses ON the mushroom
                    silhouette only. We use the base PNG's alpha channel
                    as a CSS mask, so the colored layer is clipped to the
                    sprite shape and never bleeds into the background. */}
                {isInfecting && partnerColor && (
                  <motion.div
                    aria-hidden
                    style={{
                      position: 'absolute',
                      inset: 0,
                      background: partnerColor,
                      pointerEvents: 'none',
                      WebkitMaskImage: `url(${baseSrc})`,
                      WebkitMaskSize: 'contain',
                      WebkitMaskRepeat: 'no-repeat',
                      WebkitMaskPosition: 'center',
                      maskImage: `url(${baseSrc})`,
                      maskSize: 'contain',
                      maskRepeat: 'no-repeat',
                      maskPosition: 'center',
                      mixBlendMode: 'soft-light',
                    }}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: [0, 0.55, 0.25, 0.55] }}
                    transition={{ duration: 2.2, repeat: Infinity, repeatType: 'mirror', ease: 'easeInOut' }}
                  />
                )}

                {/* Base face(s): visible during normal + infecting; fades out with the base sprite. */}
                <motion.div
                  style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
                  animate={{ opacity: baseOpacity }}
                  transition={{ duration: CROSSFADE_S, ease: 'easeInOut' }}
                >
                  <FaceOverlay
                    face={character.face}
                    triggerKey={exprKey}
                    kind={expr}
                    gazeX={gazeX}
                    gazeY={gazeY}
                  />
                  {character.secondaryFace && (
                    <FaceOverlay
                      face={character.secondaryFace}
                      triggerKey={exprKey}
                      kind={expr}
                      gazeX={gazeX}
                      gazeY={gazeY}
                    />
                  )}
                </motion.div>

                {/* Hybrid faces: one per body in the hybrid art (twin-cup
                    hybrids get two). Fades in with the hybrid sprite. */}
                {hybridSrc && infectionPair && (
                  <motion.div
                    style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: hybridOpacity }}
                    transition={{ duration: CROSSFADE_S, ease: 'easeInOut' }}
                  >
                    {hybridFaces(infectionPair[0], infectionPair[1]).map((hf, idx) => (
                      <FaceOverlay
                        key={idx}
                        face={hf}
                        triggerKey={exprKey}
                        kind={expr}
                        gazeX={gazeX}
                        gazeY={gazeY}
                      />
                    ))}
                  </motion.div>
                )}
              </motion.div>
            </motion.div>
          </motion.div>
        </motion.div>
      </motion.div>
    </motion.div>
  );
}
