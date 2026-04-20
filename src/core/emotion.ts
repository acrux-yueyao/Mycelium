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

const REQUEST_TIMEOUT_MS = 30_000;

export async function readEmotion(text: string): Promise<EmotionReading> {
  // Hard cap the request: without this, a stalled /api/emotion would
  // leave the UI sitting on "the mycelium is listening" forever.
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch('/api/emotion', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text }),
      signal: ctrl.signal,
    });
  } catch (e) {
    clearTimeout(timer);
    if ((e as { name?: string })?.name === 'AbortError') {
      console.error('[emotion] request timed out after', REQUEST_TIMEOUT_MS, 'ms');
      throw new EmotionApiError('timeout', e);
    }
    console.error('[emotion] network failed:', e);
    throw new EmotionApiError('network-failed', e);
  }
  clearTimeout(timer);

  if (!res.ok) {
    let detail = '';
    try { detail = await res.text(); } catch { /* empty */ }
    console.error('[emotion] http', res.status, detail);
    throw new EmotionApiError(`http-${res.status}: ${detail}`);
  }
  let data: unknown;
  try {
    data = await res.json();
  } catch (e) {
    console.error('[emotion] invalid JSON from /api/emotion');
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
    console.error('[emotion] schema mismatch:', data);
    throw new EmotionApiError(`schema-mismatch: ${JSON.stringify(data).slice(0, 300)}`);
  }
  return r as EmotionReading;
}
