/**
 * Entity — a living character on stage.
 *
 * STEP 2 STUB: signature defined but body is an empty fragment.
 * Step 3 will wire up <motion.img> with grow / breathe / float animations.
 */
import type { CharId } from '../data/characters';

export interface EntityProps {
  id: string;              // unique per spawned instance
  charId: CharId;
  x: number;               // center x in px
  y: number;               // center y in px
  size?: number;           // render size in px (default 180)
  onMount?: () => void;
}

export function Entity(_props: EntityProps) {
  return null;
}
