/**
 * Butterflies — sparse ambient decoration.
 *
 * One butterfly appears every 30-60s (first at 5-15s after mount),
 * flies a gentle S-curve across the viewport over ~12-18s, and
 * self-destructs. Kept simple: at most one in flight at a time so
 * the scene never feels busy.
 *
 * Wings flap via a fast scaleX on the SVG — the body is a thin
 * vertical ellipse centred on the transform origin, so the
 * compression reads as wings folding, not as a whole butterfly
 * shrinking.
 */
import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';

interface WingPalette {
  upper: string;
  lower: string;
  spot: string;
}

const PALETTES: WingPalette[] = [
  { upper: '#F5C7A3', lower: '#E6AE89', spot: '#C98460' }, // peach
  { upper: '#E4C9E6', lower: '#CDB0D4', spot: '#A282B0' }, // lavender
  { upper: '#F5E0A8', lower: '#E8CE8A', spot: '#BFA35A' }, // butter
  { upper: '#CEE3D3', lower: '#B2D3BA', spot: '#7FA68A' }, // mint
];

type Dir = 'ltr' | 'rtl';

interface ButterflySpec {
  id: number;
  palette: WingPalette;
  direction: Dir;
  startY: number;  // vh percentages
  waveY: number;
  midY: number;
  endY: number;
  duration: number;
  size: number;
  flapSpeed: number;
}

function randomSpec(id: number): ButterflySpec {
  const direction: Dir = Math.random() < 0.5 ? 'ltr' : 'rtl';
  // Keep butterflies in the top-to-middle band so they don't
  // cross the input totem too often.
  const startY = 12 + Math.random() * 55;
  const waveY = Math.max(8, startY - 10 + Math.random() * 20);
  const midY = Math.max(8, startY - 5 + Math.random() * 15);
  const endY = Math.max(8, startY - 8 + Math.random() * 20);
  return {
    id,
    palette: PALETTES[Math.floor(Math.random() * PALETTES.length)],
    direction,
    startY,
    waveY,
    midY,
    endY,
    duration: 12 + Math.random() * 6,
    size: 26 + Math.random() * 14,
    flapSpeed: 0.35 + Math.random() * 0.2,
  };
}

export function Butterflies() {
  const [flock, setFlock] = useState<ButterflySpec[]>([]);
  const idRef = useRef(0);

  useEffect(() => {
    let timer: number;
    const schedule = (delay: number) => {
      timer = window.setTimeout(() => {
        idRef.current += 1;
        setFlock((prev) => [...prev, randomSpec(idRef.current)]);
        schedule(30_000 + Math.random() * 30_000);
      }, delay);
    };
    schedule(5_000 + Math.random() * 10_000);
    return () => window.clearTimeout(timer);
  }, []);

  const remove = (id: number) =>
    setFlock((prev) => prev.filter((b) => b.id !== id));

  return (
    <div
      aria-hidden
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 4,
        overflow: 'hidden',
      }}
    >
      {flock.map((b) => (
        <Butterfly key={b.id} spec={b} onDone={() => remove(b.id)} />
      ))}
    </div>
  );
}

function Butterfly({
  spec,
  onDone,
}: {
  spec: ButterflySpec;
  onDone: () => void;
}) {
  // Capture viewport size once on mount — if the window resizes
  // mid-flight the butterfly continues with its original path,
  // which is fine for a 15s animation.
  const [dims] = useState(() => ({
    w: typeof window !== 'undefined' ? window.innerWidth : 1024,
    h: typeof window !== 'undefined' ? window.innerHeight : 768,
  }));
  const { direction, palette, duration, size, flapSpeed } = spec;
  const sign = direction === 'ltr' ? 1 : -1;
  const xStart = direction === 'ltr' ? -90 : dims.w + 90;
  const xMid1 = direction === 'ltr' ? dims.w * 0.32 : dims.w * 0.68;
  const xMid2 = direction === 'ltr' ? dims.w * 0.66 : dims.w * 0.34;
  const xEnd = direction === 'ltr' ? dims.w + 90 : -90;
  const y = (p: number) => (dims.h * p) / 100;

  return (
    <motion.div
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: size,
        height: size,
        pointerEvents: 'none',
        willChange: 'transform',
      }}
      initial={{ x: xStart, y: y(spec.startY), rotate: 0 }}
      animate={{
        x: [xStart, xMid1, xMid2, xEnd],
        y: [y(spec.startY), y(spec.waveY), y(spec.midY), y(spec.endY)],
        rotate: [0, sign * 8, sign * -5, sign * 10],
      }}
      transition={{
        duration,
        ease: 'easeInOut',
        times: [0, 0.33, 0.66, 1],
      }}
      onAnimationComplete={onDone}
    >
      <motion.svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        animate={{ scaleX: [1, 0.35, 1] }}
        transition={{
          duration: flapSpeed,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
        style={{
          display: 'block',
          filter: 'drop-shadow(0 1.5px 1px rgba(90, 70, 45, 0.15))',
          // If heading right-to-left, mirror the sprite so its
          // antennae and rotation tilt match the direction of travel.
          transform: direction === 'rtl' ? 'scaleX(-1)' : undefined,
        }}
      >
        {/* body */}
        <ellipse cx="12" cy="12" rx="0.6" ry="4" fill="#4A4034" />
        {/* antennae */}
        <path
          d="M11.5 8 C11 6 10 5.4 9 5.8"
          stroke="#4A4034"
          strokeWidth="0.5"
          fill="none"
          strokeLinecap="round"
        />
        <path
          d="M12.5 8 C13 6 14 5.4 15 5.8"
          stroke="#4A4034"
          strokeWidth="0.5"
          fill="none"
          strokeLinecap="round"
        />
        {/* upper wings */}
        <path
          d="M11.5 10 Q6 5.5 3.5 9 Q3 12 11.5 12.5 Z"
          fill={palette.upper}
        />
        <path
          d="M12.5 10 Q18 5.5 20.5 9 Q21 12 12.5 12.5 Z"
          fill={palette.upper}
        />
        {/* lower wings */}
        <path
          d="M11.5 13 Q6.5 16.5 5.5 13.5 Q7 12.7 11.5 13 Z"
          fill={palette.lower}
        />
        <path
          d="M12.5 13 Q17.5 16.5 18.5 13.5 Q17 12.7 12.5 13 Z"
          fill={palette.lower}
        />
        {/* wing spots */}
        <circle cx="6.5" cy="10" r="0.9" fill={palette.spot} opacity="0.7" />
        <circle cx="17.5" cy="10" r="0.9" fill={palette.spot} opacity="0.7" />
      </motion.svg>
    </motion.div>
  );
}
