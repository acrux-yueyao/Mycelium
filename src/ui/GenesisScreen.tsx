import { useEffect, useMemo, useRef, useState } from 'react';
import { InputTotem } from './InputTotem';
import { SporeField } from '../render/SporeField';
import { readEmotion, type EmotionReading, EmotionApiError } from '../core/emotion';
import { deriveSeed, type TypingRhythm } from '../core/seed';
import {
  SPECIES,
  applySurfaceModifier,
  applyIntensity,
  type SpeciesParams,
} from '../core/species';

type Stage = 'input' | 'reading' | 'blackout' | 'growing' | 'failure';

export function GenesisScreen() {
  const [stage, setStage] = useState<Stage>('input');
  const [reading, setReading] = useState<EmotionReading | null>(null);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [growth, setGrowth] = useState(0);
  const seedRef = useRef(1);
  const rhythmRef = useRef<TypingRhythm>({ per: 0, vel: 0, att: 0 });
  const textRef = useRef('');

  const species: SpeciesParams | null = useMemo(() => {
    if (!reading) return null;
    const base = SPECIES[reading.species];
    return applyIntensity(
      applySurfaceModifier(base, reading.surfaceModifier),
      reading.intensity
    );
  }, [reading]);

  const onSubmit = async (text: string, rhythm: TypingRhythm) => {
    textRef.current = text;
    rhythmRef.current = rhythm;
    setStage('reading');
    try {
      const r = await readEmotion(text);
      setReading(r);
      seedRef.current = deriveSeed(text, r.primary.label, rhythm);
      setStage('blackout');
    } catch (e) {
      setErrorMsg(e instanceof EmotionApiError ? e.message : 'unknown');
      setStage('failure');
    }
  };

  // Blackout \u2192 growing transition.
  useEffect(() => {
    if (stage !== 'blackout') return;
    const t1 = window.setTimeout(() => setStage('growing'), 1600);
    return () => window.clearTimeout(t1);
  }, [stage]);

  // Growth envelope: ease from 0 \u2192 1 over ~14s after growing starts.
  useEffect(() => {
    if (stage !== 'growing') {
      setGrowth(0);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const DURATION = 14_000;
    const tick = () => {
      const t = Math.min(1, (performance.now() - start) / DURATION);
      // Ease-out cubic: fast start, slow settle
      setGrowth(1 - Math.pow(1 - t, 3));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [stage]);

  const reset = () => {
    setReading(null);
    setErrorMsg('');
    setGrowth(0);
    setStage('input');
  };

  return (
    <div className="genesis-root">
      {/* Spore field lives behind everything once we have a species. */}
      {species && (stage === 'blackout' || stage === 'growing') && (
        <div className={`field ${stage === 'growing' ? 'visible' : ''}`}>
          <SporeField species={species} seed={seedRef.current} growth={growth} />
        </div>
      )}

      {(stage === 'input' || stage === 'reading') && (
        <InputTotem onSubmit={onSubmit} fading={stage === 'reading'} />
      )}

      <div className={`blackout ${stage === 'blackout' ? 'active' : ''}`} />

      {species && stage === 'growing' && (
        <div className="specimen-caption visible">
          <span className="latin">{species.latin}</span>
          <span>{species.common}</span>
          {reading?.rationale && (
            <>
              <br />
              <span style={{ opacity: 0.6 }}>{reading.rationale}</span>
            </>
          )}
        </div>
      )}

      {stage === 'failure' && (
        <div className="failure">
          <div>\u83cc\u4e1d\u672a\u80fd\u6210\u5f62</div>
          <div style={{ fontSize: '0.72rem', opacity: 0.7, maxWidth: '80vw', wordBreak: 'break-all' }}>
            {errorMsg}
          </div>
          <button onClick={reset}>\u518d\u547c\u51fa\u4e00\u6b21</button>
        </div>
      )}
    </div>
  );
}
