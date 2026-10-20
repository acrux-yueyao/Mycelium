/**
 * shareCard — compose a self-contained specimen card PNG for a creature:
 * the pixel spore rendered big, its name, the whispered sentence, and the
 * survey data. Everything is drawn on one offscreen canvas (reusing the
 * deterministic creature renderer) so it can be saved / shared as an image.
 */
import { creatureSpec, drawMoshCreature } from './fieldRender';
import { scanRecord } from './scanRecord';
import { nameFor } from './names';
import { CHARACTERS } from '../data/characters';
import type { FieldCreature } from '../components/DitherField';
import { costumeFor, halloweenActive, drawCandy } from './halloween';

const W = 1080, H = 1350, PAD = 84;
const CREAM = '#F1F0EB', INK = '#101010', DIM = '#6b6a63', SOFT = '#9d9c93', ACCENT = '#5b4fd0';

function wrap(g: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  // wrap by words, and also hard-break very long CJK runs with no spaces
  const out: string[] = [];
  for (const para of text.split('\n')) {
    let line = '';
    const tokens = para.split(/(\s+)/);
    for (const tok of tokens) {
      let candidate = line + tok;
      if (g.measureText(candidate).width <= maxW) { line = candidate; continue; }
      if (line) { out.push(line.trimEnd()); line = ''; }
      // token itself too long → break char by char
      candidate = tok;
      if (g.measureText(candidate).width <= maxW) { line = candidate; continue; }
      let buf = '';
      for (const ch of candidate) {
        if (g.measureText(buf + ch).width > maxW) { out.push(buf); buf = ch; }
        else buf += ch;
      }
      line = buf;
    }
    out.push(line.trimEnd());
  }
  return out;
}

/** Render the share card and return a PNG data URL. */
export async function renderShareCard(c: FieldCreature): Promise<string> {
  try { await (document as any).fonts?.ready; } catch { /* fonts optional */ }

  const cv = document.createElement('canvas');
  const dpr = 2;
  cv.width = W * dpr; cv.height = H * dpr;
  const g = cv.getContext('2d')!;
  g.scale(dpr, dpr);
  g.imageSmoothingEnabled = false;

  g.fillStyle = CREAM; g.fillRect(0, 0, W, H);
  const hw = halloweenActive();
  if (hw) {
    // Halloween frame: a pixel border of pumpkin orange and night purple,
    // with sweets in the corners
    const s = 14;
    for (let x = 0; x < W; x += s) {
      const c = (x / s) % 2 ? '#ef8526' : '#2a1d38';
      g.fillStyle = c; g.fillRect(x, 0, s, s); g.fillRect(x, H - s, s, s);
    }
    for (let y = 0; y < H; y += s) {
      const c = (y / s) % 2 ? '#2a1d38' : '#ef8526';
      g.fillStyle = c; g.fillRect(0, y, s, s); g.fillRect(W - s, y, s, s);
    }
    drawCandy(g, 46, 46, 6, 0, 0.5); drawCandy(g, W - 46, 46, 6, 1, -0.5);
    drawCandy(g, 46, H - 46, 6, 2, -0.4); drawCandy(g, W - 46, H - 46, 6, 3, 0.4);
  }

  const rec = scanRecord(c.id, c.bornAt ?? Date.now(), 1);
  const name = c.name || nameFor(c.id);
  const family = CHARACTERS[c.charId]?.name ?? '—';

  // top bar
  g.textBaseline = 'alphabetic';
  g.font = '600 20px "JetBrains Mono", monospace';
  g.fillStyle = SOFT;
  g.textAlign = 'left';
  g.fillText('MYCELIUM · THE WHISPER NETWORK', PAD, PAD + 6);
  g.textAlign = 'right';
  g.fillText(`id:${rec.serial}`, W - PAD, PAD + 6);

  // creature — centred, sized to a comfortable block height
  const spec = creatureSpec(c);
  const costume = costumeFor(c);
  const cell = Math.max(6, Math.floor(430 / (spec.rows + (costume ? 4 : 0))));
  const cw = spec.cols * cell, ch = spec.rows * cell;
  const ox = (W - cw) / 2, oy = 168 + (costume ? cell * 4 : 0);
  const gz = 0.5;
  drawMoshCreature(g, spec, ox, oy, cell, c.id, gz, null, false, costume);

  let y = oy + ch + 96;

  // name
  g.textAlign = 'left';
  g.fillStyle = INK;
  g.font = '700 66px "Chakra Petch", "JetBrains Mono", monospace';
  g.fillText(name, PAD, y);
  y += 30;
  g.font = '600 18px "JetBrains Mono", monospace';
  g.fillStyle = SOFT;
  g.fillText('SPECIMEN', PAD, y);
  y += 54;

  // the whispered sentence
  if (c.text) {
    g.fillStyle = INK;
    g.font = '500 34px "JetBrains Mono", monospace';
    for (const line of wrap(g, `“${c.text}”`, W - PAD * 2)) {
      g.fillText(line, PAD, y);
      y += 46;
    }
    y += 20;
  }

  // data rows
  const rows: [string, string][] = [
    ['emotion', c.primaryLabel || family],
    ...(typeof c.intensity === 'number' ? [['intensity', c.intensity.toFixed(2)] as [string, string]] : []),
    ['coordinates', `${rec.lat}  ${rec.lon}`],
    ['logged', `${rec.date} · ${rec.time}`],
  ];
  g.font = '500 26px "JetBrains Mono", monospace';
  for (const [k, v] of rows) {
    g.fillStyle = DIM; g.textAlign = 'left'; g.fillText(k, PAD, y);
    g.fillStyle = INK; g.textAlign = 'right'; g.fillText(v, W - PAD, y);
    y += 42;
  }

  // footer
  g.textAlign = 'left';
  g.fillStyle = ACCENT;
  g.font = '600 20px "JetBrains Mono", monospace';
  g.fillText('the same sentence always grows the same spore', PAD, H - PAD);
  if (hw) {
    // date stamp, slightly askew like a rubber stamp
    g.save();
    g.translate(W - PAD - 150, oy - 40);
    g.rotate(-0.12);
    g.strokeStyle = '#d8661a'; g.lineWidth = 4;
    g.strokeRect(-140, -44, 280, 88);
    g.fillStyle = '#d8661a'; g.textAlign = 'center';
    g.font = '700 30px "JetBrains Mono", monospace';
    g.fillText('HALLOWEEN', 0, -6);
    g.font = '600 24px "JetBrains Mono", monospace';
    g.fillText('2026', 0, 28);
    g.restore();
  }

  return cv.toDataURL('image/png');
}

/** Trigger a browser download of the share card PNG. */
export async function downloadShareCard(c: FieldCreature): Promise<void> {
  const url = await renderShareCard(c);
  const a = document.createElement('a');
  const safe = (c.name || 'spore').replace(/[^\w一-龥-]+/g, '_').slice(0, 40);
  a.href = url;
  a.download = `mycelium-${safe}.png`;
  document.body.appendChild(a);
  a.click();
  a.remove();
}
