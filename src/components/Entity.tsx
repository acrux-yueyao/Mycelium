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
import { EntityParticles } from './EntityParticles';
import type { Morphology } from '../core/emotion';
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
  /** Whimsical label drawn in Caveat script just below the sprite. */
  name?: string;
  /** Per-creature visual parameters from the LLM emotion reading.
   *  Drives overall opacity, glow, wobble frequency/amplitude, hue
   *  overlay, and optional drifting particles. */
  morphology?: Morphology;
  /** True while the user is actively holding this entity with a
   *  pointer. Drives a small lift/shadow tweak for feedback. */
  isDragged?: boolean;
  /** Pointer-down callback — parent records that this entity is the
   *  one being dragged and starts following the cursor. */
  onGrab?: (id: string, clientX: number, clientY: number) => void;
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
  /** True once this entity has been on stage long enough to serve as a
   *  "mother tree" for isolated neighbors. Renders a very soft warm
   *  halo behind the sprite — no badge, no crown, just presence. */
  isMotherTree?: boolean;
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

/** Read a numeric CSS custom property from :root. Falls back if the
 *  var isn't set or isn't a finite number. Kept inline rather than
 *  reactive because these values only change on full reload
 *  (URL query string drives them). */
function readRootNumber(name: string, fallback: number): number {
  if (typeof document === 'undefined') return fallback;
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name);
  const n = parseFloat(raw);
  return Number.isFinite(n) ? n : fallback;
}

const GAZE_RANGE_PX = 5;

// Sprite crossfade duration (seconds). Should roughly match TRANSFORM_MS
// in App.tsx so the crossfade finishes as the state flips to 'hybrid'.
const CROSSFADE_S = 2.4;

export function Entity({
  id,
  charId,
  name,
  morphology,
  isDragged = false,
  onGrab,
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
  isMotherTree = false,
  onMount,
}: EntityProps) {
  // Derive the visual knobs from morphology once per render. When the
  // creature was debug-spawned (no LLM reading) we pick visually
  // neutral middle values so it still looks like a mushroom, just
  // unremarkable in its morphology-driven dimensions.
  const density = morphology?.density ?? 0.7;
  const agitation = morphology?.agitation ?? 0.3;
  const glow = morphology?.glow ?? 0.15;
  const tintHue = morphology?.tintHue ?? -1; // -1 = skip tint overlay
  const emitParticles = morphology?.particles === true;

  // Density → overall opacity (0 is wispy, 1 is fully present) and
  // a subtle scale. Lonely / translucent creatures should read as
  // barely-there without shrinking into invisibility.
  const bodyOpacity = 0.55 + density * 0.45;
  const bodyScaleBase = 0.92 + density * 0.12;

  // Agitation → wobble frequency (shorter period) and amplitude.
  // Calm creatures tilt slowly by ±1°; panicked ones oscillate hard.
  // Final amplitudes are multiplied by the time-of-day vibration
  // gain (set on :root by Background), so exam-week creatures
  // tremble more without any per-entity coordination.
  const vibrationGain = readRootNumber('--vibration-gain', 1);
  const wobbleDur = (8 - agitation * 4.5) / Math.max(0.4, vibrationGain);
  const wobbleAmp = (1.2 + agitation * 3.2) * vibrationGain;
  const breatheDur = (3.5 - agitation * 1.2) / Math.max(0.4, vibrationGain);
  const breatheAmp = (0.04 + agitation * 0.05) * vibrationGain;
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
      className={`entity${isDragged ? ' entity-dragged' : ''}`}
      data-id={id}
      onPointerDown={(e) => {
        // Ignore clicks coming out of the initial scale=0 frame —
        // spawn animation runs 0 → 1.1 → 1 over 1.8s and the hit-box
        // is mis-sized mid-grow. After that, any pointer down on the
        // sprite box picks the creature up.
        if (!onGrab) return;
        e.stopPropagation();
        onGrab(id, e.clientX, e.clientY);
      }}
      style={{
        position: 'absolute',
        left: x - size / 2,
        top: y - size / 2,
        width: size,
        height: size,
        // Pointer events are enabled so the sprite can be dragged.
        // Transparent PNG padding also counts as hit-area — acceptable
        // for now given the round sprite shapes, can refine with a
        // circular clip-path later if it becomes a problem.
        pointerEvents: onGrab ? 'auto' : 'none',
        cursor: isDragged ? 'grabbing' : onGrab ? 'grab' : 'default',
        touchAction: 'none',
        willChange: 'transform',
      }}
      initial={{ scale: 0, opacity: 0 }}
      animate={{
        scale: isDragged ? 1.08 : [0, 1.1, 1],
        opacity: 1,
      }}
      transition={{
        scale: isDragged
          ? { duration: 0.25, ease: 'easeOut' }
          : { duration: 1.8, times: [0, 0.7, 1], ease: 'easeOut' },
        opacity: { duration: 1.4, ease: 'easeOut' },
      }}
      onAnimationComplete={() => onMount?.()}
    >
      {/* Mother-tree halo: three stacked layers that together make a
       *  mother tree unmistakable without turning it into a badge.
       *    1. A slow-breathing outer ring that expands and fades — a
       *       visible pulse of warmth radiating outward.
       *    2. A bigger peach multiply wash that tints the paper under
       *       the sprite (survives the light-cream bg).
       *    3. An inner screen-blended bloom so the sprite looks lit
       *       from within. */}
      {isMotherTree && (
        <>
          {/* 1 · expanding breath ring */}
          <motion.div
            aria-hidden
            initial={{ opacity: 0, scale: 0.55 }}
            animate={{ opacity: [0, 0.55, 0], scale: [0.75, 1.4, 1.65] }}
            transition={{
              duration: 4.8,
              repeat: Infinity,
              ease: 'easeOut',
              delay: 0.3,
            }}
            style={{
              position: 'absolute',
              inset: '-32%',
              borderRadius: '50%',
              border: '2.5px solid rgba(224, 150, 100, 0.55)',
              pointerEvents: 'none',
              zIndex: -3,
            }}
          />
          {/* 2 · warm peach multiply wash (bigger, more saturated) */}
          <motion.div
            aria-hidden
            initial={{ opacity: 0, scale: 0.7 }}
            animate={{ opacity: 1, scale: [0.93, 1.06, 0.93] }}
            transition={{
              opacity: { duration: 3.5, ease: 'easeOut' },
              scale: { duration: 7, repeat: Infinity, ease: 'easeInOut' },
            }}
            style={{
              position: 'absolute',
              inset: '-28%',
              borderRadius: '50%',
              background:
                'radial-gradient(circle at 50% 55%, rgba(224, 150, 100, 0.78) 0%, rgba(224, 150, 100, 0.40) 35%, rgba(224, 150, 100, 0.0) 72%)',
              pointerEvents: 'none',
              zIndex: -2,
              mixBlendMode: 'multiply',
              filter: 'blur(5px)',
            }}
          />
          {/* 3 · inner screen bloom — makes the sprite feel lit */}
          <motion.div
            aria-hidden
            initial={{ opacity: 0, scale: 0.75 }}
            animate={{ opacity: 1, scale: [0.90, 1.06, 0.90] }}
            transition={{
              opacity: { duration: 3.5, ease: 'easeOut' },
              scale: { duration: 7, repeat: Infinity, ease: 'easeInOut' },
            }}
            style={{
              position: 'absolute',
              inset: '-10%',
              borderRadius: '50%',
              background:
                'radial-gradient(circle at 50% 55%, rgba(255, 228, 185, 0.92) 0%, rgba(255, 228, 185, 0.40) 38%, rgba(255, 228, 185, 0.0) 72%)',
              pointerEvents: 'none',
              zIndex: -2,
              mixBlendMode: 'screen',
              filter: 'blur(3px)',
            }}
          />
        </>
      )}

      {/* Morphology glow — radiant core for warm/grateful readings.
       *  Sits behind the sprite, tinted by tintHue so the color
       *  matches the creature's overall mood (amber for warmth,
       *  green-yellow for joy, etc). Skipped when glow is trivial. */}
      {glow > 0.05 && (
        <motion.div
          aria-hidden
          initial={{ opacity: 0, scale: 0.7 }}
          animate={{ opacity: 1, scale: [0.92, 1.05, 0.92] }}
          transition={{
            opacity: { duration: 2.5, ease: 'easeOut' },
            scale: { duration: 6 + agitation * 2, repeat: Infinity, ease: 'easeInOut' },
          }}
          style={{
            position: 'absolute',
            inset: `-${10 + glow * 18}%`,
            borderRadius: '50%',
            background: `radial-gradient(circle at 50% 55%, hsla(${tintHue < 0 ? 36 : tintHue}, 72%, 72%, ${0.28 + glow * 0.55}) 0%, hsla(${tintHue < 0 ? 36 : tintHue}, 72%, 72%, ${0.10 + glow * 0.30}) 38%, hsla(${tintHue < 0 ? 36 : tintHue}, 72%, 72%, 0) 72%)`,
            pointerEvents: 'none',
            zIndex: -2,
            mixBlendMode: 'screen',
            filter: `blur(${2 + glow * 3}px)`,
          }}
        />
      )}

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
          animate={{ rotate: [-wobbleAmp, wobbleAmp, -wobbleAmp] }}
          transition={{ duration: wobbleDur, repeat: Infinity, ease: 'easeInOut', delay: wobbleDelay }}
        >
          <motion.div
            style={{ width: '100%', height: '100%', willChange: 'transform' }}
            animate={greetControls}
          >
            <motion.div
              style={{
                width: '100%',
                height: '100%',
                position: 'relative',
                willChange: 'transform',
                // density ∈ [0..1] → opacity, so wispy/lonely creatures
                // read as barely-there without actually shrinking.
                opacity: bodyOpacity,
              }}
              animate={{ scale: [bodyScaleBase - breatheAmp, bodyScaleBase + breatheAmp, bodyScaleBase - breatheAmp] }}
              transition={{ duration: breatheDur, repeat: Infinity, ease: 'easeInOut', delay: breatheDelay }}
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

                {/* Morphology hue tint — a translucent colour wash
                    clipped to the sprite silhouette via an alpha mask
                    on the base PNG. Topic determines hue; density
                    determines how strong the wash reads. We skip it
                    during transform/hybrid since the sprite is
                    mid-crossfade and the mask would flicker. */}
                {tintHue >= 0 && !isMidTransform && !isHybridNow && (
                  <div
                    aria-hidden
                    style={{
                      position: 'absolute',
                      inset: 0,
                      background: `hsl(${tintHue}, 58%, 62%)`,
                      pointerEvents: 'none',
                      opacity: 0.22 + density * 0.25,
                      WebkitMaskImage: `url(${baseSrc})`,
                      WebkitMaskSize: 'contain',
                      WebkitMaskRepeat: 'no-repeat',
                      WebkitMaskPosition: 'center',
                      maskImage: `url(${baseSrc})`,
                      maskSize: 'contain',
                      maskRepeat: 'no-repeat',
                      maskPosition: 'center',
                      mixBlendMode: 'color',
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

      {/* Name label — sits just below the sprite in Caveat script.
       *  Outside the float/wobble/breathe chain so it stays steady
       *  and readable instead of dancing with the mushroom. Fades
       *  in on a slight delay so it appears after the spawn grow. */}
      {/* Particle emitter — triggered by morphology.particles for
       *  "releasing / weightless" readings. Dots rise from the
       *  sprite centre in the creature's own tint. */}
      {emitParticles && (
        <EntityParticles hue={tintHue < 0 ? 36 : tintHue} size={size} />
      )}

      {name && (
        <motion.div
          aria-hidden
          initial={{ opacity: 0, y: -3 }}
          animate={{ opacity: 0.42, y: 0 }}
          transition={{ delay: 1.6, duration: 1.4, ease: 'easeOut' }}
          style={{
            position: 'absolute',
            left: '50%',
            top: '100%',
            transform: 'translate(-50%, -14px)',
            fontFamily: "'Caveat', 'ZCOOL KuaiLe', cursive",
            fontSize: '0.85rem',
            color: '#6B5B47',
            letterSpacing: '0.02em',
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
            userSelect: 'none',
            textShadow: '0 1px 0 rgba(255, 248, 232, 0.7)',
          }}
        >
          {name}
        </motion.div>
      )}
    </motion.div>
  );
}
