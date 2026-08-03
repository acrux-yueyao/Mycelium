/**
 * ArchiveScene — the specimen archive. A scrolling catalogue of every
 * accumulated creature in the colony, each rendered as a survey record:
 * the creature + its id / name / coordinates / time and emotion reading.
 */
import { useEffect, useRef } from 'react';
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
  // On the tower's touch strip the grid scrolls sideways under a finger.
  // Exhibition etiquette: 45s after the last touch, drift home to the
  // newest resident so the next visitor never inherits a stale page.
  const gridRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = gridRef.current;
    if (!el || !document.body.classList.contains('kiosk-mode')) return;
    let timer: number | undefined;
    const arm = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => el.scrollTo({ left: 0, behavior: 'smooth' }), 45000);
    };
    el.addEventListener('scroll', arm, { passive: true });
    return () => { window.clearTimeout(timer); el.removeEventListener('scroll', arm); };
  }, []);
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
      <div className="archive-grid" ref={gridRef}>
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
