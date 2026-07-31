/**
 * MicroScene — kiosk-only view for the tower's low panel.
 *
 * A microscope over the newest resident: the latest creature rendered
 * huge (chunky pixels), breathing slowly, beside its specimen readout.
 * The whispered sentence itself is deliberately NOT shown — whispers
 * stay private; only the organism they grew is public.
 */
import { motion } from 'framer-motion';
import { CreatureThumb } from './CreatureThumb';
import type { FieldCreature } from './DitherField';
import { nameFor } from '../core/names';
import { CHARACTERS } from '../data/characters';

interface Props {
  creatures: FieldCreature[];
}

export function MicroScene({ creatures }: Props) {
  const latest = creatures[0];
  if (!latest) {
    return (
      <div className="micro-scene">
        <div className="micro-meta">AWAITING THE FIRST WHISPER…</div>
      </div>
    );
  }

  const name = latest.name || nameFor(latest.id);
  const family = CHARACTERS[latest.charId]?.name ?? '—';
  const born = latest.bornAt
    ? new Date(latest.bornAt).toLocaleString('en-US', {
        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
      })
    : '—';

  return (
    <motion.div
      className="micro-scene"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 1.0 }}
    >
      <motion.div
        className="micro-stage"
        key={latest.id}
        initial={{ scale: 0.92, opacity: 0 }}
        animate={{ scale: [1, 1.03, 1], opacity: 1 }}
        transition={{
          opacity: { duration: 0.8 },
          scale: { duration: 6, repeat: Infinity, ease: 'easeInOut' },
        }}
      >
        <CreatureThumb creature={latest} cell={7} height={430} />
      </motion.div>
      <div className="micro-meta">
        <div className="micro-label">NEWEST RESIDENT</div>
        <div className="micro-name">{name}</div>
        <div className="micro-row">family · {family}</div>
        <div className="micro-row">intensity · {(latest.intensity * 100).toFixed(0)}%</div>
        <div className="micro-row">born · {born}</div>
        <div className="micro-row micro-dim">id · {latest.id.slice(0, 12)}</div>
      </div>
    </motion.div>
  );
}
