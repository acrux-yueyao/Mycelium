/**
 * Feedback export — the stored study responses as a print page, csv or json, read straight from
 * Upstash with the deployment's own credentials (nothing to copy anywhere).
 *
 *   GET /api/feedback-export?key=…               → A4 print page (print / save as PDF)
 *   GET /api/feedback-export?key=…&format=csv    → feedback.csv (Excel-safe UTF-8)
 *   GET /api/feedback-export?key=…&format=json   → raw records, newest first
 *
 * Locked by FEEDBACK_EXPORT_KEY (set it in Vercel → Environment Variables). Unset = the endpoint
 * does not exist (404); wrong key = 401. Read-only. Never cached, never indexed, no referrer.
 */
import { toCsv, toPrintHtml, type FeedbackRecord } from './_feedbackRender';

export const config = { runtime: 'edge' };

const LIST_KEY = 'mycelium:feedback';
const COUNT_KEY = 'mycelium:feedback:count';

const PRIVATE = {
  'cache-control': 'no-store',
  'x-robots-tag': 'noindex, nofollow',
  'referrer-policy': 'no-referrer',
};

function sameKey(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a), y = new TextEncoder().encode(b);
  let d = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) d |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return d === 0;
}

function text(body: string, status: number): Response {
  return new Response(body, { status, headers: { 'content-type': 'text/plain; charset=utf-8', ...PRIVATE } });
}

export default async function handler(req: Request): Promise<Response> {
  const secret = process.env.FEEDBACK_EXPORT_KEY;
  if (!secret) return text('not found', 404);
  if (req.method !== 'GET') return text('method not allowed', 405);
  const q = new URL(req.url).searchParams;
  const key = q.get('key') ?? '';
  if (!sameKey(key, secret)) return text('wrong key · 密码不对', 401);

  const url = process.env.UPSTASH_REDIS_REST_URL, token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return text('database not configured', 500);
  const res = await fetch(`${url}/pipeline`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify([['LRANGE', LIST_KEY, '0', '-1'], ['GET', COUNT_KEY]]),
  });
  if (!res.ok) return text(`upstash ${res.status}`, 502);
  const [list, count] = ((await res.json()) as Array<{ result: unknown }>).map((d) => d.result);
  const recs = ((list as string[] | null) ?? [])
    .map((s) => { try { return JSON.parse(s) as FeedbackRecord; } catch { return null; } })
    .filter((r): r is FeedbackRecord => !!r && typeof r.at === 'number');

  const format = q.get('format');
  const stamp = new Date().toISOString().slice(0, 10);
  if (format === 'json') {
    return new Response(JSON.stringify(recs, null, 1), { headers: {
      'content-type': 'application/json; charset=utf-8',
      'content-disposition': `attachment; filename="mycelium-feedback-${stamp}.json"`, ...PRIVATE } });
  }
  const oldestFirst = [...recs].sort((a, b) => a.at - b.at);
  if (format === 'csv') {
    return new Response(toCsv(oldestFirst), { headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="mycelium-feedback-${stamp}.csv"`, ...PRIVATE } });
  }
  const k = encodeURIComponent(key);
  const links = `<button onclick="print()">打印 / 存成 PDF</button>` +
    `<a href="?key=${k}&format=csv">下载表格 CSV</a><a href="?key=${k}&format=json">下载 JSON</a><a href="?key=${k}">刷新</a>`;
  return new Response(toPrintHtml(oldestFirst, Number(count) || 0, links), {
    headers: { 'content-type': 'text/html; charset=utf-8', ...PRIVATE } });
}
