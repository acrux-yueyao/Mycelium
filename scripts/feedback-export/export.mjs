#!/usr/bin/env node
/**
 * Export the study feedback ("leave an account") out of Upstash.
 *
 *   node scripts/feedback-export/export.mjs            → feedback-export/ (csv + json + print page)
 *   node scripts/feedback-export/export.mjs --out dir  → somewhere else
 *   node scripts/feedback-export/export.mjs --sample   → made-up entries, to preview the layout
 *
 * Credentials: UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN from the environment, or from
 * .env.local / .env in the repo root (`vercel env pull .env.local` writes them there). Read-only:
 * it only runs LRANGE / GET, nothing is changed or deleted.
 *
 * Writes
 *   feedback.csv         one row per entry, UTF-8 with BOM so Excel / Numbers open Chinese correctly
 *   feedback.json        the raw records, newest first (as stored)
 *   feedback-print.html  A4 pages, one card per entry, oldest first — open it and print (or save PDF)
 * The print page and csv carry no direct identifiers: only the salted participant hash, shortened.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const LIST_KEY = 'mycelium:feedback';
const COUNT_KEY = 'mycelium:feedback:count';
const TZ = 'America/New_York';

const SCALES = [
  { key: 'bearable', zh: ['更难受了', '更扛得住了'], en: ['harder to bear', 'easier to bear'] },
  { key: 'comprehensible', zh: ['更糊涂了', '更看得清了'], en: ['more confused', 'clearer'] },
  { key: 'expressible', zh: ['更说不出', '更说得出了'], en: ['harder to put into words', 'easier to put into words'] },
  { key: 'acceptance', zh: ['想把它推开', '能让它悬着'], en: ['want to push it away', 'can let it stay open'] },
];
const AGE = { '18-29': '18–29', '30+': '30 及以上', na: '不想说' };
const TRANSITION = { yes: '是', no: '否', unsure: '说不清' };

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2);
const outDir = path.resolve(args.includes('--out') ? args[args.indexOf('--out') + 1] : path.join(root, 'feedback-export'));
const sample = args.includes('--sample');

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
      '在仓库根目录运行 `vercel env pull .env.local`,或从 Upstash 控制台复制这两个值设成环境变量。');
    process.exit(1);
  }
  const res = await fetch(`${url}/pipeline`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(cmds),
  });
  if (!res.ok) { console.error(`Upstash ${res.status}: ${await res.text()}`); process.exit(1); }
  return (await res.json()).map((d) => d.result);
}

function sampleRecords() {
  const t0 = Date.parse('2026-10-30T16:00:00Z');
  const texts = [
    '示例:我最近换了城市,很多东西还没有落地。看着那些孢子慢慢长出来,觉得不用急着把它想清楚。',
    'Sample: I keep waiting for the moment when it all makes sense. Writing it down here made it feel smaller, in a good way.',
    '示例:说不上来是什么感觉,有点像松了一口气。\n第二行也会照原样换行。',
  ];
  return texts.map((text, i) => ({
    v: 2, at: t0 + i * 37 * 60000, language: i === 1 ? 'en' : 'zh', text,
    softness: { bearable: 4 + i, comprehensible: 3 + i, expressible: 5, ...(i ? { acceptance: 6 - i } : {}) },
    demo: i === 2 ? {} : { age: i ? '30+' : '18-29', transition: ['yes', 'unsure'][i] },
    ...(i === 0 ? { nickname: '小蘑菇(示例)' } : {}), research: false, ph: i === 2 ? undefined : `sample${i}abcdef0123`,
  }));
}

const fmtTime = (ms) => new Intl.DateTimeFormat('zh-CN', {
  timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
}).format(new Date(ms));
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const csvCell = (v) => { const s = String(v ?? ''); return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

function toCsv(recs) {
  const head = ['no', 'time_boston', 'language', 'nickname', 'text', ...SCALES.map((s) => s.key), 'age', 'transition',
    'participant', 'research'];
  const rows = recs.map((r, i) => [i + 1, fmtTime(r.at), r.language, r.nickname, r.text,
    ...SCALES.map((s) => r.softness?.[s.key]), r.demo?.age, r.demo?.transition, r.ph ? r.ph.slice(0, 10) : '',
    r.research ? 'yes' : 'no']);
  return '﻿' + [head, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

function scaleRow(s, v) {
  const dots = [1, 2, 3, 4, 5, 6, 7].map((n) => `<i class="${n === v ? 'on' : ''}">${n}</i>`).join('');
  return `<div class="sc${v == null ? ' na' : ''}"><span class="a">${s.zh[0]}</span><span class="d">${dots}</span>` +
    `<span class="a r">${s.zh[1]}</span>${v == null ? '<span class="nv">未填</span>' : ''}</div>`;
}

function toHtml(recs, { total, sample: isSample }) {
  const nByPerson = {};
  const cards = recs.map((r, i) => {
    const k = r.ph ? r.ph.slice(0, 10) : null;
    const nth = k ? (nByPerson[k] = (nByPerson[k] || 0) + 1) : 0;
    const meta = [r.nickname ? `昵称:${esc(r.nickname)}` : '', r.demo?.age ? `年龄:${AGE[r.demo.age] || esc(r.demo.age)}` : '',
      r.demo?.transition ? `人生过渡中:${TRANSITION[r.demo.transition] || esc(r.demo.transition)}` : '',
      r.language === 'en' ? 'English' : '中文', k ? `参与者 ${k}${nth > 1 ? ` · 第 ${nth} 段` : ''}` : ''].filter(Boolean);
    return `<article class="card"><header><b>#${i + 1}</b><time>${fmtTime(r.at)}</time></header>
<p class="text">${esc(r.text).replace(/\n/g, '<br>')}</p>
<div class="scales">${SCALES.map((s) => scaleRow(s, r.softness?.[s.key])).join('')}</div>
<footer>${meta.join('<span class="sep">·</span>')}</footer></article>`;
  }).join('\n');
  const avg = SCALES.map((s) => {
    const v = recs.map((r) => r.softness?.[s.key]).filter((x) => Number.isInteger(x));
    return `<td>${s.zh[0]} → ${s.zh[1]}</td><td>${v.length ? (v.reduce((a, b) => a + b, 0) / v.length).toFixed(1) : '—'}</td><td>${v.length}</td>`;
  }).map((c) => `<tr>${c}</tr>`).join('');
  const span = recs.length ? `${fmtTime(recs[0].at)} — ${fmtTime(recs[recs.length - 1].at)}` : '—';
  return `<!doctype html><html lang="zh"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Mycelium 反馈</title><style>
@page { size: A4; margin: 16mm 15mm 18mm; }
* { box-sizing: border-box; }
body { margin: 0; color: #1d1c19; background: #fff; font: 10.5pt/1.55 -apple-system, "PingFang SC", "Noto Sans CJK SC", "Microsoft YaHei", sans-serif; }
.wrap { max-width: 180mm; margin: 0 auto; padding: 8mm 0; }
h1 { font-size: 18pt; margin: 0 0 1mm; letter-spacing: .02em; }
.sub { color: #6b675d; margin: 0 0 5mm; font-size: 9.5pt; }
.sample { border: 1.5px dashed #b4452f; color: #b4452f; padding: 2mm 3mm; margin: 0 0 4mm; font-weight: 600; }
table { border-collapse: collapse; width: 100%; margin: 0 0 6mm; font-size: 9.5pt; }
td, th { border-bottom: 1px solid #e3dfd4; padding: 1.4mm 2mm; text-align: left; }
th { color: #6b675d; font-weight: 500; }
td:nth-child(2), td:nth-child(3), th:nth-child(2), th:nth-child(3) { text-align: right; width: 22mm; }
.card { border: 1px solid #d9d4c7; border-radius: 2mm; padding: 4mm 5mm 3.5mm; margin: 0 0 4.5mm; break-inside: avoid; page-break-inside: avoid; }
.card header { display: flex; justify-content: space-between; color: #6b675d; font-size: 9pt; margin-bottom: 1.5mm; }
.card header b { color: #1d1c19; font-size: 10.5pt; }
.text { margin: 0 0 3mm; font-size: 11pt; white-space: normal; overflow-wrap: anywhere; }
.scales { display: grid; gap: 1mm; margin-bottom: 2.5mm; }
.sc { display: grid; grid-template-columns: 26mm max-content 30mm 10mm; justify-content: start; align-items: center; gap: 2.5mm; font-size: 8.5pt; color: #4a463e; }
.sc .r { text-align: left; } .sc .a:first-child { text-align: right; }
.d { display: flex; gap: 1.2mm; }
.d i { font-style: normal; width: 5mm; height: 5mm; border: 1px solid #bdb7a8; border-radius: 50%; display: grid; place-items: center; font-size: 7pt; color: #9a9485; }
.d i.on { background: #1d1c19; border-color: #1d1c19; color: #fff; font-weight: 700; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.sc.na .d { opacity: .35; } .nv { color: #9a9485; }
footer { color: #6b675d; font-size: 8.5pt; } .sep { margin: 0 1.6mm; color: #c3bdae; }
.empty { color: #6b675d; padding: 10mm 0; text-align: center; }
@media screen { body { background: #f4f2ec; } .wrap { background: #fff; padding: 12mm 14mm; margin: 6mm auto; box-shadow: 0 1px 6px rgba(0,0,0,.08); } }
</style></head><body><div class="wrap">
<h1>Mycelium · 观众留下的经历</h1>
<p class="sub">共 ${recs.length} 段${total != null && total !== recs.length ? `(累计提交 ${total})` : ''} · ${span}(波士顿时间)· 导出于 ${fmtTime(Date.now())}</p>
${isSample ? '<div class="sample">示例数据,仅用来看版式,不是真实反馈。</div>' : ''}
<table><tr><th>写完以后的状态(1–7)</th><th>平均</th><th>人数</th></tr>${avg}</table>
${cards || '<p class="empty">还没有反馈。</p>'}
</div></body></html>`;
}

loadEnv();
let recs, total = null;
if (sample) recs = sampleRecords();
else {
  const [list, count] = await upstash([['LRANGE', LIST_KEY, '0', '-1'], ['GET', COUNT_KEY]]);
  total = Number(count) || 0;
  recs = (list || []).map((s) => { try { return JSON.parse(s); } catch { return null; } }).filter(Boolean);
}
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'feedback.json'), JSON.stringify(recs, null, 1));
const oldestFirst = [...recs].sort((a, b) => a.at - b.at);
fs.writeFileSync(path.join(outDir, 'feedback.csv'), toCsv(oldestFirst));
fs.writeFileSync(path.join(outDir, 'feedback-print.html'), toHtml(oldestFirst, { total, sample }));
console.log(`${recs.length} 条反馈${sample ? '(示例)' : ''} → ${outDir}\n  feedback.csv · feedback.json · feedback-print.html(浏览器打开后打印 / 存成 PDF)`);
