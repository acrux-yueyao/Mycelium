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
import { sporeId } from '../core/sporeId';
import { CHARACTERS } from '../data/characters';
import { sceneOverlay, EASE } from '../ui/motion';
import type { FieldCreature } from './DitherField';

interface Props {
  creatures: FieldCreature[];
}

export function ArchiveScene({ creatures }: Props) {
  // On the tower's touch strip the archive flows like a slow river:
  // a gentle auto-scroll ping-pongs through the whole catalogue. A touch
  // pauses the river so a visitor can browse by hand; ten idle seconds
  // later it resumes drifting from wherever they left it.
  const gridRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = gridRef.current;
    if (!el) return;
    let raf = 0;
    let dir = 1;
    let last = performance.now();
    let lastTouch = -Infinity;
    // float accumulator: sub-pixel steps written via += get floored away
    // by the browser, so keep our own position and assign absolutely
    let pos = el.scrollLeft;
    const touched = () => { lastTouch = performance.now(); };
    const step = (t: number) => {
      raf = requestAnimationFrame(step);
      const dt = Math.min(t - last, 100);
      last = t;
      // the river only runs on the tower's strip, where the catalogue is a
      // single horizontal row wider than the screen; checked per-frame so it
      // never depends on kiosk-mode being set before this effect runs
      const max = el.scrollWidth - el.clientWidth;
      if (max <= 0 || !document.body.classList.contains('kiosk-mode')) return;
      if (t - lastTouch < 10000) {
        pos = el.scrollLeft;                   // follow the visitor's hand
        return;
      }
      pos += dir * 0.022 * dt;                 // ~22px/s — river pace
      if (pos >= max) { pos = max; dir = -1; }
      if (pos <= 0) { pos = 0; dir = 1; }
      el.scrollLeft = pos;
    };
    el.addEventListener('pointerdown', touched, { passive: true });
    el.addEventListener('touchstart', touched, { passive: true });
    el.addEventListener('wheel', touched, { passive: true });
    raf = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener('pointerdown', touched);
      el.removeEventListener('touchstart', touched);
      el.removeEventListener('wheel', touched);
    };
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
                <div className="archive-id">{sporeId(c)} · {name}</div>
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
