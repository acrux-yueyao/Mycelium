/**
 * Emotion API proxy — Vercel Edge function style.
 *
 * Contract: POST { text: string } -> EmotionReading JSON matching
 *   src/core/emotion.ts :: EmotionReading.
 *
 * LLM is a hard dependency of the piece. If ANTHROPIC_API_KEY is missing
 * or the upstream call fails, return non-2xx; the frontend surfaces a
 * visible failure state rather than falling back to any heuristic.
 *
 * Uses Claude Haiku 4.5 + prompt caching. The system prompt (species
 * manual + emotion ontology) is cached as a single block; each request
 * pays only for the user turn + the ~50-token JSON response.
 */

export const config = { runtime: 'edge' };

const MODEL = 'claude-haiku-4-5-20251001';
const API_URL = 'https://api.anthropic.com/v1/messages';

const SYSTEM_PROMPT = `You are the interpretive membrane for a biological art piece called Mycelium. A person has written a single sentence anonymously — a private confession, a passing thought, something they might not say aloud. Your task is to translate it into the morphology of a single slime mold or cup fungus that will grow on screen in response.

Return ONLY a JSON object matching this schema (no prose, no markdown):

{
  "primary":   { "label": string, "weight": number (0..1) },
  "secondary": { "label": string, "weight": number (0..1) },
  "intensity": number (0..1),
  "species":   "metatrichia" | "physarum" | "cribraria" | "chlorociboria" | "badhamia" | "colloderma",
  "surfaceModifier": "none" | "pearl-translucency" | "oxidized-copper" | "chartreuse-sheen" | "indigo-bruise" | "ember-warmth",
  "rationale": string (max 24 Chinese chars or 12 English words, poetic, no quotes)
}

Labels are not constrained to basic emotions — use nuanced English words (melancholy, tenderness, restless-hope, quiet-dread, etc.). Primary.weight + secondary.weight should sum near 1.0.

SPECIES MAPPING (primary emotion → species):

- metatrichia (Metatrichia vesparium, dark branching slime mold, near-black to blood red): heavy, oppressed, grief, stuckness, exhaustion, numb sorrow, suffocation.
- physarum (Physarum polycephalum, the classic yellow slime mold with pulsing vascular network): anxiety, tension, restlessness, over-thinking, frayed urgency, scattered energy.
- cribraria (Cribraria aurantiaca, honey-amber lattice globes): structured neutrality, resignation, composure under strain, quiet focus, contemplative stillness.
- chlorociboria (Chlorociboria aeruginascens, teal-green cup fungus): calm, clarity, relief, peace, acceptance, gentle sadness that has settled.
- badhamia (Badhamia utricularis, iridescent purple clusters): curiosity, surprise, wonder, mercurial delight, playful confusion, multi-faceted mood.
- colloderma (Colloderma oculatum, pearl-white translucent jelly): tenderness, vulnerability, fragility, quiet affection, reverence, soft love.

SURFACE MODIFIER (secondary emotion → texture tint):

- pearl-translucency: paired with vulnerability, reverence, soft grief
- oxidized-copper: paired with old pain, nostalgia, rusted longing
- chartreuse-sheen: paired with envy, unease, queasy anticipation
- indigo-bruise: paired with melancholy, deep introspection, night thoughts
- ember-warmth: paired with affection, yearning, banked desire
- none: when secondary emotion doesn't need texture cue

INTENSITY: 0.2 for faint / muted, 0.5 for moderate, 0.8+ for acute / overwhelming.

Interpret the sentence for its *affective core*, not its surface subject. "I made tea" is only about tea if the words around it make it so. Be willing to pick surprising species when the text warrants it — the piece rewards unexpected readings.`;

interface AnthropicRequest {
  model: string;
  max_tokens: number;
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
  if (!text || text.length > 500) {
    return json({ error: 'invalid-text' }, 400);
  }

  const payload: AnthropicRequest = {
    model: MODEL,
    max_tokens: 320,
    system: [
      {
        type: 'text',
        text: SYSTEM_PROMPT,
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [{ role: 'user', content: text }],
  };

  let upstream: Response;
  try {
    upstream = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(payload),
    });
  } catch (e) {
    return json({ error: 'upstream-unreachable', detail: String(e) }, 502);
  }

  if (!upstream.ok) {
    const detail = await upstream.text();
    return json({ error: `upstream-${upstream.status}`, detail }, 502);
  }

  const result = (await upstream.json()) as {
    content?: Array<{ type: string; text?: string }>;
  };
  const textOut = result.content?.find((c) => c.type === 'text')?.text ?? '';
  const parsed = extractJson(textOut);
  if (!parsed) {
    return json({ error: 'llm-bad-json', detail: textOut.slice(0, 500) }, 502);
  }
  return json(parsed, 200);
}

function extractJson(s: string): unknown | null {
  // Try direct parse, then locate first `{...}` block.
  try {
    return JSON.parse(s);
  } catch {
    /* empty */
  }
  const first = s.indexOf('{');
  const last = s.lastIndexOf('}');
  if (first >= 0 && last > first) {
    try {
      return JSON.parse(s.slice(first, last + 1));
    } catch {
      /* empty */
    }
  }
  return null;
}

function json(obj: unknown, status: number): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
