#!/usr/bin/env node
/**
 * One-off: remove the whispered sentence (`text`) from every creature record in Upstash.
 *
 *   node scripts/creatures-strip-text/strip-text.mjs                 → dry run: counts only, changes nothing
 *   node scripts/creatures-strip-text/strip-text.mjs --apply         → back up, then rewrite the records
 *   node scripts/creatures-strip-text/strip-text.mjs --apply --backup /path/outside/repo/creatures-raw.json
 *
 * Why: the site promises that nobody — the author included — can read a whisper; only the grown
 * shape is kept. Until 2026-11 the client posted the sentence along with the shape, so older
 * records carry a `text` field. This script drops it. Before dropping it, each record gets its
 * specimen number (`myc`, MYC-…) computed from the sentence the same way the card did, so the
 * number people saw on their card does not change once the sentence is gone.
 *
 * Safety
 *   - Dry run by default. Prints how many records would change; never prints a sentence.
 *   - `--apply` first writes the complete raw list to a backup file OUTSIDE the repository
 *     (default: ~/mycelium-raw-export/creatures-raw-<timestamp>.json) and refuses a path inside it.
 *   - The rewrite is one atomic Lua EVAL that re-checks every element before LSET, so a whisper
 *     that lands mid-run cannot shift indices under us: it aborts instead, and you re-run.
 *   - Afterwards it re-reads the list and reports how many records still carry `text` (expect 0).
 *   - Population counter and every other key are untouched.
 *
 * Credentials: UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN from the environment, or from
 * .env.local / .env in the repo root (same as scripts/feedback-export).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const LIST_KEY = 'mycelium:creatures';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2);
const apply = args.includes('--apply');
const backupArg = args.includes('--backup') ? args[args.indexOf('--backup') + 1] : null;

function loadEnv() {
  for (const f of ['.env.local', '.env']) {
    const p = path.join(root, f);
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"\n]*)"?\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
    }
  }
}

async function upstash(cmds) {
  const url = process.env.UPSTASH_REDIS_REST_URL, token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    console.error('缺少 UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN。\n' +
      '在仓库根目录运行 `vercel env pull .env.local`,或从 Upstash 控制台复制这两个值写进 .env.local。');
    process.exit(1);
  }
  const res = await fetch(`${url}/pipeline`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(cmds),
  });
  if (!res.ok) { console.error(`Upstash ${res.status}: ${await res.text()}`); process.exit(1); }
  return (await res.json()).map((d) => { if (d.error) throw new Error(d.error); return d.result; });
}

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
function sporeId(c) {
  const h0 = xmur3(c.text || c.id)();
  let tail = '';
  for (let k = 4; k >= 0; k--) tail += B32[(h0 >>> (k * 5)) & 31];
  return `MYC-${FAM_CODE[c.charId] ?? 'X'}${tail}`;
}

/** The stored record without its sentence (and with its number fixed). null = nothing to change. */
function stripped(raw) {
  let c;
  try { c = JSON.parse(raw); } catch { return { skip: 'unparseable' }; }
  if (!c || typeof c !== 'object') return { skip: 'not-an-object' };
  if (!Object.prototype.hasOwnProperty.call(c, 'text')) return { skip: 'clean' };
  const hadSentence = typeof c.text === 'string' && c.text.length > 0;
  if (!c.myc && hadSentence && typeof c.charId === 'number') c.myc = sporeId(c);
  delete c.text;
  return { value: JSON.stringify(c), hadSentence };
}

// Compare-and-set rewrite: ARGV = idx, old, new, idx, old, new, …
const LUA = `
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

function backupPath() {
  const p = path.resolve(backupArg ?? path.join(os.homedir(), 'mycelium-raw-export',
    `creatures-raw-${new Date().toISOString().replace(/[:.]/g, '-')}.json`));
  const rel = path.relative(root, p);
  if (!rel.startsWith('..') && !path.isAbsolute(rel)) {
    console.error(`备份路径在仓库内部 (${p}),拒绝写入。请用 --backup 指定仓库外的路径。`);
    process.exit(1);
  }
  return p;
}

async function main() {
  loadEnv();
  const [list, population] = await upstash([['LRANGE', LIST_KEY, '0', '-1'], ['GET', 'mycelium:population']]);
  const raws = list || [];
  const plan = [];
  const skipped = { clean: 0, unparseable: 0, 'not-an-object': 0 };
  let withSentence = 0, emptyTextField = 0, mycAdded = 0;
  raws.forEach((raw, idx) => {
    const r = stripped(raw);
    if (r.skip) { skipped[r.skip]++; return; }
    if (r.hadSentence) withSentence++; else emptyTextField++;
    if (JSON.parse(r.value).myc && !JSON.parse(raw).myc) mycAdded++;
    plan.push([idx, raw, r.value]);
  });

  console.log(`records in ${LIST_KEY}: ${raws.length}   (population counter: ${population ?? '—'})`);
  console.log(`  carrying a \`text\` field: ${plan.length}   (${withSentence} with a sentence, ${emptyTextField} empty)`);
  console.log(`  already clean: ${skipped.clean}   unparseable: ${skipped.unparseable + skipped['not-an-object']}`);
  console.log(`  specimen numbers (myc) to fix from the sentence before dropping it: ${mycAdded}`);
  if (!plan.length) { console.log('nothing to change.'); return; }
  if (!apply) { console.log(`\ndry run — nothing written. Re-run with --apply to rewrite ${plan.length} record(s).`); return; }

  const bp = backupPath();
  fs.mkdirSync(path.dirname(bp), { recursive: true });
  fs.writeFileSync(bp, JSON.stringify({ exportedAt: new Date().toISOString(), key: LIST_KEY, population, raw: raws }, null, 1));
  const back = JSON.parse(fs.readFileSync(bp, 'utf8'));
  if (back.raw.length !== raws.length) { console.error('备份校验失败,中止。'); process.exit(1); }
  console.log(`\nbackup written (${raws.length} raw records, NOT in the repo): ${bp}`);

  const argv = plan.flatMap(([idx, oldV, newV]) => [String(idx), oldV, newV]);
  let changed;
  try {
    [changed] = await upstash([['EVAL', LUA, '1', LIST_KEY, ...argv]]);
  } catch (e) {
    console.error(`rewrite aborted, nothing changed: ${e.message}\n(a new creature probably arrived mid-run — just re-run the script)`);
    process.exit(2);
  }
  console.log(`rewrote ${changed} record(s).`);

  const [after] = await upstash([['LRANGE', LIST_KEY, '0', '-1']]);
  const still = (after || []).filter((raw) => { try { return Object.prototype.hasOwnProperty.call(JSON.parse(raw), 'text'); } catch { return false; } }).length;
  console.log(`verify: ${after?.length ?? 0} records, ${still} still carrying \`text\` ${still === 0 ? '✓' : '✗ (re-run)'}`);
  if (still) process.exit(3);
}

main().catch((e) => { console.error(e); process.exit(1); });
