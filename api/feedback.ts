/**
 * Feedback API — the end-of-experience user survey.
 *
 * Backed by Upstash Redis (REST), mirroring api/creatures.ts. Each
 * submitted questionnaire is appended to a capped list and a lifetime
 * response counter is incremented.
 *
 *   GET  /api/feedback → { count: number, configured: boolean }
 *   POST /api/feedback  { response: object } → { ok, count }
 *
 * Degrades gracefully to a no-op when the Upstash env vars are absent, so
 * the survey still shows its thank-you state locally.
 *
 * Runtime: Edge (mirrors api/creatures.ts).
 */
export const config = { runtime: 'edge' };

const LIST_KEY = 'mycelium:feedback';
const COUNT_KEY = 'mycelium:feedback:count';
const LIST_CAP = 999; // keep the most recent 1000 responses

function env() {
  return {
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
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

export default async function handler(req: Request): Promise<Response> {
  const { url, token } = env();

  if (req.method === 'GET') {
    if (!url || !token) return json({ count: 0, configured: false }, 200);
    try {
      const [count] = await pipeline([['GET', COUNT_KEY]]);
      return json({ count: Number(count) || 0, configured: true }, 200);
    } catch (e) {
      return json({ count: 0, error: String(e) }, 200);
    }
  }

  if (req.method === 'POST') {
    if (!url || !token) return json({ ok: false, error: 'not-configured' }, 200);
    let body: { response?: unknown };
    try { body = await req.json(); } catch { return json({ ok: false, error: 'bad-body' }, 400); }
    const response = body.response;
    if (!response || typeof response !== 'object') return json({ ok: false, error: 'bad-response' }, 400);
    const value = JSON.stringify(response);
    if (value.length > 4000) return json({ ok: false, error: 'too-large' }, 400);
    try {
      const [, , count] = await pipeline([
        ['LPUSH', LIST_KEY, value],
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
