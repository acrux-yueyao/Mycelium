import type { SpeciesId, SurfaceModifier } from './species';

/**
 * Emotion analysis response shape. The backend (api/emotion.ts) is contract-
 * bound to return this exact structure. We do NOT fall back to any local
 * heuristic — the LLM is a hard dependency, per project concept.
 */
export interface EmotionReading {
  primary: { label: string; weight: number };
  secondary: { label: string; weight: number };
  intensity: number;                 // 0..1
  species: SpeciesId;
  surfaceModifier: SurfaceModifier;
  rationale?: string;                // short poetic line, optional
}

export class EmotionApiError extends Error {
  constructor(message: string, public cause?: unknown) {
    super(message);
    this.name = 'EmotionApiError';
  }
}

const VALID_SPECIES: ReadonlySet<SpeciesId> = new Set([
  'metatrichia',
  'physarum',
  'cribraria',
  'chlorociboria',
  'badhamia',
  'colloderma',
]);

const VALID_MODIFIERS: ReadonlySet<SurfaceModifier> = new Set([
  'none',
  'pearl-translucency',
  'oxidized-copper',
  'chartreuse-sheen',
  'indigo-bruise',
  'ember-warmth',
]);

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
    typeof r.intensity !== 'number' ||
    !r.species ||
    !VALID_SPECIES.has(r.species) ||
    !r.surfaceModifier ||
    !VALID_MODIFIERS.has(r.surfaceModifier)
  ) {
    throw new EmotionApiError(`schema-mismatch: ${JSON.stringify(data).slice(0, 300)}`);
  }
  return r as EmotionReading;
}
