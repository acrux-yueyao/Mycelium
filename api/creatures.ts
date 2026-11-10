/**
 * Creatures API — the cross-user accumulating colony.
 *
 * Backed by Upstash Redis (REST). Every whispered creature is appended
 * to a capped list (rendered as the background ecology) and a lifetime
 * population counter is incremented (the "CURRENT POPULATION" figure).
 * When the next visitor loads, they see everyone's accumulated creatures.
 *
 * The whispered sentence itself is NEVER stored or served. Only the grown
 * shape survives: emotion labels, morphology, name, specimen number, time.
 * POST keeps just the allow-listed fields below (anything else — `text`
 * above all — is dropped before the write), and GET strips `text` again in
 * case an older record still carries one.
 *
 *   GET  /api/creatures → { creatures: FieldCreature[], population: number }
 *   POST /api/creatures  { creature: FieldCreature } → { ok, population }
 *
 * If the Upstash env vars are absent the endpoint degrades gracefully to
 * an empty colony so the app still runs (the client falls back to a
 * local demo colony).
 *
 * Runtime: Edge (mirrors api/emotion.ts).
 */
export const config = { runtime: 'edge' };

const LIST_KEY = 'mycelium:creatures';
const POP_KEY = 'mycelium:population';
const LIST_CAP = 499; // keep the most recent 500 for the background

function env() {
  return {
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
  };
}

/** Run an Upstash REST pipeline (array of command arrays). */
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

/** The only fields a stored creature may carry. No sentence, ever. */
const KEEP_FIELDS = [
  'id', 'charId', 'morphology', 'intensity', 'secondaryLabel', 'costume',
  'x', 'y', 'cell', 'name', 'primaryLabel', 'rationale', 'bornAt', 'myc',
] as const;

/** Reduce a creature to its storable shape: allow-listed keys only, `text` gone. */
export function sanitizeCreature(input: unknown): Record<string, unknown> | null {
  if (!input || typeof input !== 'object') return null;
  const src = input as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const k of KEEP_FIELDS) if (src[k] !== undefined) out[k] = src[k];
  if (typeof out.id !== 'string' || typeof out.charId !== 'number') return null;
  return out;
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
    if (!url || !token) return json({ creatures: [], population: 0, configured: false }, 200);
    try {
      const [list, pop] = await pipeline([
        ['LRANGE', LIST_KEY, '0', String(LIST_CAP)],
        ['GET', POP_KEY],
      ]);
      const creatures = ((list as string[]) || [])
        .map((s) => { try { return sanitizeCreature(JSON.parse(s)); } catch { return null; } })
        .filter(Boolean);
      return json({ creatures, population: Number(pop) || creatures.length, configured: true }, 200);
    } catch (e) {
      return json({ creatures: [], population: 0, error: String(e) }, 200);
    }
  }

  if (req.method === 'POST') {
    if (!url || !token) return json({ ok: false, error: 'not-configured' }, 200);
    let body: { creature?: unknown };
    try { body = await req.json(); } catch { return json({ ok: false, error: 'bad-body' }, 400); }
    const creature = sanitizeCreature(body.creature);
    if (!creature) return json({ ok: false, error: 'bad-creature' }, 400);
    const value = JSON.stringify(creature);
    if (value.length > 4000) return json({ ok: false, error: 'too-large' }, 400);
    try {
      const [, , pop] = await pipeline([
        ['LPUSH', LIST_KEY, value],
        ['LTRIM', LIST_KEY, '0', String(LIST_CAP)],
        ['INCR', POP_KEY],
      ]);
      return json({ ok: true, population: Number(pop) || 0 }, 200);
    } catch (e) {
      return json({ ok: false, error: String(e) }, 200);
    }
  }

  return json({ error: 'method-not-allowed' }, 405);
}
