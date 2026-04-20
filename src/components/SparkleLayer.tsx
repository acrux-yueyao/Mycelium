/**
 * SparkleLayer — ambient scatter of tiny twinkles across the whole
 * stage. Soft warm dots that pulse at different speeds and phases,
 * adding a living, hand-drawn-paper shimmer behind the characters.
 *
 * Non-interactive, pointer-events: none, sits under sprite layer.
 */
import { useEffect, useState } from 'react';

interface Sparkle {
  x: number;     // % of viewport width
  y: number;     // % of viewport height
  r: number;     // px radius
  color: string;
  periodS: number;
  delayS: number;
  peak: number;  // peak opacity
}

const PALETTE = [
  '#F5E7C8',  // warm cream
  '#EED7B0',  // sand
  '#F2D8B3',  // soft peach
  '#E8C9A6',  // dune
  '#F9EEDA',  // warm highlight
  '#D9C9AF',  // edge tone
];

function seedSparkles(count: number, w: number, h: number): Sparkle[] {
  const out: Sparkle[] = [];
  const ratio = w && h ? w / h : 1;
  for (let i = 0; i < count; i++) {
    out.push({
      x: Math.random() * 100,
      // Pack more into the upper 75% so mushroom silhouettes at the
      // bottom don't get covered by glint.
      y: Math.random() * 90 + 5,
      r: 0.6 + Math.random() * 2.6,
      color: PALETTE[Math.floor(Math.random() * PALETTE.length)],
      periodS: 3 + Math.random() * 6,
      delayS: Math.random() * 5,
      peak: 0.25 + Math.random() * 0.5,
    });
  }
  // Silence the unused-ratio warning; keep for future layout tweaks.
  void ratio;
  return out;
}

export function SparkleLayer() {
  const [sparkles, setSparkles] = useState<Sparkle[]>(() =>
    seedSparkles(42, window.innerWidth, window.innerHeight),
  );

  // Re-seed on resize so density adapts. Debounced implicitly by React
  // batching since setState is idempotent.
  useEffect(() => {
    let raf = 0;
    const onResize = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        setSparkles(seedSparkles(42, window.innerWidth, window.innerHeight));
      });
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  return (
    <svg
      className="sparkle-layer"
      width="100%"
      height="100%"
      aria-hidden
      preserveAspectRatio="none"
      viewBox="0 0 100 100"
    >
      {sparkles.map((s, i) => (
        <circle
          key={i}
          cx={s.x}
          cy={s.y}
          r={s.r / 10}   // r is in px but viewBox is 100×100; scale to feel delicate
          fill={s.color}
          style={{
            animation: `sparklePulse ${s.periodS}s ease-in-out ${s.delayS}s infinite`,
            // Set the peak opacity via a CSS variable so the keyframes
            // can use it — keeps each sparkle at its own brightness.
            ['--sparkle-peak' as string]: String(s.peak),
            opacity: 0,
          }}
        />
      ))}
    </svg>
  );
}
