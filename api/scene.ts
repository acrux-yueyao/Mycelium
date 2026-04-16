import { DEFAULT_SCENE_SPEC, normalizeSceneSpec, type SceneSpec } from '../src/core/scene';

export const config = { runtime: 'edge' };

const MODEL = 'claude-haiku-4-5-20251001';
const API_URL = 'https://api.anthropic.com/v1/messages';

const SYSTEM_PROMPT = `You are the scene director for a realtime biological art piece called Mycelium.
Given one short user text, output a single JSON object that controls morphology, motion, material, and interaction.
Output JSON only. No markdown. No commentary. No extra keys.

Rules:
- All numeric fields must be in [0, 1].
- family must be one of: metatrichia, physarum, cribraria, chlorociboria, badhamia, colloderma.
- pointerResponse must be one of: attract, repel-soft, repel-burst, follow.
- material.palette must contain 3 to 5 hex colors (#RRGGBB or #RGB).
- rationale must be <= 20 words, concise and technical-poetic.
- Favor stable realtime rendering parameters, not literary analysis.
- Family is an archetype prior only. Continuous fields should carry most of the variation.

Schema:
{
  "mood": {
    "valence": number,
    "arousal": number,
    "fragility": number,
    "tension": number,
    "wonder": number
  },
  "morphology": {
    "family": "metatrichia" | "physarum" | "cribraria" | "chlorociboria" | "badhamia" | "colloderma",
    "colonyCount": number,
    "sporeCount": number,
    "shellOpenness": number,
    "latticeDensity": number,
    "filamentLength": number,
    "branching": number,
    "asymmetry": number,
    "stemLength": number,
    "droop": number,
    "hollowness": number,
    "scaleVariance": number,
    "spawnRadius": number,
    "birthStagger": number
  },
  "motion": {
    "drift": number,
    "swirl": number,
    "pulse": number,
    "collisionSoftness": number,
    "cohesion": number,
    "scatter": number,
    "recovery": number,
    "jitter": number
  },
  "material": {
    "translucency": number,
    "wetness": number,
    "glow": number,
    "grain": number,
    "palette": string[]
  },
  "interaction": {
    "pointerResponse": "attract" | "repel-soft" | "repel-burst" | "follow",
    "pointerStrength": number,
    "pointerRadius": number,
    "pointerRecovery": number
  },
  "rationale": string
}`;

interface AnthropicRequest {
  model: string;
  max_tokens: number;
  temperature?: number;
  system: Array<{ type: 'text'; text: string; cache_control?: { type: 'ephemeral' } }>;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') {
    return json({ error: 'method-not-allowed' }, 405);
  }
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return json({ error: 'missing-api-key' }, 500);
  }

  let body: { text?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'invalid-body' }, 400);
  }
  const text = typeof body.text === 'string' ? body.text.trim() : '';
  if (text.length < 1 || text.length > 500) {
    return json({ error: 'invalid-text', detail: 'text must be 1..500 characters' }, 400);
  }

  let parsed: unknown | null = null;
  let rawText = '';

  for (let attempt = 0; attempt < 2; attempt++) {
    let upstream: Response;
    try {
      upstream = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-beta': 'prompt-caching-2024-07-31',
        },
        body: JSON.stringify(buildPayload(text, attempt)),
      });
    } catch (error) {
      return json({ error: 'upstream-unreachable', detail: String(error) }, 502);
    }

    if (!upstream.ok) {
      const detail = await upstream.text();
      return json({ error: `upstream-${upstream.status}`, detail }, 502);
    }

    const result = (await upstream.json()) as { content?: Array<{ type: string; text?: string }> };
    rawText = result.content?.find((entry) => entry.type === 'text')?.text ?? '';
    parsed = extractJson(rawText);
    if (parsed) {
      break;
    }
  }

  if (!parsed) {
    const fallback = synthesizeFallbackSceneSpec(text);
    return json(fallback, 200, { 'x-scene-fallback': 'llm-bad-json' });
  }

  try {
    const normalized = normalizeSceneSpec(parsed, { strict: true });
    return json(normalized, 200);
  } catch (error) {
    const fallback = synthesizeFallbackSceneSpec(text);
    return json(fallback, 200, { 'x-scene-fallback': `schema-mismatch:${String(error)}` });
  }
}

function buildPayload(text: string, attempt: number): AnthropicRequest {
  const retry = attempt > 0;
  return {
    model: MODEL,
    max_tokens: retry ? 1200 : 700,
    temperature: 0,
    system: [
      {
        type: 'text',
        text: SYSTEM_PROMPT,
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [
      {
        role: 'user',
        content: retry
          ? `${text}\n\nIMPORTANT: previous output was incomplete. Return one complete compact JSON object only. No markdown fences.`
          : text,
      },
    ],
  };
}

function extractJson(source: string): unknown | null {
  const cleaned = stripFence(source).trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    // Continue to bracket extraction fallback.
  }
  const first = cleaned.indexOf('{');
  const last = cleaned.lastIndexOf('}');
  if (first >= 0 && last > first) {
    try {
      return JSON.parse(cleaned.slice(first, last + 1));
    } catch {
      return null;
    }
  }
  return null;
}

function stripFence(text: string): string {
  const trimmed = text.trim();
  if (!trimmed.startsWith('```')) return text;
  const firstLineEnd = trimmed.indexOf('\n');
  if (firstLineEnd < 0) return text;
  const lastFence = trimmed.lastIndexOf('```');
  if (lastFence <= firstLineEnd) {
    return trimmed.slice(firstLineEnd + 1);
  }
  return trimmed.slice(firstLineEnd + 1, lastFence);
}

function synthesizeFallbackSceneSpec(text: string): SceneSpec {
  const rng = seededRng(text);
  const lower = text.toLowerCase();
  const valence = clamp01(
    0.5 +
      keywordBias(lower, ['hope', 'warm', 'love', 'gentle', 'relief', 'bright', 'calm'], 0.08) -
      keywordBias(lower, ['grief', 'lonely', 'hurt', 'fear', 'dread', 'empty', 'tired'], 0.08) +
      (rng() - 0.5) * 0.2
  );
  const arousal = clamp01(
    0.45 +
      keywordBias(lower, ['rush', 'panic', 'urgent', 'restless', 'fast', 'burn'], 0.1) -
      keywordBias(lower, ['quiet', 'still', 'slow', 'soft', 'rest'], 0.08) +
      (rng() - 0.5) * 0.18
  );
  const fragility = clamp01(
    0.45 +
      keywordBias(lower, ['fragile', 'tender', 'vulnerable', 'break', 'shy'], 0.11) +
      (rng() - 0.5) * 0.2
  );
  const tension = clamp01(
    0.42 +
      keywordBias(lower, ['tense', 'fear', 'pressure', 'stuck', 'anxious'], 0.11) -
      keywordBias(lower, ['ease', 'release', 'accept', 'settled'], 0.08) +
      (rng() - 0.5) * 0.18
  );
  const wonder = clamp01(
    0.5 +
      keywordBias(lower, ['wonder', 'curious', 'dream', 'spark', 'strange'], 0.1) +
      (rng() - 0.5) * 0.2
  );

  const family = pickFamily({ valence, arousal, fragility, tension, wonder }, rng);

  const basePalette = paletteByFamily(family);
  const scene: SceneSpec = {
    mood: { valence, arousal, fragility, tension, wonder },
    morphology: {
      family,
      colonyCount: clamp01(0.28 + arousal * 0.45 + (rng() - 0.5) * 0.2),
      sporeCount: clamp01(0.35 + wonder * 0.3 + tension * 0.2 + (rng() - 0.5) * 0.18),
      shellOpenness: clamp01(0.38 + valence * 0.24 + (1 - tension) * 0.2 + (rng() - 0.5) * 0.2),
      latticeDensity: clamp01(0.4 + tension * 0.28 + (1 - fragility) * 0.22 + (rng() - 0.5) * 0.18),
      filamentLength: clamp01(0.35 + wonder * 0.3 + arousal * 0.15 + (rng() - 0.5) * 0.2),
      branching: clamp01(0.3 + arousal * 0.4 + wonder * 0.2 + (rng() - 0.5) * 0.2),
      asymmetry: clamp01(0.3 + wonder * 0.25 + fragility * 0.2 + (rng() - 0.5) * 0.24),
      stemLength: clamp01(0.32 + (1 - fragility) * 0.22 + (rng() - 0.5) * 0.2),
      droop: clamp01(0.2 + fragility * 0.32 + (1 - arousal) * 0.2 + (rng() - 0.5) * 0.2),
      hollowness: clamp01(0.25 + valence * 0.22 + wonder * 0.18 + (rng() - 0.5) * 0.2),
      scaleVariance: clamp01(0.3 + wonder * 0.3 + arousal * 0.2 + (rng() - 0.5) * 0.24),
      spawnRadius: clamp01(0.3 + arousal * 0.32 + (rng() - 0.5) * 0.2),
      birthStagger: clamp01(0.2 + (1 - arousal) * 0.28 + fragility * 0.2 + (rng() - 0.5) * 0.2),
    },
    motion: {
      drift: clamp01(0.24 + arousal * 0.38 + (rng() - 0.5) * 0.2),
      swirl: clamp01(0.18 + wonder * 0.32 + arousal * 0.18 + (rng() - 0.5) * 0.2),
      pulse: clamp01(0.2 + arousal * 0.4 + tension * 0.14 + (rng() - 0.5) * 0.2),
      collisionSoftness: clamp01(0.45 + fragility * 0.3 + (1 - tension) * 0.15 + (rng() - 0.5) * 0.12),
      cohesion: clamp01(0.34 + (1 - arousal) * 0.18 + (1 - wonder) * 0.2 + (rng() - 0.5) * 0.14),
      scatter: clamp01(0.2 + arousal * 0.3 + wonder * 0.22 + (rng() - 0.5) * 0.18),
      recovery: clamp01(0.35 + (1 - arousal) * 0.22 + (1 - tension) * 0.2 + (rng() - 0.5) * 0.16),
      jitter: clamp01(0.12 + arousal * 0.25 + tension * 0.2 + (rng() - 0.5) * 0.16),
    },
    material: {
      translucency: clamp01(0.36 + valence * 0.22 + fragility * 0.2 + (rng() - 0.5) * 0.14),
      wetness: clamp01(0.34 + fragility * 0.18 + valence * 0.16 + (rng() - 0.5) * 0.14),
      glow: clamp01(0.16 + wonder * 0.32 + valence * 0.16 + (rng() - 0.5) * 0.12),
      grain: clamp01(0.24 + tension * 0.3 + (1 - valence) * 0.16 + (rng() - 0.5) * 0.16),
      palette: basePalette,
    },
    interaction: {
      pointerResponse: arousal > 0.66 ? 'repel-burst' : wonder > 0.62 ? 'follow' : valence > 0.65 ? 'attract' : 'repel-soft',
      pointerStrength: clamp01(0.35 + arousal * 0.32 + (rng() - 0.5) * 0.14),
      pointerRadius: clamp01(0.32 + wonder * 0.22 + (rng() - 0.5) * 0.14),
      pointerRecovery: clamp01(0.38 + (1 - arousal) * 0.28 + (rng() - 0.5) * 0.14),
    },
    rationale: 'Fallback synthesis from local deterministic scene mapper.',
  };

  try {
    return normalizeSceneSpec(scene, { strict: true });
  } catch {
    return DEFAULT_SCENE_SPEC;
  }
}

function keywordBias(text: string, words: string[], amount: number): number {
  let score = 0;
  for (const word of words) {
    if (text.includes(word)) score += amount;
  }
  return score;
}

function pickFamily(
  mood: { valence: number; arousal: number; fragility: number; tension: number; wonder: number },
  rng: () => number
): SceneSpec['morphology']['family'] {
  const scores: Array<{ family: SceneSpec['morphology']['family']; score: number }> = [
    { family: 'metatrichia', score: mood.tension * 0.8 + (1 - mood.valence) * 0.6 + rng() * 0.2 },
    { family: 'physarum', score: mood.arousal * 0.8 + mood.tension * 0.5 + rng() * 0.2 },
    { family: 'cribraria', score: (1 - mood.arousal) * 0.6 + (1 - mood.wonder) * 0.3 + rng() * 0.2 },
    { family: 'chlorociboria', score: mood.valence * 0.6 + (1 - mood.tension) * 0.5 + rng() * 0.2 },
    { family: 'badhamia', score: mood.wonder * 0.8 + mood.arousal * 0.4 + rng() * 0.2 },
    { family: 'colloderma', score: mood.fragility * 0.8 + (1 - mood.arousal) * 0.4 + rng() * 0.2 },
  ];
  scores.sort((a, b) => b.score - a.score);
  return scores[0].family;
}

function paletteByFamily(family: SceneSpec['morphology']['family']): string[] {
  switch (family) {
    case 'metatrichia':
      return ['#2E2A2A', '#5A3030', '#8B4A44', '#C8A38A'];
    case 'physarum':
      return ['#D0B25D', '#A08C3D', '#6D7A45', '#E7D9A0'];
    case 'cribraria':
      return ['#6A5A45', '#A77452', '#D9AF83', '#F2D7B4'];
    case 'chlorociboria':
      return ['#2D6F67', '#4D9B8F', '#88C4B4', '#D7E7DC'];
    case 'badhamia':
      return ['#5C4B7A', '#8661A9', '#C38ED9', '#E9D9F2'];
    case 'colloderma':
      return ['#CFCAC3', '#E4DED8', '#F4F1ED', '#B8C5C6'];
    default:
      return DEFAULT_SCENE_SPEC.material.palette;
  }
}

function seededRng(seedText: string): () => number {
  let state = hashText(seedText) || 1;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function hashText(text: string): number {
  let h = 1779033703 ^ text.length;
  for (let i = 0; i < text.length; i++) {
    h = Math.imul(h ^ text.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^ (h >>> 16)) >>> 0;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function json(payload: unknown, status: number, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json', ...extraHeaders },
  });
}
