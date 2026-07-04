/**
 * Entity — a living pixel-spore on stage.
 *
 * Composed animation layers (nested motion.divs so transforms don't clash):
 *   1. Grow        scale 0 → 1.1 → 1 on mount
 *   2. Float       y [0, -5, 0] infinite
 *   3. Wobble      rotate ±wobbleAmp° infinite
 *   4. Greet       scale bounce on greetingPulse++
 *   5. Breathe     scale [1, 1.04, 1] infinite
 *   6. Morph       small scale pulse while transforming
 *
 * The body itself is a <PixelSprite> canvas built from a deterministic
 * MosaicSpec. Infection / transformation is expressed on that same grid:
 *   - 'normal'        → base palette
 *   - 'infecting'     → base palette + partner-color soft-light pulse
 *   - 'transforming'  → per-cell dye wavefront sweeps toward partner palette
 *   - 'hybrid'        → fully dyed to partner palette, keeps own silhouette;
 *                       one-shot aura ring on the frame we enter this state
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, useAnimationControls } from 'framer-motion';
import { EntityParticles } from './EntityParticles';
import type { Morphology } from '../core/emotion';
import { buildMosaic, type MosaicPaletteSpec } from '../core/mosaic';
import { Rng, xmur3 } from '../core/seed';
import { CHARACTERS, type CharId } from '../data/characters';
import { PixelSprite } from './PixelSprite';
import type { InfectionState } from '../App';

/** Snapshot of the partner an entity is fusing with (captured at
 *  infection start, since the partner may despawn before we finish). */
export interface HybridSource {
  id: string;
  charId: CharId;
  morphology?: Morphology;
  intensity?: number;
  secondaryLabel?: string;
}

export interface EntityProps {
  id: string;
  charId: CharId;
  /** Whimsical label drawn in Caveat script just below the sprite. */
  name?: string;
  /** Per-creature visual parameters from the LLM emotion reading. */
  morphology?: Morphology;
  /** Emotion intensity 0..1 — widens the palette from mono to rainbow. */
  intensity?: number;
  /** Secondary emotion label — nudges a second accent hue. */
  secondaryLabel?: string;
  /** True while the user is actively holding this entity with a pointer. */
  isDragged?: boolean;
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
  /** Wall-clock ms when the current infectionState was entered. */
  infectionStart?: number;
  /** Character color of the entity currently infecting this one. */
  partnerColor?: string;
  /** Snapshot of the fusion partner — supplies the dye target palette. */
  hybridSource?: HybridSource;
  /** True once this entity is old enough to serve as a mother tree. */
  isMotherTree?: boolean;
  onMount?: () => void;
}

const BLINK_MIN_MS = 2600;
const BLINK_MAX_MS = 6000;
const BLINK_DUR_MS = 130;
const TRANSFORM_MS = 2400; // keep in sync with App.tsx TRANSFORM_MS
const GAZE_DIV = 150; // px of horizontal offset that maps to full pupil travel

function readRootNumber(name: string, fallback: number): number {
  if (typeof document === 'undefined') return fallback;
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name);
  const n = parseFloat(raw);
  return Number.isFinite(n) ? n : fallback;
}

export function Entity({
  id,
  charId,
  name,
  morphology,
  intensity = 0.5,
  secondaryLabel,
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
  infectionStart,
  partnerColor,
  hybridSource,
  isMotherTree = false,
  onMount,
}: EntityProps) {
  const density = morphology?.density ?? 0.7;
  const agitation = morphology?.agitation ?? 0.3;
  const glow = morphology?.glow ?? 0.15;
  const tintHue = morphology?.tintHue ?? 36;
  const emitParticles = morphology?.particles === true;

  const bodyOpacity = 0.55 + density * 0.45;
  const bodyScaleBase = 0.92 + density * 0.12;

  const vibrationGain = readRootNumber('--vibration-gain', 1);
  const wobbleDur = (8 - agitation * 4.5) / Math.max(0.4, vibrationGain);
  const wobbleAmp = (1.2 + agitation * 3.2) * vibrationGain;
  const breatheDur = (3.5 - agitation * 1.2) / Math.max(0.4, vibrationGain);
  const breatheAmp = (0.04 + agitation * 0.05) * vibrationGain;
  const breatheDelay = (phaseOffset % 1) * 3.5;
  const floatDelay = (phaseOffset % 1) * 5;
  const wobbleDelay = (phaseOffset % 1) * 8;

  // ---- deterministic pixel-spore spec ----
  const spec = useMemo(
    () =>
      buildMosaic({
        id,
        charId,
        morphology: morphology ?? {
          density, agitation, tendrilCount: 5, glow, tintHue, particles: emitParticles,
        },
        intensity,
        secondaryLabel,
      }),
    // morphology object identity is stable per entity; intensity/labels too
    [id, charId, morphology, intensity, secondaryLabel, density, agitation, glow, tintHue, emitParticles],
  );

  // dye target palette (partner's palette), snapshotted from hybridSource
  const targetPalette: MosaicPaletteSpec | null = useMemo(() => {
    if (!hybridSource) return null;
    return buildMosaic({
      id: hybridSource.id,
      charId: hybridSource.charId,
      morphology: hybridSource.morphology ?? {
        density: 0.7, agitation: 0.3, tendrilCount: 5, glow: 0.2,
        tintHue: CHARACTERS[hybridSource.charId] ? 30 : 30, particles: false,
      },
      intensity: hybridSource.intensity ?? 0.5,
      secondaryLabel: hybridSource.secondaryLabel,
    }).palette;
  }, [hybridSource]);

  // resting gaze so idle pupils read as a clean one-white-one-black
  const restGaze = useMemo(
    () => (new Rng(xmur3(`${id}:rest`)()).next() < 0.5 ? -1 : 1) * 0.85,
    [id],
  );

  // ---- blink scheduler ----
  const [blink, setBlink] = useState(false);
  const blinkTimer = useRef<number | null>(null);
  useEffect(() => {
    const schedule = () => {
      const delay = BLINK_MIN_MS + Math.random() * (BLINK_MAX_MS - BLINK_MIN_MS);
      blinkTimer.current = window.setTimeout(() => {
        setBlink(true);
        window.setTimeout(() => setBlink(false), BLINK_DUR_MS);
        schedule();
      }, delay);
    };
    schedule();
    return () => { if (blinkTimer.current) window.clearTimeout(blinkTimer.current); };
  }, []);

  // ---- greet + aura controls ----
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

  const isMidTransform = infectionState === 'transforming';
  const morphScale = isMidTransform ? [1, 1.07, 1] : 1;

  // ---- gaze scalar (-1..1) toward the look target, else resting ----
  let gaze = restGaze;
  if (gazeTargetX != null && gazeTargetY != null) {
    gaze = Math.max(-1, Math.min(1, (gazeTargetX - x) / GAZE_DIV));
  }

  // ---- infection visuals: dye wavefront + infecting tint pulse ----
  const now = typeof performance !== 'undefined' ? performance.now() : 0;
  let dye = null as null | { progress: number; targetPalette: MosaicPaletteSpec };
  let tintPulse = null as null | { color: string; alpha: number };
  if (infectionState === 'hybrid' && targetPalette) {
    dye = { progress: 1, targetPalette };
  } else if (infectionState === 'transforming' && targetPalette) {
    const p = infectionStart != null ? (now - infectionStart) / TRANSFORM_MS : 0;
    dye = { progress: Math.max(0, Math.min(1, p)), targetPalette };
  } else if (infectionState === 'infecting' && partnerColor) {
    const phase = infectionStart != null ? (now - infectionStart) / 260 : now / 260;
    tintPulse = { color: partnerColor, alpha: 0.30 + 0.22 * (0.5 + 0.5 * Math.sin(phase)) };
  }

  return (
    <motion.div
      className={`entity${isDragged ? ' entity-dragged' : ''}`}
      data-id={id}
      onPointerDown={(e) => {
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
        pointerEvents: onGrab ? 'auto' : 'none',
        cursor: isDragged ? 'grabbing' : onGrab ? 'grab' : 'default',
        touchAction: 'none',
        willChange: 'transform',
        // sparse pixel spores get a narrower, fainter ground shadow
        // via these vars (consumed by .entity::after in styles.css)
        ['--shadow-w' as string]: `${Math.round(spec.bottomWidthFrac * 52)}%`,
        ['--shadow-alpha' as string]: (0.4 + density * 0.6).toFixed(2),
      }}
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: isDragged ? 1.08 : [0, 1.1, 1], opacity: 1 }}
      transition={{
        scale: isDragged
          ? { duration: 0.25, ease: 'easeOut' }
          : { duration: 1.8, times: [0, 0.7, 1], ease: 'easeOut' },
        opacity: { duration: 1.4, ease: 'easeOut' },
      }}
      onAnimationComplete={() => onMount?.()}
    >
      {/* Mother-tree halo — three stacked warm layers behind the sprite. */}
      {isMotherTree && (
        <>
          <motion.div
            aria-hidden
            initial={{ opacity: 0, scale: 0.55 }}
            animate={{ opacity: [0, 0.5, 0], scale: [0.75, 1.4, 1.65] }}
            transition={{ duration: 4.8, repeat: Infinity, ease: 'easeOut', delay: 0.3 }}
            style={{
              position: 'absolute', inset: '-32%', borderRadius: '50%',
              border: '2.5px solid rgba(224, 150, 100, 0.5)', pointerEvents: 'none', zIndex: -3,
            }}
          />
          <motion.div
            aria-hidden
            initial={{ opacity: 0, scale: 0.7 }}
            animate={{ opacity: 0.9, scale: [0.93, 1.06, 0.93] }}
            transition={{
              opacity: { duration: 3.5, ease: 'easeOut' },
              scale: { duration: 7, repeat: Infinity, ease: 'easeInOut' },
            }}
            style={{
              position: 'absolute', inset: '-28%', borderRadius: '50%',
              background:
                'radial-gradient(circle at 50% 55%, rgba(224, 150, 100, 0.72) 0%, rgba(224, 150, 100, 0.36) 35%, rgba(224, 150, 100, 0.0) 72%)',
              pointerEvents: 'none', zIndex: -2, mixBlendMode: 'multiply', filter: 'blur(5px)',
            }}
          />
          <motion.div
            aria-hidden
            initial={{ opacity: 0, scale: 0.75 }}
            animate={{ opacity: 0.9, scale: [0.9, 1.06, 0.9] }}
            transition={{
              opacity: { duration: 3.5, ease: 'easeOut' },
              scale: { duration: 7, repeat: Infinity, ease: 'easeInOut' },
            }}
            style={{
              position: 'absolute', inset: '-10%', borderRadius: '50%',
              background:
                'radial-gradient(circle at 50% 55%, rgba(255, 228, 185, 0.88) 0%, rgba(255, 228, 185, 0.38) 38%, rgba(255, 228, 185, 0.0) 72%)',
              pointerEvents: 'none', zIndex: -2, mixBlendMode: 'screen', filter: 'blur(3px)',
            }}
          />
        </>
      )}

      {/* Morphology glow — soft warm amber bloom behind the sprite. */}
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
            position: 'absolute', inset: `-${10 + glow * 18}%`, borderRadius: '50%',
            background: `radial-gradient(circle at 50% 55%, rgba(232, 188, 138, ${0.20 + glow * 0.40}) 0%, rgba(232, 188, 138, ${0.08 + glow * 0.22}) 38%, rgba(232, 188, 138, 0) 72%)`,
            pointerEvents: 'none', zIndex: -2, mixBlendMode: 'screen', filter: `blur(${2 + glow * 3}px)`,
          }}
        />
      )}

      {/* Aura ring — one-shot the moment we enter 'hybrid'. */}
      <motion.div
        initial={{ scale: 0.5, opacity: 0 }}
        animate={auraControls}
        style={{
          position: 'absolute', inset: '10%', borderRadius: '50%',
          border: '3px solid rgba(255, 230, 180, 0.75)', pointerEvents: 'none', zIndex: -1,
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
          <motion.div style={{ width: '100%', height: '100%', willChange: 'transform' }} animate={greetControls}>
            <motion.div
              style={{ width: '100%', height: '100%', position: 'relative', willChange: 'transform', opacity: bodyOpacity, filter: `saturate(${saturation})` }}
              animate={{ scale: [bodyScaleBase - breatheAmp, bodyScaleBase + breatheAmp, bodyScaleBase - breatheAmp] }}
              transition={{ duration: breatheDur, repeat: Infinity, ease: 'easeInOut', delay: breatheDelay }}
            >
              <motion.div
                style={{ width: '100%', height: '100%', position: 'relative' }}
                animate={{ scale: morphScale }}
                transition={{ duration: TRANSFORM_MS / 1000, ease: 'easeInOut' }}
              >
                <PixelSprite spec={spec} gaze={gaze} blink={blink} dye={dye} tintPulse={tintPulse} />
              </motion.div>
            </motion.div>
          </motion.div>
        </motion.div>
      </motion.div>

      <EntityParticles hue={tintHue < 0 ? 36 : tintHue} size={size} burst={emitParticles} />

      {name && (
        <motion.div
          aria-hidden
          initial={{ opacity: 0, y: -3 }}
          animate={{ opacity: 0.42, y: 0 }}
          transition={{ delay: 1.6, duration: 1.4, ease: 'easeOut' }}
          style={{
            position: 'absolute', left: '50%', top: '100%',
            transform: 'translate(-50%, -14px)',
            fontFamily: "'Caveat', 'ZCOOL KuaiLe', cursive", fontSize: '0.85rem',
            color: '#6B5B47', letterSpacing: '0.02em', whiteSpace: 'nowrap',
            pointerEvents: 'none', userSelect: 'none',
            textShadow: '0 1px 0 rgba(255, 248, 232, 0.7)',
          }}
        >
          {name}
        </motion.div>
      )}
    </motion.div>
  );
}
