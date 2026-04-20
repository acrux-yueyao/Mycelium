/**
 * Emotion API proxy — Vercel Edge function.
 *
 * POST { text: string } → EmotionReading JSON.
 * GET                    → health check JSON (alive + key-configured).
 *
 * LLM is a hard dependency; failures return non-2xx with detail. The
 * frontend surfaces a visible failure state — no local fallback.
 *
 * Labels returned by `primary.label` / `secondary.label` are constrained
 * to the 18 tags in src/data/characters.ts so the client can do a direct
 * charId lookup without fuzzy matching.
 *
 * Runtime: Edge. Node serverless was tried to lift the 25s cap, but
 * configuring it from a plain Vite api/ file didn't route responses
 * cleanly (frontend hung past 60s with no 504 surfaced), so we're back
 * on Edge with a tighter upstream cap (18s) that always returns a
 * clean JSON error inside the Edge 25s limit.
 */

export const config = { runtime: 'edge' };

const MODEL = 'claude-haiku-4-5-20251001';
const API_URL = 'https://api.anthropic.com/v1/messages';
// Must land inside the Edge 25s hard cap with comfortable headroom so
// we can always return a structured 504 body instead of being killed
// by Vercel and surfacing as a generic FUNCTION_INVOCATION_TIMEOUT.
const UPSTREAM_TIMEOUT_MS = 18_000;

const SYSTEM_PROMPT = `You interpret a single anonymous sentence (Chinese, English, or mixed) written on a screen, and translate it into an emotional reading that will grow a kawaii microbe on screen in response.

Return ONLY this JSON object (no prose, no markdown fences):

{
  "primary":   { "label": string, "weight": number (0..1) },
  "secondary": { "label": string, "weight": number (0..1) },
  "intensity": number (0..1),
  "rationale": string,
  "topic":     "academic" | "relationship" | "self" | "joy" | "other",
  "morphology": {
    "density":      number (0..1),
    "agitation":    number (0..1),
    "tendrilCount": number (3..10, integer),
    "glow":         number (0..1),
    "tintHue":      number (0..359, integer),
    "particles":    boolean
  }
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
- \`topic\`: what the sentence is MOSTLY ABOUT.
    academic     → schoolwork, grades, exams, deadlines, thesis, lab
    relationship → friends, lovers, family, crushes, strangers, pets
    self         → self-doubt, body, identity, memory, loneliness-as-self
    joy          → small delights — food, weather, a good nap, a tiny win
    other        → anything that doesn't fit (existential, world events…)
- \`morphology\`: how the creature should LOOK. Map these dimensions directly — be willing to pick extreme values when the sentence warrants.
    density       1.0 = round & full-bodied (heavy, weary, dense emotion)
                  0.2 = translucent & wispy (lonely, quiet, fading)
    agitation     0.9 = trembling, high-frequency wobble (anxious, panicked)
                  0.1 = still, barely moving (calm, numb, dissociated)
    tendrilCount  3   = spare, sharp (short sentence, few punctuation marks)
                  10  = dense branching (long compound sentence, many commas)
    glow          0.9 = radiant core (warm, grateful, loved)
                  0.1 = dark, no glow (withdrawn, heavy, angry)
    tintHue       academic stress → 230-280 (cool blue/purple)
                  relationship    → 25-55   (amber/warm yellow)
                  self-doubt      → 0/gray  (pick 0 and low saturation via density)
                  joy             → 80-140  (soft green/yellow-green)
                  other           → pick whatever fits the affect
    particles     true when the sentence feels RELEASING or WEIGHTLESS — letting
                  go, floating, laughing-crying. Otherwise false.

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
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const t0 = Date.now();
  console.log('[emotion] handler entry', req.method, new Date(t0).toISOString());

  // GET /api/emotion — open in a browser tab to verify the function
  // is reachable and the API key env var is wired up without having
  // to type into the UI.
  if (req.method === 'GET') {
    return json({
      status: 'alive',
      runtime: 'edge',
      model: MODEL,
      hasApiKey: !!apiKey,
      apiKeyLen: apiKey ? apiKey.length : 0,
      apiKeyPrefix: apiKey ? apiKey.slice(0, 7) : null,
      now: new Date().toISOString(),
    }, 200);
  }

  if (req.method !== 'POST') return json({ error: 'method-not-allowed' }, 405);

  if (!apiKey) {
    console.error('[emotion] ANTHROPIC_API_KEY is not set');
    return json({ error: 'missing-api-key' }, 500);
  }

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
    // Output now includes topic + morphology on top of the original
    // reading, so the old 180 cap was too tight. 300 leaves comfortable
    // headroom for an 18-char rationale plus every schema field.
    max_tokens: 300,
    system: [
      {
        type: 'text',
        text: SYSTEM_PROMPT,
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [{ role: 'user', content: text }],
  };

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), UPSTREAM_TIMEOUT_MS);

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
      signal: ctrl.signal,
    });
  } catch (e) {
    clearTimeout(timer);
    const isAbort = (e as { name?: string })?.name === 'AbortError';
    const error = isAbort ? 'upstream-timeout' : 'upstream-unreachable';
    console.error('[emotion]', error, 'after', Date.now() - t0, 'ms', String(e));
    return json({ error, detail: String(e), elapsedMs: Date.now() - t0 }, 504);
  }
  clearTimeout(timer);
  if (!upstream.ok) {
    const detail = await upstream.text();
    console.error('[emotion] upstream', upstream.status, detail.slice(0, 200));
    return json({ error: `upstream-${upstream.status}`, detail }, 502);
  }

  const result = (await upstream.json()) as {
    content?: Array<{ type: string; text?: string }>;
  };
  const textOut = result.content?.find((c) => c.type === 'text')?.text ?? '';
  const parsed = extractJson(textOut);
  if (!parsed) {
    console.error('[emotion] llm-bad-json', textOut.slice(0, 200));
    return json({ error: 'llm-bad-json', detail: textOut.slice(0, 500) }, 502);
  }
  console.log('[emotion] ok in', Date.now() - t0, 'ms');
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
