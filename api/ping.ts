/**
 * Tiny diagnostic Edge function. If `/api/ping` 504s, the problem is
 * Vercel project config (runtime not applied, build output broken,
 * deployment protection, etc.), not anything inside api/emotion.ts.
 */

export const config = { runtime: 'edge' };

export default function handler(): Response {
  return new Response(
    JSON.stringify({ pong: 1, at: new Date().toISOString() }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );
}
