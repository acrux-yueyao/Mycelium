/**
 * useEmotion — call /api/emotion and resolve to { charId, primary, secondary, intensity }.
 * STEP 2 STUB. Step 4 will wire this up to the input flow.
 */
import type { CharId } from '../data/characters';

export interface EmotionResult {
  charId: CharId;
  primary: string;
  secondary: string;
  intensity: number;
}

export function useEmotion() {
  const read = async (_text: string): Promise<EmotionResult> => {
    throw new Error('useEmotion.read not yet implemented');
  };
  return { read };
}
