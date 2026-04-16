/**
 * Emotion analysis client. Calls /api/emotion, validates the response, and
 * returns a strict EmotionReading. LLM is a hard dependency — failures
 * surface as EmotionApiError, no local fallback.
 *
 * The backend prompt + JSON schema is updated in Step 4 when we wire this
 * to the new character-based emotion mapping.
 */

export interface EmotionReading {
  primary: { label: string; weight: number };
  secondary: { label: string; weight: number };
  intensity: number;
  rationale?: string;
}

export class EmotionApiError extends Error {
  constructor(message: string, public cause?: unknown) {
    super(message);
    this.name = 'EmotionApiError';
  }
}

export async function readEmotion(text: string): Promise<EmotionReading> {
  let res: Response;
  try {
    res = await fetch('/api/emotion', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text }),
    });
  } catch (e) {
    throw new EmotionApiError('network-failed', e);
  }
  if (!res.ok) {
    let detail = '';
    try { detail = await res.text(); } catch { /* empty */ }
    throw new EmotionApiError(`http-${res.status}: ${detail}`);
  }
  let data: unknown;
  try {
    data = await res.json();
  } catch (e) {
    throw new EmotionApiError('invalid-json', e);
  }
  const r = data as Partial<EmotionReading>;
  if (
    !r ||
    typeof r !== 'object' ||
    !r.primary ||
    !r.secondary ||
    typeof r.intensity !== 'number'
  ) {
    throw new EmotionApiError(`schema-mismatch: ${JSON.stringify(data).slice(0, 300)}`);
  }
  return r as EmotionReading;
}
