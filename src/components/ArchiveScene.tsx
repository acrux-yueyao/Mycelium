/**
 * ArchiveScene — the specimen archive. A scrolling catalogue of every
 * accumulated creature in the colony, each rendered as a survey record:
 * the creature + its id / name / coordinates / time and emotion reading.
 */
import { motion } from 'framer-motion';
import { CreatureThumb } from './CreatureThumb';
import { scanRecord } from '../core/scanRecord';
import { nameFor } from '../core/names';
import { CHARACTERS } from '../data/characters';
import { sceneOverlay, EASE } from '../ui/motion';
import type { FieldCreature } from './DitherField';

interface Props {
  creatures: FieldCreature[];
}

export function ArchiveScene({ creatures }: Props) {
  return (
    <motion.div
      className="scene archive"
      variants={sceneOverlay}
      initial="initial"
      animate="animate"
      exit="exit"
    >
      <div className="archive-head">
        <h2>SPECIMEN ARCHIVE</h2>
        <p>{creatures.length.toLocaleString()} records in view · every creature ever whispered into the field</p>
      </div>
      <div className="archive-grid">
        {creatures.map((c, i) => {
          const rec = scanRecord(c.id, c.bornAt ?? 0, i + 1);
          const name = c.name || nameFor(c.id);
          const family = CHARACTERS[c.charId]?.name ?? '—';
          return (
            <motion.div
              className="archive-card"
              key={c.id}
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: EASE, delay: Math.min(i, 22) * 0.028 }}
            >
              <div className="archive-thumb"><CreatureThumb creature={c} cell={6} height={104} /></div>
              <div className="archive-meta">
                <div className="archive-id">id:{rec.serial} · {name}</div>
                <div className="archive-co">{rec.lat} · {rec.lon}</div>
                {c.bornAt ? <div className="archive-co">{rec.date} · {rec.time}</div> : null}
                <div className="archive-emo">
                  {c.primaryLabel || family}
                  {typeof c.intensity === 'number' ? ` · int ${c.intensity.toFixed(2)}` : ''}
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>
      <div style={{ height: 60 }} />
    </motion.div>
  );
}
