/**
 * Shared rendering for the feedback export: csv + an A4 print page. Mirrors
 * scripts/feedback-export/export.mjs (the local, offline exporter).
 * Files starting with "_" under api/ are not routes.
 */
export interface FeedbackRecord {
  v: number;
  at: number;
  language?: string;
  text: string;
  softness?: Record<string, number>;
  demo?: { age?: string; transition?: string };
  nickname?: string;
  research?: boolean;
  ph?: string;
}

const TZ = 'America/New_York';
const SCALES = [
  { key: 'bearable', zh: ['更难受了', '更扛得住了'] },
  { key: 'comprehensible', zh: ['更糊涂了', '更看得清了'] },
  { key: 'expressible', zh: ['更说不出', '更说得出了'] },
  { key: 'acceptance', zh: ['想把它推开', '能让它悬着'] },
] as const;
const AGE: Record<string, string> = { '18-29': '18–29', '30+': '30 及以上', na: '不想说' };
const TRANSITION: Record<string, string> = { yes: '是', no: '否', unsure: '说不清' };

const fmt = new Intl.DateTimeFormat('zh-CN', {
  timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
});
const fmtTime = (ms: number) => fmt.format(new Date(ms));
const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string);
const csvCell = (v: unknown) => {
  const s = String(v ?? '');
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function toCsv(recs: FeedbackRecord[]): string {
  const head = ['no', 'time_boston', 'language', 'nickname', 'text', ...SCALES.map((s) => s.key), 'age', 'transition',
    'participant', 'research'];
  const rows = recs.map((r, i) => [i + 1, fmtTime(r.at), r.language, r.nickname, r.text,
    ...SCALES.map((s) => r.softness?.[s.key]), r.demo?.age, r.demo?.transition, r.ph ? r.ph.slice(0, 10) : '',
    r.research ? 'yes' : 'no']);
  return '﻿' + [head, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

function scaleRow(s: (typeof SCALES)[number], v: number | undefined): string {
  const dots = [1, 2, 3, 4, 5, 6, 7].map((n) => `<i class="${n === v ? 'on' : ''}">${n}</i>`).join('');
  return `<div class="sc${v == null ? ' na' : ''}"><span class="a">${s.zh[0]}</span><span class="d">${dots}</span>` +
    `<span class="a r">${s.zh[1]}</span>${v == null ? '<span class="nv">未填</span>' : ''}</div>`;
}

/** recs oldest first. links: extra html shown on screen only (download buttons). */
export function toPrintHtml(recs: FeedbackRecord[], total: number | null, links = ''): string {
  const nth: Record<string, number> = {};
  const cards = recs.map((r, i) => {
    const k = r.ph ? r.ph.slice(0, 10) : null;
    const n = k ? (nth[k] = (nth[k] || 0) + 1) : 0;
    const meta = [r.nickname ? `昵称:${esc(r.nickname)}` : '', r.demo?.age ? `年龄:${AGE[r.demo.age] || esc(r.demo.age)}` : '',
      r.demo?.transition ? `人生过渡中:${TRANSITION[r.demo.transition] || esc(r.demo.transition)}` : '',
      r.language === 'en' ? 'English' : '中文', k ? `参与者 ${k}${n > 1 ? ` · 第 ${n} 段` : ''}` : ''].filter(Boolean);
    return `<article class="card"><header><b>#${i + 1}</b><time>${fmtTime(r.at)}</time></header>
<p class="text">${esc(r.text).replace(/\n/g, '<br>')}</p>
<div class="scales">${SCALES.map((s) => scaleRow(s, r.softness?.[s.key])).join('')}</div>
<footer>${meta.join('<span class="sep">·</span>')}</footer></article>`;
  }).join('\n');
  const avg = SCALES.map((s) => {
    const v = recs.map((r) => r.softness?.[s.key]).filter((x): x is number => Number.isInteger(x));
    return `<tr><td>${s.zh[0]} → ${s.zh[1]}</td><td>${v.length ? (v.reduce((a, b) => a + b, 0) / v.length).toFixed(1) : '—'}</td><td>${v.length}</td></tr>`;
  }).join('');
  const span = recs.length ? `${fmtTime(recs[0].at)} — ${fmtTime(recs[recs.length - 1].at)}` : '—';
  return `<!doctype html><html lang="zh"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex,nofollow"><meta name="referrer" content="no-referrer">
<title>Mycelium 反馈</title><style>
@page { size: A4; margin: 16mm 15mm 18mm; }
* { box-sizing: border-box; }
body { margin: 0; color: #1d1c19; background: #fff; font: 10.5pt/1.55 -apple-system, "PingFang SC", "Noto Sans CJK SC", "Microsoft YaHei", sans-serif; }
.wrap { max-width: 180mm; margin: 0 auto; padding: 8mm 0; }
h1 { font-size: 18pt; margin: 0 0 1mm; letter-spacing: .02em; }
.sub { color: #6b675d; margin: 0 0 5mm; font-size: 9.5pt; }
.tools { display: flex; gap: 8px; flex-wrap: wrap; margin: 0 0 5mm; }
.tools a, .tools button { font: inherit; font-size: 10pt; padding: 6px 12px; border: 1px solid #1d1c19; border-radius: 6px; background: #fff; color: #1d1c19; text-decoration: none; cursor: pointer; }
.tools button { background: #1d1c19; color: #fff; }
table { border-collapse: collapse; width: 100%; margin: 0 0 6mm; font-size: 9.5pt; }
td, th { border-bottom: 1px solid #e3dfd4; padding: 1.4mm 2mm; text-align: left; }
th { color: #6b675d; font-weight: 500; }
td:nth-child(2), td:nth-child(3), th:nth-child(2), th:nth-child(3) { text-align: right; width: 22mm; }
.card { border: 1px solid #d9d4c7; border-radius: 2mm; padding: 4mm 5mm 3.5mm; margin: 0 0 4.5mm; break-inside: avoid; page-break-inside: avoid; }
.card header { display: flex; justify-content: space-between; color: #6b675d; font-size: 9pt; margin-bottom: 1.5mm; }
.card header b { color: #1d1c19; font-size: 10.5pt; }
.text { margin: 0 0 3mm; font-size: 11pt; overflow-wrap: anywhere; }
.scales { display: grid; gap: 1mm; margin-bottom: 2.5mm; }
.sc { display: grid; grid-template-columns: 26mm max-content 30mm 10mm; justify-content: start; align-items: center; gap: 2.5mm; font-size: 8.5pt; color: #4a463e; }
.sc .a:first-child { text-align: right; }
.d { display: flex; gap: 1.2mm; }
.d i { font-style: normal; width: 5mm; height: 5mm; border: 1px solid #bdb7a8; border-radius: 50%; display: grid; place-items: center; font-size: 7pt; color: #9a9485; }
.d i.on { background: #1d1c19; border-color: #1d1c19; color: #fff; font-weight: 700; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.sc.na .d { opacity: .35; } .nv { color: #9a9485; }
footer { color: #6b675d; font-size: 8.5pt; } .sep { margin: 0 1.6mm; color: #c3bdae; }
.empty { color: #6b675d; padding: 10mm 0; text-align: center; }
@media screen { body { background: #f4f2ec; } .wrap { background: #fff; padding: 12mm 14mm; margin: 6mm auto; box-shadow: 0 1px 6px rgba(0,0,0,.08); } }
@media screen and (max-width: 640px) { .wrap { padding: 6mm 5mm; margin: 0; } .sc { grid-template-columns: 20mm max-content; } .sc .r, .nv { display: none; } }
@media print { .tools { display: none; } }
</style></head><body><div class="wrap">
<h1>Mycelium · 观众留下的经历</h1>
<p class="sub">共 ${recs.length} 段${total != null && total !== recs.length ? `(累计提交 ${total})` : ''} · ${span}(波士顿时间)· 导出于 ${fmtTime(Date.now())}</p>
${links ? `<div class="tools">${links}</div>` : ''}
<table><tr><th>写完以后的状态(1–7)</th><th>平均</th><th>人数</th></tr>${avg}</table>
${cards || '<p class="empty">还没有反馈。</p>'}
</div></body></html>`;
}
