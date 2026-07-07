/**
 * motion — shared framer-motion easings and variants so every scene
 * transition feels like one system: a smooth decelerating ease, subtle
 * scale, and staggered content reveals.
 */
import type { Variants } from 'framer-motion';

// easeOutExpo-ish — a soft, expensive-feeling deceleration
export const EASE = [0.22, 1, 0.36, 1] as const;

/** Full-screen overlay scene: crossfade + a whisper of scale. */
export const sceneOverlay: Variants = {
  initial: { opacity: 0, scale: 0.99 },
  animate: { opacity: 1, scale: 1, transition: { duration: 0.5, ease: EASE } },
  exit: { opacity: 0, scale: 1.008, transition: { duration: 0.36, ease: EASE } },
};

/** Landing poster: reveal children in sequence, dissolve on exit. */
export const landingContainer: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { when: 'beforeChildren', staggerChildren: 0.07, delayChildren: 0.05 },
  },
  exit: { opacity: 0, scale: 1.03, filter: 'blur(8px)', transition: { duration: 0.7, ease: EASE } },
};

/** A block that rises + fades in as part of a stagger. */
export const riseItem: Variants = {
  hidden: { opacity: 0, y: 14 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: EASE } },
};

/** The hero title — a touch more presence than the other blocks. */
export const heroItem: Variants = {
  hidden: { opacity: 0, y: 20, scale: 0.97 },
  visible: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.75, ease: EASE } },
};
