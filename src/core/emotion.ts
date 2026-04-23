/**
 * Emotion analysis client. Calls /api/emotion, validates the response, and
 * returns a strict EmotionReading. LLM is a hard dependency — failures
 * surface as EmotionApiError, no local fallback.
 *
 * Schema includes `topic` + `morphology`, which together drive per-creature
 * visual parameters (density, agitation, glow, tint, tendril count,
 * particles). When the model omits fields or returns out-of-range values
 * we clamp and fill in neutral defaults rather than failing, so a
 * slightly-off reading still produces a believable mushroom.
 */

export type EmotionTopic =
  | 'academic'
  | 'relationship'
  | 'self'
  | 'joy'
  | 'other';

export interface Morphology {
  /** 0 = translucent & wispy, 1 = round & full-bodied. */
  density: number;
  /** 0 = still, 1 = high-frequency wobble. */
  agitation: number;
  /** 3..10 integer — how branchy the creature's tendrils are. */
  tendrilCount: number;
  /** 0 = no glow, 1 = radiant core. */
  glow: number;
  /** 0..359 hue (degrees) for the sprite tint overlay. */
  tintHue: number;
  /** True → emit drifting particles from the sprite. */
  particles: boolean;
}

export interface EmotionReading {
  primary: { label: string; weight: number };
  secondary: { label: string; weight: number };
  intensity: number;
  rationale?: string;
  topic: EmotionTopic;
  morphology: Morphology;
}

export class EmotionApiError extends Error {
  constructor(message: string, public cause?: unknown) {
    super(message);
    this.name = 'EmotionApiError';
  }
}

const TOPICS: EmotionTopic[] = ['academic', 'relationship', 'self', 'joy', 'other'];

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function asNumber(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

/** Build a Morphology from whatever the LLM returned, filling in
 *  neutral defaults for missing or malformed fields. */
function sanitizeMorphology(raw: unknown): Morphology {
  const src = (raw ?? {}) as Record<string, unknown>;
  return {
    density:      clamp(asNumber(src.density, 0.6), 0, 1),
    agitation:    clamp(asNumber(src.agitation, 0.3), 0, 1),
    tendrilCount: Math.round(clamp(asNumber(src.tendrilCount, 5), 3, 10)),
    glow:         clamp(asNumber(src.glow, 0.2), 0, 1),
    tintHue:      Math.round(clamp(asNumber(src.tintHue, 30), 0, 359)),
    particles:    src.particles === true,
  };
}

function sanitizeTopic(raw: unknown): EmotionTopic {
  return TOPICS.includes(raw as EmotionTopic) ? (raw as EmotionTopic) : 'other';
}

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

  // topic + morphology are soft-required: if missing we fill defaults
  // rather than fail, so a partial reading still produces a creature.
  const topic = sanitizeTopic((r as { topic?: unknown }).topic);
  const morphology = sanitizeMorphology((r as { morphology?: unknown }).morphology);
  if (!(r as { topic?: unknown }).topic || !(r as { morphology?: unknown }).morphology) {
    console.warn('[emotion] filled morphology/topic defaults from partial LLM output');
  }

  return {
    primary: r.primary as { label: string; weight: number },
    secondary: r.secondary as { label: string; weight: number },
    intensity: r.intensity,
    rationale: r.rationale,
    topic,
    morphology,
  };
}

// Must sit ABOVE the backend's combined waits:
//   api/emotion.ts UPSTREAM_TIMEOUT_MS (45s) + JSON/response overhead.
// If we abort earlier than the backend can, we mask the real error
// and always show generic "timeout" instead of the specific upstream
// detail (upstream-timeout / upstream-4xx / llm-bad-json / ...).
const REQUEST_TIMEOUT_MS = 65_000;
