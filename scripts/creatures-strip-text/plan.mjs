/**
 * Pure logic for the one-off sentence cleanup (no I/O) — shared by strip-text.mjs and by any
 * server-side run of the same cleanup, so there is exactly one implementation of "what changes".
 */
export const LIST_KEY = 'mycelium:creatures';
export const POP_KEY = 'mycelium:population';

// ---- specimen number: identical to src/core/sporeId.ts + src/core/seed.ts (xmur3) ----
function xmur3(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return function () {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return h >>> 0;
  };
}
const B32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const FAM_CODE = 'TCRDPL';
export function sporeId(c) {
  const h0 = xmur3(c.text || c.id)();
  let tail = '';
  for (let k = 4; k >= 0; k--) tail += B32[(h0 >>> (k * 5)) & 31];
  return `MYC-${FAM_CODE[c.charId] ?? 'X'}${tail}`;
}

// ---- does the stored rationale give the sentence away? identical to api/emotion.ts ----
const CJK = '\\p{Script=Han}\\p{Script=Hiragana}\\p{Script=Katakana}\\p{Script=Hangul}';
const TOKEN = new RegExp(`[${CJK}]|(?:(?![${CJK}])[\\p{L}\\p{N}])+`, 'gu');
const tokens = (s) => String(s).toLowerCase().match(TOKEN) || [];
/** True when the rationale repeats the whole sentence, or any 3 consecutive words / CJK characters of it. */
export function restates(sentence, rationale) {
  const a = tokens(sentence), b = tokens(rationale);
  if (!a.length || !b.length) return false;
  const need = Math.min(a.length, 3);
  let prev = new Array(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    const cur = new Array(b.length + 1).fill(0);
    for (let j = 1; j <= b.length; j++) {
      if (a[i - 1] === b[j - 1]) { cur[j] = prev[j - 1] + 1; if (cur[j] >= need) return true; }
    }
    prev = cur;
  }
  return false;
}

/**
 * The stored record without its sentence: number fixed from the sentence first, and the rationale
 * dropped too when it restates the sentence. `{ skip }` when there is nothing to change.
 */
export function stripped(raw) {
  let c;
  try { c = JSON.parse(raw); } catch { return { skip: 'unparseable' }; }
  if (!c || typeof c !== 'object') return { skip: 'not-an-object' };
  if (!Object.prototype.hasOwnProperty.call(c, 'text')) return { skip: 'clean' };
  const hadSentence = typeof c.text === 'string' && c.text.length > 0;
  let mycAdded = false, rationaleDropped = false;
  if (!c.myc && hadSentence && typeof c.charId === 'number') { c.myc = sporeId(c); mycAdded = true; }
  if (hadSentence && typeof c.rationale === 'string' && restates(c.text, c.rationale)) { delete c.rationale; rationaleDropped = true; }
  delete c.text;
  return { value: JSON.stringify(c), hadSentence, mycAdded, rationaleDropped };
}

/** Plan over the whole list: [[index, oldRaw, newRaw], …] plus counts. Never contains anything to print. */
export function planFor(raws) {
  const plan = [];
  const counts = { total: raws.length, withTextField: 0, withSentence: 0, emptyTextField: 0, clean: 0, unparseable: 0, mycAdded: 0, rationaleDropped: 0 };
  raws.forEach((raw, idx) => {
    const r = stripped(raw);
    if (r.skip) { if (r.skip === 'clean') counts.clean++; else counts.unparseable++; return; }
    counts.withTextField++;
    if (r.hadSentence) counts.withSentence++; else counts.emptyTextField++;
    if (r.mycAdded) counts.mycAdded++;
    if (r.rationaleDropped) counts.rationaleDropped++;
    plan.push([idx, raw, r.value]);
  });
  return { plan, counts };
}

export const stillWithText = (raws) =>
  raws.filter((raw) => { try { return Object.prototype.hasOwnProperty.call(JSON.parse(raw), 'text'); } catch { return false; } }).length;

// Compare-and-set rewrite, atomic: ARGV = idx, old, new, idx, old, new, …
export const LUA = `
local key = KEYS[1]
local n = #ARGV / 3
for j = 0, n - 1 do
  local idx = tonumber(ARGV[j * 3 + 1])
  if redis.call('LINDEX', key, idx) ~= ARGV[j * 3 + 2] then
    return redis.error_reply('changed:' .. idx)
  end
end
for j = 0, n - 1 do
  redis.call('LSET', key, tonumber(ARGV[j * 3 + 1]), ARGV[j * 3 + 3])
end
return n
`;
export const evalArgs = (plan) => ['EVAL', LUA, '1', LIST_KEY, ...plan.flatMap(([idx, oldV, newV]) => [String(idx), oldV, newV])];
