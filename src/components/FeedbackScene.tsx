/**
 * FeedbackScene — the specimen introduction card shown right after a
 * creature is grown. A big render of the new creature, the sentence the
 * visitor whispered on the left, and the creature's name + survey data on
 * the right — then it's released into the field. Frosted-glass editorial
 * layout.
 */
import { useState } from 'react';
import { motion } from 'framer-motion';
import { sceneOverlay } from '../ui/motion';
import { CreatureThumb } from './CreatureThumb';
import { scanRecord } from '../core/scanRecord';
import { nameFor } from '../core/names';
import { shareUrl } from '../core/share';
import { downloadShareCard } from '../core/shareCard';
import { CHARACTERS } from '../data/characters';
import type { FieldCreature } from './DitherField';
import type { Scene } from './SceneNav';

interface Props {
  latest: FieldCreature | null;
  /** whether the name can still be edited (only before it's released). */
  editable?: boolean;
  onRename?: (name: string) => void;
  onNavigate: (s: Scene) => void;
}

export function FeedbackScene({ latest, editable, onRename, onNavigate }: Props) {
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);

  const copyLink = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!latest) return;
    try {
      await navigator.clipboard.writeText(shareUrl(latest));
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch { /* clipboard blocked — ignore */ }
  };
  const saveImage = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!latest || saving) return;
    setSaving(true);
    try { await downloadShareCard(latest); } finally { setSaving(false); }
  };

  return (
    <motion.div
      className="scene specimen"
      // A click anywhere on the card releases the creature into the field,
      // where it joins the colony and starts interacting.
      onClick={latest ? () => onNavigate('field') : undefined}
      style={latest ? { cursor: 'pointer' } : undefined}
      variants={sceneOverlay}
      initial="initial"
      animate="animate"
      exit="exit"
    >
      {!latest ? (
        <div className="feedback-empty">
          <h2>NO SPECIMEN YET</h2>
          <p>whisper a sentence into the field and a creature will grow from it.</p>
          <button className="feedback-cta" onClick={() => onNavigate('field')}>◂ GO TO THE FIELD</button>
        </div>
      ) : (
        (() => {
          const rec = scanRecord(latest.id, latest.bornAt ?? Date.now(), 1);
          const name = latest.name || nameFor(latest.id);
          const family = CHARACTERS[latest.charId]?.name ?? '—';
          return (
            <div className="spec-stage">
              <div className="spec-topbar">
                <span>SPECIMEN · NEW</span>
                <span>MYCELIUM FIELD</span>
                <span>id:{rec.serial}</span>
              </div>

              <div className="spec-body">
                <motion.div
                  className="spec-render"
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.7, ease: 'easeOut' }}
                >
                  <CreatureThumb creature={latest} cell={14} height={360} />
                </motion.div>

                {/* left — the whispered sentence */}
                <motion.div
                  className="spec-card spec-card-left"
                  initial={{ opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: 0.15 }}
                >
                  <div className="spec-eyebrow">you whispered</div>
                  <div className="spec-sentence">{latest.text || '—'}</div>
                  {latest.rationale ? <div className="spec-rationale">「{latest.rationale}」</div> : null}
                </motion.div>

                {/* right — name + survey data */}
                <motion.div
                  className="spec-card spec-card-right"
                  initial={{ opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: 0.28 }}
                >
                  {editable ? (
                    <div className="spec-name-edit" onClick={(e) => e.stopPropagation()}>
                      <input
                        className="spec-name-input"
                        value={latest.name ?? ''}
                        maxLength={28}
                        aria-label="creature name"
                        spellCheck={false}
                        onChange={(e) => onRename?.(e.target.value)}
                      />
                      <span className="spec-name-hint">✎ tap to rename</span>
                    </div>
                  ) : (
                    <div className="spec-name">{name}</div>
                  )}
                  <div className="spec-eyebrow">specimen</div>
                  <dl className="spec-data">
                    <div><dt>emotion</dt><dd>{latest.primaryLabel || family}</dd></div>
                    {latest.secondaryLabel ? <div><dt>secondary</dt><dd>{latest.secondaryLabel}</dd></div> : null}
                    {typeof latest.intensity === 'number' ? <div><dt>intensity</dt><dd>{latest.intensity.toFixed(2)}</dd></div> : null}
                    <div><dt>coordinates</dt><dd>{rec.lat}<br />{rec.lon}</dd></div>
                    <div><dt>logged</dt><dd>{rec.date} · {rec.time}</dd></div>
                  </dl>
                </motion.div>
              </div>

              <div className="spec-actions">
                <button className="spec-release" onClick={() => onNavigate('field')}>
                  release into the field <span aria-hidden>▸</span>
                </button>
                <button className="spec-archive-link" onClick={(e) => { e.stopPropagation(); onNavigate('archive'); }}>view archive</button>
              </div>

              {/* claim & share — the spore is reproducible from its link */}
              <div className="spec-share" onClick={(e) => e.stopPropagation()}>
                <button className="spec-share-btn" onClick={copyLink}>
                  {copied ? '✓ link copied' : 'copy link'}
                </button>
                <span className="spec-share-sep" aria-hidden>·</span>
                <button className="spec-share-btn" onClick={saveImage}>
                  {saving ? 'saving…' : 'save image'}
                </button>
              </div>
            </div>
          );
        })()
      )}
    </motion.div>
  );
}
