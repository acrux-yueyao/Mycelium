/**
 * KioskInvite — the field kiosk's doorway, grown from the field itself.
 *
 * No card, no words: the QR code is rendered as a swarm of shimmering
 * pale motes (same night palette as the dither field) over a soft void
 * that melts into the black. Phone cameras read inverted codes fine as
 * long as the quiet zone stays clean and contrast stays high, so the
 * shimmer floor is kept bright enough to scan.
 */
import { useEffect, useRef } from 'react';

// 29x29 module matrix for https://mycelium.yueyao.design/ (error level M),
// pre-generated so we ship no QR library.
const QR = [
  '11111110100101111011101111111',
  '10000010010100110110101000001',
  '10111010001000011001001011101',
  '10111010000111010100001011101',
  '10111010100010101111101011101',
  '10000010111001011010101000001',
  '11111110101010101010101111111',
  '00000000010110011000000000000',
  '01111111000101001101100110001',
  '01001001110010010011111110101',
  '00010111000101000000111111000',
  '01010001011010101000111011010',
  '00100111000000101100110101111',
  '00101001111111110011111011001',
  '11110011100001001100101100000',
  '10100000001001010000101011011',
  '10011010001010110101010001101',
  '11011101011001110111111111011',
  '10011011010000110000001111000',
  '10110000110111110010101001001',
  '10000111101010010100111110101',
  '00000000111101101110100011011',
  '11111110101100011101101010010',
  '10000010110100011011100011000',
  '10111010101110110110111111101',
  '10111010101101110111110101000',
  '10111010101110011011111111010',
  '10000010100110101000101011010',
  '11111110001111001101011011100',
];

// the field's night dust, brightened to scanning luminance: moss, haze
// blue, honey, lilac, cream — so the code reads as congregated particles
const TINTS = [
  '178,204,146', // moss green
  '154,180,214', // haze blue
  '224,190,132', // honey
  '196,172,216', // lilac
  '226,225,214', // cream
  '150,210,190', // pale teal
];

const N = QR.length;
const CELL = 5;            // px per module
const PAD = CELL * 4;      // quiet zone — the spec's 4 modules, kept as calm void
const SIZE = N * CELL + PAD * 2;

export function KioskInvite() {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    cv.width = SIZE;
    cv.height = SIZE;
    const g = cv.getContext('2d');
    if (!g) return;
    let raf = 0;
    let last = -Infinity;
    const draw = (t: number) => {
      if (t - last < 120) return; // ~8fps is plenty for a shimmer
      last = t;
      g.clearRect(0, 0, SIZE, SIZE);
      // a soft dark pool the code floats in; edges dissolve into the field
      const grad = g.createRadialGradient(
        SIZE / 2, SIZE / 2, SIZE * 0.28,
        SIZE / 2, SIZE / 2, SIZE * 0.66,
      );
      grad.addColorStop(0, 'rgba(6,6,5,0.94)');
      grad.addColorStop(1, 'rgba(6,6,5,0)');
      g.fillStyle = grad;
      g.fillRect(0, 0, SIZE, SIZE);
      // modules shimmer like the field's coloured dust: each keeps a stable
      // hue from the night palette (all bright enough that a camera's
      // luminance threshold still separates them from the black)
      const s = t * 0.0011;
      for (let y = 0; y < N; y++) {
        const row = QR[y];
        for (let x = 0; x < N; x++) {
          if (row[x] !== '1') continue;
          const a = 0.82 + 0.13 * Math.sin(s + x * 1.7 + y * 2.3);
          g.fillStyle = `rgba(${TINTS[(x * 7 + y * 13) % TINTS.length]},${a.toFixed(2)})`;
          g.fillRect(PAD + x * CELL, PAD + y * CELL, CELL - 1, CELL - 1);
        }
      }
    };
    // paint the first frame synchronously — rAF stalls in hidden tabs,
    // and the code must exist the instant the page does
    draw(performance.now());
    const tick = (t: number) => { raf = requestAnimationFrame(tick); draw(t); };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return <canvas ref={ref} className="kiosk-invite" aria-label="QR: leave a whisper" />;
}
