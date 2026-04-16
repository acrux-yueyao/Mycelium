/**
 * useEmotion — posts a sentence to /api/emotion and resolves to an
 * EmotionResult with a concrete charId already looked up.
 *
 * The backend constrains `primary.label` to tags in characters.ts so
 * `emotionToCharId()` is a direct map (no fuzzy fallback required).
 */
import { useState, useCallback } from 'react';
import {
  readEmotion,
  EmotionApiError,
  type EmotionReading,
} from '../core/emotion';
import { emotionToCharId, type CharId } from '../data/characters';

export interface EmotionResult {
  charId: CharId;
  reading: EmotionReading;
}

export interface UseEmotionState {
  loading: boolean;
  error: string | null;
}

export function useEmotion() {
  const [state, setState] = useState<UseEmotionState>({
    loading: false,
    error: null,
  });

  const read = useCallback(async (text: string): Promise<EmotionResult | null> => {
    setState({ loading: true, error: null });
    try {
      const reading = await readEmotion(text);
      const charId = emotionToCharId(reading.primary.label);
      setState({ loading: false, error: null });
      return { charId, reading };
    } catch (e) {
      const message = e instanceof EmotionApiError
        ? e.message
        : `unknown: ${String(e)}`;
      setState({ loading: false, error: message });
      return null;
    }
  }, []);

  const clearError = useCallback(() => {
    setState((s) => ({ ...s, error: null }));
  }, []);

  return { ...state, read, clearError };
}
