/**
 * Bio API — the return path of the closed loop for the physical installation.
 *
 * The cultivation chamber's controller (Raspberry Pi + ESP32) reads live
 * sensor telemetry off the fungus — chamber humidity/temperature, CO₂,
 * substrate moisture, and a slow mycelium biopotential — and POSTs it here.
 * The web projection then GETs the latest frame and lets the fungus's state
 * modulate the digital colony (breathing rate / glow), closing the loop:
 * whisper → feeds fungus → fungus's biosignal feeds back into the colony.
 *
 *   POST /api/bio  { humidity, temp, co2, substrate, biopotential }
 *        → { ok }                       (server stamps `at` = epoch ms)
 *   GET  /api/bio  → { latest, history[], configured }
 *
 * Degrades gracefully to empty/no-op when Upstash env vars are absent.
 *
 * Runtime: Edge (mirrors api/creatures.ts).
 */
export const config = { runtime: 'edge' };

const BIO_KEY = 'mycelium:bio';
const HIST_CAP = 119; // keep the most recent 120 frames for a short history

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

/** Coerce to a finite number or null (missing sensors are allowed). */
function num(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export default async function handler(req: Request): Promise<Response> {
  const { url, token } = env();

  if (req.method === 'GET') {
    if (!url || !token) return json({ latest: null, history: [], configured: false }, 200);
    try {
      const [hist] = await pipeline([['LRANGE', BIO_KEY, '0', String(HIST_CAP)]]);
      const history = ((hist as string[]) || [])
        .map((s) => { try { return JSON.parse(s); } catch { return null; } })
        .filter(Boolean);
      return json({ latest: history[0] ?? null, history, configured: true }, 200);
    } catch (e) {
      return json({ latest: null, history: [], error: String(e) }, 200);
    }
  }

  if (req.method === 'POST') {
    if (!url || !token) return json({ ok: false, error: 'not-configured' }, 200);
    let body: Record<string, unknown>;
    try { body = (await req.json()) as Record<string, unknown>; } catch { return json({ ok: false, error: 'bad-body' }, 400); }

    const frame = {
      humidity: num(body.humidity),
      temp: num(body.temp),
      co2: num(body.co2),
      substrate: num(body.substrate),
      biopotential: num(body.biopotential),
      at: Date.now(),
    };
    // reject a frame with no usable readings so noise can't fill the buffer.
    if (frame.humidity == null && frame.temp == null && frame.co2 == null &&
        frame.substrate == null && frame.biopotential == null) {
      return json({ ok: false, error: 'no-readings' }, 400);
    }

    const value = JSON.stringify(frame);
    if (value.length > 1000) return json({ ok: false, error: 'too-large' }, 400);
    try {
      await pipeline([
        ['LPUSH', BIO_KEY, value],
        ['LTRIM', BIO_KEY, '0', String(HIST_CAP)],
      ]);
      return json({ ok: true, at: frame.at }, 200);
    } catch (e) {
      return json({ ok: false, error: String(e) }, 200);
    }
  }

  return json({ error: 'method-not-allowed' }, 405);
}
