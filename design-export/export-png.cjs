/* Drive headless Chromium to render every specimen to a transparent PNG. */
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, 'png');
const CELL_PX = 30; // export resolution per pixel cell

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto('file://' + path.join(__dirname, 'exporter.html'));
  await page.waitForFunction(() => !!window.Mycelium);

  const items = await page.evaluate(() => window.Mycelium.manifest());
  console.log('specimens:', items.length);

  let n = 0;
  for (const it of items) {
    const dataUrl = await page.evaluate(
      (a) => window.Mycelium.renderPNG(a.id, window.Mycelium.clusterById(a.cluster), a.overrides, a.cell),
      { id: it.id, cluster: it.cluster, overrides: it.overrides, cell: CELL_PX }
    );
    const file = path.join(OUT, it.name + '.png');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, Buffer.from(dataUrl.split(',')[1], 'base64'));
    n++;
  }
  console.log('wrote', n, 'PNGs to', OUT);
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
