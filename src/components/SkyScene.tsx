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
import { nameFor } from '../core/names';

const CAP = 80; // Pi-friendly upper bound on simultaneously drifting stars

interface Props {
  creatures: FieldCreature[];
  population: number;
}

export function SkyScene({ creatures, population }: Props) {
  // creatures[0] is always the newest (colony list is newest-first) — it
  // gets a distinct glow so the sky visibly "answers" the field below the
  // moment a fresh whisper lands there.
  const newestId = creatures[0]?.id;

  const stars = useMemo(() => {
    return creatures.slice(0, CAP).map((c) => {
      const h = xmur3(`sky:${c.id}`);
      const r = () => (h() >>> 8) / 16777216; // 0..1
      const isNewest = c.id === newestId;
      return {
        creature: c,
        left: 4 + r() * 88,          // vw
        top: 6 + r() * 82,           // vh
        height: isNewest ? 170 : 70 + r() * 110, // px — legible at tower distance
        dur: 14 + r() * 18,          // s — a wandering you can actually see
        delay: -r() * 40,
        dx: 24 + r() * 42,           // px — visible drift radius
        dy: 28 + r() * 50,
        dim: isNewest ? 1 : 0.86 + r() * 0.14,
        twinkleDur: 3.5 + r() * 4.5, // s — each star breathes on its own clock
        twinkleDelay: -r() * 8,
        isNewest,
      };
    });
  }, [creatures, newestId]);

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
          className={s.isNewest ? 'sky-item sky-item-newest' : 'sky-item'}
          style={{ left: `${s.left}vw`, top: `${s.top}vh` }}
          animate={{
            x: [0, s.dx, 0, -s.dx, 0],
            y: [0, -s.dy, 0, s.dy, 0],
            opacity: [s.dim, s.dim * 0.62, s.dim],
          }}
          transition={{
            duration: s.dur,
            delay: s.delay,
            repeat: Infinity,
            ease: 'easeInOut',
            opacity: {
              duration: s.twinkleDur,
              delay: s.twinkleDelay,
              repeat: Infinity,
              ease: 'easeInOut',
            },
          }}
        >
          {s.isNewest && (
            <motion.div
              className="sky-newest-glow"
              animate={{ opacity: [0.35, 0.8, 0.35], scale: [0.9, 1.15, 0.9] }}
              transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut' }}
            />
          )}
          <CreatureThumb creature={s.creature} cell={3} height={s.height} />
          {s.isNewest && (
            <div className="sky-newest-label">{s.creature.name || nameFor(s.creature.id)}</div>
          )}
        </motion.div>
      ))}
      <div className="sky-caption">
        EMOTIONAL SKY · {population.toLocaleString()} LIVED HERE
      </div>
    </motion.div>
  );
}
