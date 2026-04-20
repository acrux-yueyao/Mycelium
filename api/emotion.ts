/**
 * Emotion API proxy — Vercel Edge function.
 *
 * POST { text: string } → EmotionReading JSON.
 *
 * LLM is a hard dependency; failures return non-2xx with detail. The
 * frontend surfaces a visible failure state — no local fallback.
 *
 * Labels returned by `primary.label` / `secondary.label` are constrained
 * to the 18 tags in src/data/characters.ts so the client can do a direct
 * charId lookup without fuzzy matching.
 */

export const runtime = 'edge';

const MODEL = 'claude-haiku-4-5-20251001';
const API_URL = 'https://api.anthropic.com/v1/messages';

const SYSTEM_PROMPT = `You interpret a single anonymous sentence (Chinese, English, or mixed) written on a screen, and translate it into an emotional reading that will grow a kawaii character on screen in response.

Return ONLY this JSON object (no prose, no markdown fences):

{
  "primary":   { "label": string, "weight": number (0..1) },
  "secondary": { "label": string, "weight": number (0..1) },
  "intensity": number (0..1),
  "rationale": string
}

Field rules:

- \`label\` MUST be exactly one of these 18 tags (grouped by the character they point to):
    warm peach ball        → tender | nostalgic | soft
    soft bubble            → calm | clear | empty
    orange mushroom        → curious | playful | clumsy
    iridescent glitter     → dreamy | excited | romantic
    teal twin-cups         → companion | social | attached
    charcoal shrub         → lonely | restrained | quiet
- \`primary.weight\` and \`secondary.weight\` must each be in [0,1] and sum near 1.0.
- \`intensity\`: 0.2 for faint/muted, 0.5 moderate, 0.8+ acute/overwhelming.
- \`rationale\`: max 18 Chinese characters OR 10 English words. One poetic line, no quote marks, no period.

Interpret the AFFECTIVE CORE of the sentence, not the literal subject.
"我做了茶" is about tea only if the surrounding tone makes it so — otherwise it may be 'quiet' or 'nostalgic'.
Be willing to pick surprising pairings when the text warrants it.`;

interface AnthropicRequest {
  model: string;
  max_tokens: number;
  system: Array<{ type: 'text'; text: string; cache_control?: { type: 'ephemeral' } }>;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') return json({ error: 'method-not-allowed' }, 405);

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return json({ error: 'missing-api-key' }, 500);

  let body: { text?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'invalid-body' }, 400);
  }
  const text = typeof body.text === 'string' ? body.text.trim() : '';
  if (!text || text.length > 500) return json({ error: 'invalid-text' }, 400);

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
        'anthropic-beta': 'prompt-caching-2024-07-31',
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
  try { return JSON.parse(s); } catch { /* empty */ }
  const first = s.indexOf('{');
  const last = s.lastIndexOf('}');
  if (first >= 0 && last > first) {
    try { return JSON.parse(s.slice(first, last + 1)); } catch { /* empty */ }
  }
  return null;
}

function json(obj: unknown, status: number): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
