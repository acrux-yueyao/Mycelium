/**
 * Feedback API — the study questionnaire ("leave an account").
 *
 * Rebuilt against design/irb_feedback_spec.md. Stores, per submission:
 * text (15..4000 chars), softness scales (1–7 ints; bearable /
 * comprehensible / expressible required, acceptance optional), optional
 * nickname + two optional demographic items, language, timestamp, and a
 * salted one-way hash of the browser-generated participant token — the
 * salt lives in the FEEDBACK_HASH_SALT env var, outside the database
 * (IRB §1.7). No direct identifiers: no email/phone/account fields are
 * accepted, no IP is logged. Honeypot submissions ("website" filled)
 * return ok without storing. Partial entries are never stored — this
 * endpoint only ever sees complete submissions.
 *
 * Records carry research: true|false from RESEARCH_ENABLED — keep it
 * unset until the IRB determination; pre-approval records are excluded
 * from the research corpus.
 *
 *   GET  /api/feedback → { count: number, configured: boolean }
 *   POST /api/feedback  { response: {...v2 payload} } → { ok, count }
 *
 * Backed by Upstash Redis (REST); degrades to a no-op without env vars.
 * Runtime: Edge (mirrors api/creatures.ts).
 */
export const config = { runtime: 'edge' };

const LIST_KEY = 'mycelium:feedback';
const COUNT_KEY = 'mycelium:feedback:count';
const LIST_CAP = 4999; // keep the most recent 5000 responses

function env() {
  return {
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
    salt: process.env.FEEDBACK_HASH_SALT,
    research: process.env.RESEARCH_ENABLED === '1',
  };
}

async function pipeline(cmds: unknown[][]): Promise<unknown[]> {
  const { url, token } = env();
  if (!url || !token) throw new Error('upstash-not-configured');
  const res = await fetch(`${url}/pipeline`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(cmds),
  });
  if (!res.ok) throw new Error(`upstash-${res.status}: ${await res.text()}`);
  const data = (await res.json()) as Array<{ result: unknown }>;
  return data.map((d) => d.result);
}

function json(obj: unknown, status: number): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}

/** salted SHA-256, hex — irreversible without the out-of-band salt. */
async function hashToken(token: string, salt: string): Promise<string> {
  const data = new TextEncoder().encode(`${salt}:${token}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const SCALE_KEYS = ['bearable', 'comprehensible', 'expressible', 'acceptance'] as const;

/** Validate + strip a v2 submission down to exactly what may be stored. */
function sanitize(r: Record<string, unknown>):
  | { ok: true; record: Record<string, unknown>; token: string | null; bot: boolean }
  | { ok: false; error: string } {
  if (r.v !== 2) return { ok: false, error: 'bad-version' };
  if (r.consent !== true || r.adult !== true) return { ok: false, error: 'no-consent' };

  const bot = typeof r.website === 'string' && r.website.trim().length > 0;

  const text = typeof r.text === 'string' ? r.text.trim().slice(0, 4000) : '';
  if (text.length < 15) return { ok: false, error: 'text-too-short' };

  const softIn = (r.softness ?? {}) as Record<string, unknown>;
  const softness: Record<string, number> = {};
  for (const k of SCALE_KEYS) {
    const v = softIn[k];
    if (v == null) continue;
    if (!Number.isInteger(v) || (v as number) < 1 || (v as number) > 7) {
      return { ok: false, error: 'bad-scale' };
    }
    softness[k] = v as number;
  }
  for (const k of ['bearable', 'comprehensible', 'expressible']) {
    if (!(k in softness)) return { ok: false, error: 'scales-missing' };
  }

  const demoIn = (r.demo ?? {}) as Record<string, unknown>;
  const demo: Record<string, string> = {};
  if (typeof demoIn.age === 'string' && ['18-29', '30+', 'na'].includes(demoIn.age)) demo.age = demoIn.age;
  if (typeof demoIn.transition === 'string' && ['yes', 'no', 'unsure'].includes(demoIn.transition)) {
    demo.transition = demoIn.transition;
  }

  const record: Record<string, unknown> = {
    v: 2,
    at: Date.now(),
    language: r.language === 'zh' ? 'zh' : 'en',
    text,
    softness,
    demo,
  };
  const nickname = typeof r.nickname === 'string' ? r.nickname.trim().slice(0, 80) : '';
  if (nickname) record.nickname = nickname;

  const token = typeof r.token === 'string' && r.token.length >= 8 ? r.token.slice(0, 64) : null;
  return { ok: true, record, token, bot };
}

export default async function handler(req: Request): Promise<Response> {
  const { url, token: authToken, salt, research } = env();

  if (req.method === 'GET') {
    if (!url || !authToken) return json({ count: 0, configured: false }, 200);
    try {
      const [count] = await pipeline([['GET', COUNT_KEY]]);
      return json({ count: Number(count) || 0, configured: true }, 200);
    } catch (e) {
      return json({ count: 0, error: String(e) }, 200);
    }
  }

  if (req.method === 'POST') {
    let body: { response?: unknown };
    try { body = await req.json(); } catch { return json({ ok: false, error: 'bad-body' }, 400); }
    const response = body.response;
    if (!response || typeof response !== 'object') return json({ ok: false, error: 'bad-response' }, 400);

    const v = sanitize(response as Record<string, unknown>);
    if (!v.ok) return json({ ok: false, error: v.error }, 400);
    if (v.bot) return json({ ok: true, count: 0 }, 200);     // honeypot: accept, drop
    if (!url || !authToken) return json({ ok: false, error: 'not-configured' }, 200);

    v.record.research = research;
    // linking hash only when the salt is configured out-of-band (IRB §1.7)
    if (v.token && salt) v.record.ph = await hashToken(v.token, salt);

    try {
      const [, , count] = await pipeline([
        ['LPUSH', LIST_KEY, JSON.stringify(v.record)],
        ['LTRIM', LIST_KEY, '0', String(LIST_CAP)],
        ['INCR', COUNT_KEY],
      ]);
      return json({ ok: true, count: Number(count) || 0 }, 200);
    } catch (e) {
      return json({ ok: false, error: String(e) }, 200);
    }
  }

  return json({ error: 'method-not-allowed' }, 405);
}
