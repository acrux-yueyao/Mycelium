# design-export — 像素孢子视觉形象

程序化像素孢子形象的独立生成器 + 导出管线。这套算法是之后移植进 `src/core/mosaic.ts` 的蓝本，与审定的预览像素级一致。

## 文件

- `generator.js` — 确定性生成器（xmur3 + LCG 种子 → 轮廓 mask → 6 情绪色板家族 → 逐格上色 → density 反推模糊 → 双格眼睛）。`window.Mycelium` API。
- `exporter.html` — 加载 generator.js 供 Chromium 驱动。
- `export-png.cjs` — 用 headless Chromium 把 `manifest()` 里每个孢子渲染为透明底 PNG，输出到 `png/`。
- `build-pdf.cjs` — 生成设计说明 HTML 并用 Chromium 打成 PDF（内联 PNG）。
- `png/` — 79 张透明底 PNG（wall 40 · families 36 · hybrid 2 · determinism 1）。
- `Mycelium-像素孢子-设计说明.pdf` — 设计说明交付物。

## 重新生成

```bash
cd design-export
node export-png.cjs        # → png/*.png
node build-pdf.cjs         # → Mycelium-像素孢子-设计说明.pdf
```

需要全局 playwright（`/opt/node22/lib/node_modules/playwright`）+ 预装 Chromium。

## 说明

- **确定性**：孢子由 `(id, charId)` 经 xmur3 哈希导出种子，同输入永远同形。渲染路径零 `Math.random`。
- **色板家族**：tender/calm/curious/dreamy/companion/lonely，各有基础色相；intensity 决定色板从近单色拉宽到彩虹。
- **眼睛**：网格里横排两格（一白一黑），黑格瞳孔左右滑动扫视。
