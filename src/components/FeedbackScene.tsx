/**
 * FeedbackScene — the specimen card for the creature you just grew.
 * Shows the reading the field made of your sentence: the creature large,
 * its survey record, the emotion labels + intensity, and the one-line
 * rationale. If you haven't grown one yet, it points you to the field.
 */
import { motion } from 'framer-motion';
import { CreatureThumb } from './CreatureThumb';
import { scanRecord } from '../core/scanRecord';
import { nameFor } from '../core/names';
import { CHARACTERS } from '../data/characters';
import type { FieldCreature } from './DitherField';
import type { Scene } from './SceneNav';

interface Props {
  latest: FieldCreature | null;
  onNavigate: (s: Scene) => void;
}

export function FeedbackScene({ latest, onNavigate }: Props) {
  return (
    <motion.div
      className="scene feedback"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5 }}
    >
      {!latest ? (
        <div className="feedback-empty">
          <h2>NO SPECIMEN YET</h2>
          <p>whisper a sentence into the field and a creature will grow from it.</p>
          <button className="feedback-cta" onClick={() => onNavigate('field')}>◂ GO TO THE FIELD</button>
        </div>
      ) : (
        <div className="feedback-card">
          <div className="feedback-thumb">
            <div className="feedback-frame">
              <CreatureThumb creature={latest} cell={11} height={280} />
            </div>
          </div>
          <div className="feedback-record">
            {(() => {
              const rec = scanRecord(latest.id, latest.bornAt ?? Date.now(), 1);
              const name = latest.name || nameFor(latest.id);
              const family = CHARACTERS[latest.charId]?.name ?? '—';
              return (
                <>
                  <div className="feedback-name">id:{rec.serial} · {name}</div>
                  <div className="feedback-line dim">{rec.date} · {rec.time}</div>
                  <div className="feedback-line dim">{rec.lat} · {rec.lon}</div>
                  <div className="feedback-sep" />
                  <div className="feedback-line accent">primary · {latest.primaryLabel || family}</div>
                  {latest.secondaryLabel ? <div className="feedback-line">secondary · {latest.secondaryLabel}</div> : null}
                  {typeof latest.intensity === 'number' ? <div className="feedback-line">intensity · {latest.intensity.toFixed(2)}</div> : null}
                  {latest.rationale ? <div className="feedback-rationale">「{latest.rationale}」</div> : null}
                  <div className="feedback-sep" />
                  <button className="feedback-cta" onClick={() => onNavigate('field')}>◂ BACK TO THE FIELD</button>
                </>
              );
            })()}
          </div>
        </div>
      )}
    </motion.div>
  );
}
