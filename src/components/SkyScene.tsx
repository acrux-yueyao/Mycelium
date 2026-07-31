/**
 * SkyScene — kiosk-only view for the tower's top panel.
 *
 * Every creature the colony remembers, rendered as a faint constellation
 * that drifts very slowly: the exhibition's accumulated emotional sky.
 * Deterministic placement (hashed from each creature id) so the sky is
 * stable across reboots; only the drift breathes.
 */
import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { CreatureThumb } from './CreatureThumb';
import type { FieldCreature } from './DitherField';
import { xmur3 } from '../core/seed';

const CAP = 80; // Pi-friendly upper bound on simultaneously drifting stars

interface Props {
  creatures: FieldCreature[];
  population: number;
}

export function SkyScene({ creatures, population }: Props) {
  const stars = useMemo(() => {
    return creatures.slice(0, CAP).map((c) => {
      const h = xmur3(`sky:${c.id}`);
      const r = () => (h() >>> 8) / 16777216; // 0..1
      return {
        creature: c,
        left: 4 + r() * 88,          // vw
        top: 6 + r() * 82,           // vh
        height: 40 + r() * 52,       // px — small but legible at distance
        dur: 26 + r() * 30,          // s  — glacial drift
        delay: -r() * 40,
        dx: 6 + r() * 14,
        dy: 8 + r() * 18,
        dim: 0.7 + r() * 0.3,
      };
    });
  }, [creatures]);

  return (
    <motion.div
      className="sky-scene"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 1.2 }}
    >
      {stars.map((s) => (
        <motion.div
          key={s.creature.id}
          className="sky-item"
          style={{ left: `${s.left}vw`, top: `${s.top}vh`, opacity: s.dim }}
          animate={{ x: [0, s.dx, 0, -s.dx, 0], y: [0, -s.dy, 0, s.dy, 0] }}
          transition={{ duration: s.dur, delay: s.delay, repeat: Infinity, ease: 'easeInOut' }}
        >
          <CreatureThumb creature={s.creature} cell={3} height={s.height} />
        </motion.div>
      ))}
      <div className="sky-caption">
        EMOTIONAL SKY · {population.toLocaleString()} LIVED HERE
      </div>
    </motion.div>
  );
}
