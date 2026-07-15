/**
 * Pulse API — the aggregate "climate" of the colony, for the physical
 * cultivation installation.
 *
 * The offline装置 (a sealed chamber growing live fungus) polls this endpoint
 * on a fixed cadence (a Raspberry Pi every N seconds) and turns the numbers
 * into environment targets: mist cadence, grow-light hue, air exchange, and
 * discrete feeding pulses. It is a pure read over the same Redis the web app
 * already writes — no new data is persisted here.
 *
 *   GET /api/pulse → {
 *     population, growthPerHour, familyCounts[6], dominantFamily, dominantHue,
 *     meanIntensity, meanAgitation, meanDensity, lonelyShare, recentWhispers,
 *     latestWhisper: { charId, intensity, tintHue, at } | null,
 *     configured, count
 *   }
 *
 * If the Upstash env vars are absent the endpoint degrades to a zeroed pulse
 * so the controller keeps a safe baseline rather than erroring.
 *
 * Runtime: Edge (mirrors api/creatures.ts).
 */
export const config = { runtime: 'edge' };

const LIST_KEY = 'mycelium:creatures';
const POP_KEY = 'mycelium:population';
const LIST_CAP = 499; // read the most recent 500 (matches api/creatures.ts)

/** Canonical grow-light hue per emotion family (see src/data/characters.ts):
 *  0 tender · 1 calm · 2 curious · 3 dreamy · 4 companion · 5 lonely. */
const FAMILY_HUE = [24, 205, 32, 268, 158, 222];

const HOUR_MS = 60 * 60 * 1000;
const RECENT_MS = 5 * 60 * 1000; // "just whispered" window for feeding pulses

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

function json(obj: unknown, status: number): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}

interface Creature {
  charId?: number;
  intensity?: number;
  bornAt?: number;
  morphology?: { agitation?: number; density?: number; tintHue?: number };
}

/** A zeroed pulse — the safe baseline the controller falls back to. */
function emptyPulse(configured: boolean, extra?: Record<string, unknown>): Response {
  return json({
    population: 0,
    growthPerHour: 0,
    familyCounts: [0, 0, 0, 0, 0, 0],
    dominantFamily: 0,
    dominantHue: FAMILY_HUE[0],
    meanIntensity: 0,
    meanAgitation: 0,
    meanDensity: 0,
    lonelyShare: 0,
    recentWhispers: 0,
    latestWhisper: null,
    configured,
    count: 0,
    ...extra,
  }, 200);
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'GET') return json({ error: 'method-not-allowed' }, 405);

  const { url, token } = env();
  if (!url || !token) return emptyPulse(false);

  let list: unknown, pop: unknown;
  try {
    [list, pop] = await pipeline([
      ['LRANGE', LIST_KEY, '0', String(LIST_CAP)],
      ['GET', POP_KEY],
    ]);
  } catch (e) {
    return emptyPulse(true, { error: String(e) });
  }

  const creatures: Creature[] = ((list as string[]) || [])
    .map((s) => { try { return JSON.parse(s) as Creature; } catch { return null; } })
    .filter((c): c is Creature => c != null);

  const count = creatures.length;
  const population = Number(pop) || count;
  if (count === 0) return emptyPulse(true, { population });

  const familyCounts = [0, 0, 0, 0, 0, 0];
  let sumIntensity = 0, sumAgitation = 0, sumDensity = 0;
  const now = Date.now();
  let growthPerHour = 0, recentWhispers = 0;
  let latest: Creature | null = null;

  for (const c of creatures) {
    const fam = Number(c.charId);
    if (fam >= 0 && fam <= 5) familyCounts[fam]++;
    sumIntensity += clamp01(c.intensity);
    sumAgitation += clamp01(c.morphology?.agitation);
    sumDensity += clamp01(c.morphology?.density);
    const born = Number(c.bornAt);
    if (Number.isFinite(born)) {
      if (now - born <= HOUR_MS) growthPerHour++;
      if (now - born <= RECENT_MS) recentWhispers++;
      if (!latest || born > Number(latest.bornAt)) latest = c;
    }
  }

  // dominant family = the most common charId (ties resolve to the lower id).
  let dominantFamily = 0;
  for (let i = 1; i < 6; i++) if (familyCounts[i] > familyCounts[dominantFamily]) dominantFamily = i;

  const latestHue = latest?.morphology?.tintHue;
  const latestWhisper = latest
    ? {
        charId: Number(latest.charId) || 0,
        intensity: clamp01(latest.intensity),
        tintHue: Number.isFinite(Number(latestHue)) ? Number(latestHue) : FAMILY_HUE[Number(latest.charId) || 0],
        at: Number(latest.bornAt) || 0,
      }
    : null;

  return json({
    population,
    growthPerHour,
    familyCounts,
    dominantFamily,
    dominantHue: FAMILY_HUE[dominantFamily],
    meanIntensity: round3(sumIntensity / count),
    meanAgitation: round3(sumAgitation / count),
    meanDensity: round3(sumDensity / count),
    lonelyShare: round3(familyCounts[5] / count),
    recentWhispers,
    latestWhisper,
    configured: true,
    count,
  }, 200);
}

function clamp01(v: unknown): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return n < 0 ? 0 : n > 1 ? 1 : n;
}
function round3(v: number): number {
  return Math.round(v * 1000) / 1000;
}
