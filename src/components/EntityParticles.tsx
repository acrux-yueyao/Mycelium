/**
 * EntityParticles — drifting kawaii particles emitted from a mushroom
 * that carries a "releasing / weightless" emotion (morphology.particles
 * === true).
 *
 * Every ~600ms a new tiny dot is pushed out from the sprite centre
 * with a random upward-ish trajectory. Each particle has a 2s lifetime
 * during which it drifts up, expands slightly, and fades out.
 *
 * Tinted by the creature's morphology.tintHue so the particle cloud
 * matches the overall mood of that mushroom.
 */
import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';

interface Particle {
  id: number;
  dx: number;  // final offset px from centre
  dy: number;
  size: number;
  delay: number;
}

interface Props {
  /** CSS hsl base color (wraps hue from the morphology). */
  hue: number;
  /** Diameter of the parent sprite box — scales emission radius. */
  size: number;
}

const LIFE_S = 2.2;
const EMIT_MS = 620;

export function EntityParticles({ hue, size }: Props) {
  const [particles, setParticles] = useState<Particle[]>([]);

  useEffect(() => {
    let counter = 0;
    const id = window.setInterval(() => {
      counter += 1;
      const p = makeParticle(counter, size);
      setParticles((prev) => [...prev, p]);
      // Auto-despawn after the animation fully runs, with a small
      // cleanup margin. Kept short enough that the array never
      // grows past ~4-5 particles.
      window.setTimeout(() => {
        setParticles((prev) => prev.filter((q) => q.id !== p.id));
      }, (LIFE_S + p.delay) * 1000 + 120);
    }, EMIT_MS);
    return () => window.clearInterval(id);
  }, [size]);

  return (
    <div
      aria-hidden
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        // Sit above the sprite but below the face overlays & hybrid
        // aura. z-index within the Entity stack is purely cosmetic
        // since the ancestor `.entity` owns the stacking context.
        zIndex: 2,
      }}
    >
      {particles.map((p) => (
        <motion.span
          key={p.id}
          initial={{ opacity: 0, x: 0, y: 0, scale: 0.4 }}
          animate={{
            opacity: [0, 0.85, 0.6, 0],
            x: p.dx,
            y: p.dy,
            scale: [0.4, 1, 1.15, 1.3],
          }}
          transition={{
            duration: LIFE_S,
            delay: p.delay,
            ease: 'easeOut',
            times: [0, 0.15, 0.6, 1],
          }}
          style={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            width: p.size,
            height: p.size,
            borderRadius: '50%',
            // Warm translucent glow that picks up the mushroom's tint.
            background: `hsla(${hue}, 62%, 78%, 0.78)`,
            boxShadow: `0 0 6px hsla(${hue}, 70%, 75%, 0.45)`,
            transform: 'translate(-50%, -50%)',
            pointerEvents: 'none',
          }}
        />
      ))}
    </div>
  );
}

function makeParticle(id: number, size: number): Particle {
  // Direction biased upward (−π/3 .. −2π/3) so particles rise like
  // soft exhalations, with some horizontal drift.
  const ang = -Math.PI / 3 - Math.random() * (Math.PI / 3);
  const dist = size * (0.35 + Math.random() * 0.4);
  return {
    id,
    dx: Math.cos(ang) * dist,
    dy: Math.sin(ang) * dist,
    size: 4 + Math.random() * 5,
    delay: Math.random() * 0.15,
  };
}
