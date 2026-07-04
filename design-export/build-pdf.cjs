/* Build the design-spec PDF via headless Chromium.
 * Embeds a curated selection of the generated specimen PNGs. */
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs = require('fs');
const path = require('path');

const PNG = path.join(__dirname, 'png');
const b64 = (rel) => 'data:image/png;base64,' + fs.readFileSync(path.join(PNG, rel)).toString('base64');

// curated picks for the doc
const families = ['tender', 'calm', 'curious', 'dreamy', 'companion', 'lonely'];
const familyMeta = {
  tender:    { cn: '温柔 · 暖桃',   emo: 'tender · nostalgic · soft',     hue: '#E39A6F' },
  calm:      { cn: '平静 · 冷蓝',   emo: 'calm · clear · empty',          hue: '#6FA6C4' },
  curious:   { cn: '好奇 · 橙',     emo: 'curious · playful · clumsy',    hue: '#E39A55' },
  dreamy:    { cn: '梦幻 · 薰衣草', emo: 'dreamy · excited · romantic',   hue: '#9B84D6' },
  companion: { cn: '陪伴 · 薄荷',   emo: 'companion · social · attached', hue: '#5FC0A0' },
  lonely:    { cn: '孤独 · 冷灰',   emo: 'lonely · restrained · quiet',   hue: '#8189A6' },
};
const intens = ['015', '031', '047', '063', '079', '095'];

const wallImgs = fs.readdirSync(path.join(PNG, 'wall')).sort().map((f) => b64('wall/' + f));

const familyRows = families.map((fam) => {
  const m = familyMeta[fam];
  const cells = intens.map((i) =>
    `<div class="fcell"><img src="${b64('families/' + fam + '_i' + i + '.png')}"><span class="icap">i·0.${i.slice(0,2)}</span></div>`
  ).join('');
  return `<div class="frow">
    <div class="fmeta">
      <div class="fname"><span class="sw" style="background:${m.hue}"></span>${fam}</div>
      <div class="fcn">${m.cn}</div>
      <div class="femo">${m.emo}</div>
    </div>
    <div class="fstrip">${cells}</div>
  </div>`;
}).join('');

const wallGrid = wallImgs.map((d) => `<img class="wimg" src="${d}">`).join('');

const html = `<!doctype html><html lang="zh"><head><meta charset="utf-8">
<style>
  @page { size: A4; margin: 16mm 15mm; }
  * { box-sizing: border-box; }
  html,body { margin:0; padding:0; }
  body {
    font-family: -apple-system, "Segoe UI", "Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif;
    color: #3A322A; line-height: 1.62; font-size: 10.5pt;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  .cover { page-break-after: always; padding-top: 28mm; }
  .kick { font-family: ui-monospace,"SF Mono",monospace; font-size: 9pt; letter-spacing: .28em; text-transform: uppercase; color: #C67A4E; margin-bottom: 12mm; }
  h1 { font-size: 30pt; line-height: 1.05; margin: 0 0 6mm; letter-spacing:-.01em; }
  .sub { font-size: 12pt; color: #6E6153; max-width: 52ch; margin: 0 0 16mm; }
  .cover-wall { display:grid; grid-template-columns: repeat(8, 1fr); gap: 3mm; align-items:end; }
  .cover-wall img { width:100%; image-rendering: pixelated; }
  .meta-line { margin-top: 14mm; font-family: ui-monospace,monospace; font-size: 8.5pt; color:#9A8B78; letter-spacing:.04em; }

  h2 { font-size: 15pt; margin: 0 0 2mm; letter-spacing:-.01em; }
  .lead { color:#6E6153; margin: 0 0 6mm; max-width: 62ch; font-size: 10pt; }
  .rule { height:.4mm; background:#E4D9C4; border:0; margin: 3mm 0 6mm; }
  section { page-break-inside: avoid; margin-bottom: 10mm; }
  .sechead { border-left: 1.2mm solid #C67A4E; padding-left: 4mm; margin-bottom: 5mm; }

  .frow { display:grid; grid-template-columns: 34mm 1fr; gap: 5mm; align-items:center; padding: 3mm 0; border-bottom:.3mm solid #EFE7D6; page-break-inside: avoid; }
  .fmeta .fname { font-weight:600; font-size:11pt; display:flex; align-items:center; gap:2mm; }
  .sw { width:3mm; height:3mm; border-radius:1mm; display:inline-block; box-shadow: inset 0 0 0 .3mm rgba(0,0,0,.15); }
  .fmeta .fcn { font-size:8.5pt; color:#9A8B78; margin-top:1mm; }
  .fmeta .femo { font-family: ui-monospace,monospace; font-size:7.5pt; color:#6E6153; margin-top:.5mm; }
  .fstrip { display:grid; grid-template-columns: repeat(6,1fr); gap:2mm; align-items:end; }
  .fcell { display:flex; flex-direction:column; align-items:center; }
  .fcell img { width:100%; max-width:20mm; image-rendering:pixelated; }
  .icap { font-family: ui-monospace,monospace; font-size:6.5pt; color:#B0A188; margin-top:1mm; }

  .specrow { display:grid; grid-template-columns: 1fr 1fr; gap:8mm; }
  .card { background:#FAF5EA; border:.3mm solid #E4D9C4; border-radius:3mm; padding:5mm; }
  .card h3 { margin:0 0 2mm; font-size:11pt; }
  .card p { margin:0; font-size:9pt; color:#6E6153; }
  ul.spec { margin: 2mm 0 0; padding-left: 5mm; font-size:9pt; color:#4A4033; }
  ul.spec li { margin-bottom:1.5mm; }
  code { font-family: ui-monospace,monospace; font-size:8.5pt; background:#F0E8D8; padding:.3mm 1.2mm; border-radius:1mm; color:#8A5A34; }

  .hybrid-demo { display:flex; align-items:center; gap:8mm; justify-content:center; margin:4mm 0; }
  .hybrid-demo img { width:30mm; image-rendering:pixelated; }
  .arr { font-family:ui-monospace,monospace; color:#B0A188; font-size:16pt; }
  .cap2 { text-align:center; font-family:ui-monospace,monospace; font-size:7.5pt; color:#9A8B78; margin-top:2mm; }

  .foot { margin-top: 8mm; font-family: ui-monospace,monospace; font-size:7.5pt; color:#9A8B78; line-height:1.7; border-top:.3mm solid #E4D9C4; padding-top:4mm; }
</style></head>
<body>

  <div class="cover">
    <div class="kick">Mycelium · Visual Identity Spec</div>
    <h1>像素孢子 · 视觉形象设计说明</h1>
    <p class="sub">每一次匿名倾诉都长出一只独一无二的像素孢子 —— 形状、色板、锐利度全部由这句话的情绪读数<strong>程序化生成</strong>，不使用手绘贴图，也不调用图像生成模型。同一句话永远长出同一只。</p>
    <div class="cover-wall">${wallGrid}</div>
    <div class="meta-line">40 specimens · 6 emotion palette families · deterministic (xmur3 + LCG) · transparent PNG export</div>
  </div>

  <section>
    <div class="sechead"><h2>1 · 生成原理</h2></div>
    <p class="lead">一句话经情绪模型解析出情绪标签、强度、以及六维形态参数；生成器用「句子的确定性种子」驱动一条随机流，一次性长出整只孢子。渲染路径零随机 —— 所以同句永远同形。</p>
    <div class="specrow">
      <div class="card"><h3>输入 → 参数</h3>
        <ul class="spec">
          <li><code>label</code> 情绪标签 → 决定 6 个<b>色板家族</b>之一</li>
          <li><code>intensity</code> 强度 → 色板从近单色渐变拉宽到彩虹</li>
          <li><code>density</code> 密度 → 像素填充率 + 整体锐利/模糊</li>
          <li><code>tintHue</code> → 注入副色相，让同家族不雷同</li>
          <li><code>secondary</code> 次情绪 → 混入一个 accent 色</li>
        </ul>
      </div>
      <div class="card"><h3>参数 → 形象</h3>
        <ul class="spec">
          <li><b>轮廓</b>：中轴对称 + 逐行半宽包络 + 边缘抖动；三种原型（宽盖细柄 / 圆头 / 钟形）</li>
          <li><b>上色</b>：竖向条带渐变 + 局部跳色 + 离轴微暗</li>
          <li><b>眼睛</b>：网格里横排两格（一白一黑），黑格滑动扫视</li>
          <li><b>模糊</b>：<code>blur = (1 − density) × 2.4px</code>，低密度飘渺</li>
        </ul>
      </div>
    </div>
  </section>

  <section>
    <div class="sechead"><h2>2 · 六个情绪色板家族</h2></div>
    <p class="lead">情绪标签落进 6 个色板家族之一；每行右侧是同一家族里 6 只不同孢子，强度从左 0.15 递增到右 0.95 —— 低强度近单色，高强度跨彩虹，但同家族的孢子彼此都不同。</p>
    <div class="families">${familyRows}</div>
  </section>

  <section>
    <div class="sechead"><h2>3 · 眼睛 · 双格瞳孔</h2></div>
    <p class="lead">每只眼睛占网格里横排两个整格子（跟身体像素同一套网格）：静止时是干净的「一格白 + 一格黑」，黑格子（瞳孔）在这两格之间左右滑动，形成看向左 / 停顿 / 瞟向右的扫视。正式版会接回「注视附近的孢子」与眨眼。</p>
    <div class="hybrid-demo">
      <div><img src="${b64('families/curious_i063.png')}"><div class="cap2">瞳孔靠左</div></div>
      <div><img src="${b64('families/companion_i063.png')}"><div class="cap2">瞳孔靠右</div></div>
      <div><img src="${b64('families/tender_i047.png')}"><div class="cap2">一白一黑</div></div>
    </div>
  </section>

  <section>
    <div class="sechead"><h2>4 · 杂交演化 · 逐格染色</h2></div>
    <p class="lead">两只孢子持续接触后触发杂交：其中一只的像素从接触侧开始，逐格被染上对方的色板，最终变成「对方色板 + 自己的轮廓」—— 像被一段关系慢慢改变，而不是融成一团。</p>
    <div class="hybrid-demo">
      <div><img src="${b64('hybrid/source_companion.png')}"><div class="cap2">原本（薄荷）</div></div>
      <div class="arr">→</div>
      <div><img src="${b64('hybrid/target_dreamy.png')}"><div class="cap2">色板来源（薰衣草）</div></div>
    </div>
    <p class="lead" style="text-align:center; margin-top:4mm;">左边孢子逐格染色后 → 保留自己的轮廓，换上右边的色板。</p>
  </section>

  <section>
    <div class="sechead"><h2>5 · 确定性</h2></div>
    <p class="lead">形象由「句子 + 情绪标签」经 xmur3 哈希导出种子，再喂给 LCG 随机流。因此同一句话在任何设备、任何时间、刷新多少次，都长出<b>完全相同</b>的孢子 —— 每个人的孢子都是可复现、可认领的。</p>
    <div class="hybrid-demo">
      <div><img src="${b64('determinism/sample_tender.png')}"><div class="cap2">「我今天觉得有点累但还好」</div></div>
      <div class="arr">=</div>
      <div><img src="${b64('determinism/sample_tender.png')}"><div class="cap2">再生成一次 · 完全一致</div></div>
    </div>
  </section>

  <div class="foot">
    Mycelium — 像素孢子视觉形象设计说明 · 本文档所有孢子图均为生成器真实输出（透明底 PNG）· 算法：确定性种子 (xmur3 + LCG) → 轮廓 mask → 色板家族 → 逐格上色 → density 反推模糊。<br>
    附带交付：79 张透明底 PNG（形象墙 40 · 色板家族 36 · 杂交对 2 · 确定性样本 1）。
  </div>

</body></html>`;

const outHtml = path.join(__dirname, 'design-doc.html');
fs.writeFileSync(outHtml, html);

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto('file://' + outHtml, { waitUntil: 'networkidle' });
  await page.pdf({
    path: path.join(__dirname, 'Mycelium-像素孢子-设计说明.pdf'),
    format: 'A4', printBackground: true,
    margin: { top: '0', bottom: '0', left: '0', right: '0' },
  });
  await browser.close();
  console.log('PDF written');
})().catch((e) => { console.error(e); process.exit(1); });
