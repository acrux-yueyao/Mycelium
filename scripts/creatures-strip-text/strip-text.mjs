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
 * number people saw on their card does not change once the sentence is gone. A stored rationale
 * that restates its sentence (the whole of it, or 3 consecutive words / characters) is dropped too.
 * The logic lives in ./plan.mjs.
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
import { LIST_KEY, POP_KEY, planFor, stillWithText, evalArgs } from './plan.mjs';

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
  const [list, population] = await upstash([['LRANGE', LIST_KEY, '0', '-1'], ['GET', POP_KEY]]);
  const raws = list || [];
  const { plan, counts } = planFor(raws);

  console.log(`records in ${LIST_KEY}: ${counts.total}   (population counter: ${population ?? '—'})`);
  console.log(`  carrying a \`text\` field: ${plan.length}   (${counts.withSentence} with a sentence, ${counts.emptyTextField} empty)`);
  console.log(`  already clean: ${counts.clean}   unparseable: ${counts.unparseable}`);
  console.log(`  specimen numbers (myc) to fix from the sentence before dropping it: ${counts.mycAdded}`);
  console.log(`  rationales that restate their sentence, dropped with it: ${counts.rationaleDropped}`);
  if (!plan.length) { console.log('nothing to change.'); return; }
  if (!apply) { console.log(`\ndry run — nothing written. Re-run with --apply to rewrite ${plan.length} record(s).`); return; }

  const bp = backupPath();
  fs.mkdirSync(path.dirname(bp), { recursive: true });
  fs.writeFileSync(bp, JSON.stringify({ exportedAt: new Date().toISOString(), key: LIST_KEY, population, raw: raws }, null, 1));
  const back = JSON.parse(fs.readFileSync(bp, 'utf8'));
  if (back.raw.length !== raws.length) { console.error('备份校验失败,中止。'); process.exit(1); }
  console.log(`\nbackup written (${raws.length} raw records, NOT in the repo): ${bp}`);

  let changed;
  try {
    [changed] = await upstash([evalArgs(plan)]);
  } catch (e) {
    console.error(`rewrite aborted, nothing changed: ${e.message}\n(a new creature probably arrived mid-run — just re-run the script)`);
    process.exit(2);
  }
  console.log(`rewrote ${changed} record(s).`);

  const [after] = await upstash([['LRANGE', LIST_KEY, '0', '-1']]);
  const still = stillWithText(after || []);
  console.log(`verify: ${after?.length ?? 0} records, ${still} still carrying \`text\` ${still === 0 ? '✓' : '✗ (re-run)'}`);
  if (still) process.exit(3);
}

main().catch((e) => { console.error(e); process.exit(1); });
