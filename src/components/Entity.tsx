/**
 * Entity — a living character on stage.
 *
 * Three animation layers compose on each other:
 *   1. Grow     : scale 0 → 1.1 → 1 on mount (2s, ease-out)
 *   2. Breathe  : scale [1, 1.04, 1] infinite (3.5s)
 *   3. Float    : y [0, -5, 0] infinite (5s, offset phase per entity)
 *
 * The sprite is a PNG; soft shadow is a CSS box-shadow pseudo-element.
 */
import { motion } from 'framer-motion';
import { charAsset, type CharId } from '../data/characters';

export interface EntityProps {
  id: string;
  charId: CharId;
  x: number;
  y: number;
  size?: number;
  /** radians phase offset so spawn order doesn't synchronize animations */
  phaseOffset?: number;
  onMount?: () => void;
}

export function Entity({
  id,
  charId,
  x,
  y,
  size = 180,
  phaseOffset = 0,
  onMount,
}: EntityProps) {
  // Offset animation phases so multiple entities breathe/float out of sync
  const breatheDelay = (phaseOffset % 1) * 3.5;
  const floatDelay = (phaseOffset % 1) * 5;

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
      animate={{
        scale: [0, 1.1, 1],
        opacity: 1,
        y: [0, -5, 0],
      }}
      transition={{
        scale: { duration: 1.8, times: [0, 0.7, 1], ease: 'easeOut' },
        opacity: { duration: 1.4, ease: 'easeOut' },
        y: {
          duration: 5,
          repeat: Infinity,
          ease: 'easeInOut',
          delay: floatDelay,
        },
      }}
      onAnimationComplete={() => onMount?.()}
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
        animate={{ scale: [1, 1.04, 1] }}
        transition={{
          duration: 3.5,
          repeat: Infinity,
          ease: 'easeInOut',
          delay: breatheDelay,
        }}
      />
    </motion.div>
  );
}
