/**
 * MoodBubbles — small translucent spores drifting up and out of the
 * mushroom, coloured by the LLM's tintHue. Replaces the previous
 * "hue wash on the sprite" (which buried the artwork) and the
 * "hue-tinted glow" (which produced a rainbow of background blobs):
 * mood now lives only in the bubbles.
 *
 * Every mushroom emits at a slow base rate; mushrooms whose reading
 * was 'releasing / weightless' (morphology.particles === true) emit
 * at a much faster rate, restoring the burst feel of the previous
 * particle layer.
 */
import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';

interface Bubble {
  id: number;
  dx: number;
  dy: number;
  size: number;
  delay: number;
  hueJitter: number;
}

interface Props {
  /** Mushroom mood hue 0..359 — drives the bubble fill. */
  hue: number;
  /** Diameter of the parent sprite in px (for emission radius). */
  size: number;
  /** True when the LLM marked the reading as 'releasing'; bumps
   *  emission rate ~5× and adds a touch more volume. */
  burst?: boolean;
}

const LIFE_S = 4.0;            // each bubble lives ~4s
const BASE_EMIT_MS = 3200;     // every ~3.2s for steady mood
const BURST_EMIT_MS = 700;     // every ~0.7s when burst flag is on

export function EntityParticles({ hue, size, burst = false }: Props) {
  const [bubbles, setBubbles] = useState<Bubble[]>([]);

  useEffect(() => {
    let counter = 0;
    const intervalMs = burst ? BURST_EMIT_MS : BASE_EMIT_MS;
    // First bubble fires fast so newly-spawned mushrooms aren't
    // suspiciously silent for 3 seconds before their first puff.
    const spawn = () => {
      counter += 1;
      const b = makeBubble(counter, size);
      setBubbles((prev) => [...prev, b]);
      window.setTimeout(() => {
        setBubbles((prev) => prev.filter((q) => q.id !== b.id));
      }, (LIFE_S + b.delay) * 1000 + 120);
    };
    const firstId = window.setTimeout(spawn, 400 + Math.random() * 800);
    const repeatId = window.setInterval(spawn, intervalMs);
    return () => {
      window.clearTimeout(firstId);
      window.clearInterval(repeatId);
    };
  }, [size, burst]);

  return (
    <div
      aria-hidden
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 4,        // above the sprite — bubbles drift in front
      }}
    >
      {bubbles.map((b) => {
        const h = (hue + b.hueJitter + 360) % 360;
        return (
          <motion.span
            key={b.id}
            initial={{ opacity: 0, x: 0, y: 0, scale: 0.3 }}
            animate={{
              opacity: [0, 0.78, 0.55, 0],
              x: b.dx,
              y: b.dy,
              scale: [0.3, 1, 1.08, 1.18],
            }}
            transition={{
              duration: LIFE_S,
              delay: b.delay,
              ease: 'easeOut',
              times: [0, 0.18, 0.55, 1],
            }}
            style={{
              position: 'absolute',
              left: '50%',
              top: '50%',
              width: b.size,
              height: b.size,
              borderRadius: '50%',
              // Bubble look: soft translucent fill + a tiny inner
              // highlight via an inset radial. Border-ish glow keeps
              // the edge readable on cream paper.
              background: `radial-gradient(circle at 35% 30%, hsla(${h}, 75%, 88%, 0.95) 0%, hsla(${h}, 65%, 70%, 0.65) 40%, hsla(${h}, 60%, 55%, 0.45) 100%)`,
              boxShadow: `0 0 5px hsla(${h}, 70%, 65%, 0.35)`,
              transform: 'translate(-50%, -50%)',
              pointerEvents: 'none',
            }}
          />
        );
      })}
    </div>
  );
}

function makeBubble(id: number, size: number): Bubble {
  // Bias upward (−π/4 .. −3π/4) — bubbles rise like exhaled breath
  // with some side drift so they don't all column up.
  const ang = -Math.PI / 4 - Math.random() * (Math.PI / 2);
  const dist = size * (0.4 + Math.random() * 0.5);
  return {
    id,
    dx: Math.cos(ang) * dist,
    dy: Math.sin(ang) * dist,
    size: 7 + Math.random() * 7,         // 7..14 px
    delay: Math.random() * 0.25,
    hueJitter: (Math.random() - 0.5) * 18, // ±9° hue wobble per bubble
  };
}
