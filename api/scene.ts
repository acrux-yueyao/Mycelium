import { normalizeSceneSpec } from '../src/core/scene';

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
    return json({ error: 'llm-bad-json', detail: rawText.slice(0, 800) }, 502);
  }

  try {
    const normalized = normalizeSceneSpec(parsed, { strict: true });
    return json(normalized, 200);
  } catch (error) {
    return json(
      {
        error: 'schema-mismatch',
        detail: String(error),
        raw: parsed,
      },
      502
    );
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

function json(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
