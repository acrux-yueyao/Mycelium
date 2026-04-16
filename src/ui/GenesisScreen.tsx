import { FormEvent, useMemo, useRef, useState } from 'react';
import { Background } from '../components/Background';
import { readSceneSpec, SceneApiError } from '../core/sceneClient';
import { sceneFingerprint, type SceneSpec } from '../core/scene';
import { deriveSeed, type TypingRhythm } from '../core/seed';
import { resolveOrganismSpec, type ResolvedOrganismSpec } from '../core/species';
import { SporeField } from '../render/SporeField';

interface GenesisState {
  scene: SceneSpec;
  resolved: ResolvedOrganismSpec;
  seed: number;
}

export function GenesisScreen() {
  const [text, setText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [genesis, setGenesis] = useState<GenesisState | null>(null);
  const keyIntervalsRef = useRef<number[]>([]);
  const longestPauseRef = useRef<number>(0);
  const lastKeyAtRef = useRef<number | null>(null);

  const canSubmit = text.trim().length > 0 && !isSubmitting;
  const rhythm = useMemo(
    () => buildTypingRhythm(text.length, keyIntervalsRef.current, longestPauseRef.current),
    [text]
  );

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const payload = text.trim();
    if (!payload || isSubmitting) return;
    setError(null);
    setIsSubmitting(true);
    try {
      const scene = await readSceneSpec(payload);
      const fingerprint = sceneFingerprint(scene);
      const seed = deriveSeed(payload, fingerprint, rhythm ?? undefined);
      const resolved = resolveOrganismSpec(scene, seed);
      setGenesis({ scene, resolved, seed });
    } catch (submissionError) {
      if (submissionError instanceof SceneApiError) {
        setError(submissionError.message);
      } else {
        setError(String(submissionError));
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="stage genesis-stage">
      <Background />
      {genesis ? <SporeField spec={genesis.resolved} seed={genesis.seed} /> : null}

      <div className={`genesis-blackout ${isSubmitting ? 'active' : ''}`} />

      <section className="genesis-panel">
        <header className="genesis-header">
          <p className="genesis-kicker">Mycelium</p>
          <h1 className="genesis-title">Offer A Sentence. Let It Grow.</h1>
          <p className="genesis-subtitle">One line enters. A living morphology answers.</p>
        </header>

        <form className="genesis-form" onSubmit={handleSubmit}>
          <label htmlFor="genesis-text" className="genesis-label">
            Anonymous text
          </label>
          <textarea
            id="genesis-text"
            className="genesis-input"
            value={text}
            maxLength={500}
            placeholder="I kept pretending I was fine because silence was easier."
            onChange={(e) => setText(e.target.value)}
            onKeyDown={() => {
              const now = performance.now();
              if (lastKeyAtRef.current !== null) {
                const interval = now - lastKeyAtRef.current;
                keyIntervalsRef.current.push(interval);
                if (interval > longestPauseRef.current) {
                  longestPauseRef.current = interval;
                }
                if (keyIntervalsRef.current.length > 80) {
                  keyIntervalsRef.current.shift();
                }
              }
              lastKeyAtRef.current = now;
            }}
            disabled={isSubmitting}
          />
          <div className="genesis-controls">
            <button type="submit" className="genesis-submit" disabled={!canSubmit}>
              {isSubmitting ? 'Interpreting...' : 'Begin Genesis'}
            </button>
            <span className="genesis-count">{text.length}/500</span>
          </div>
        </form>

        <div className="genesis-meta" aria-live="polite">
          {error ? <p className="genesis-error">{error}</p> : null}
          {genesis ? <p className="genesis-rationale">{genesis.scene.rationale}</p> : null}
        </div>
      </section>
    </div>
  );
}

function buildTypingRhythm(
  textLength: number,
  intervals: number[],
  longestPause: number
): TypingRhythm | null {
  if (intervals.length === 0 || textLength === 0) return null;
  const sorted = [...intervals].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
  const mean = intervals.reduce((sum, value) => sum + value, 0) / intervals.length;
  const velocity = textLength / Math.max(0.2, (mean * intervals.length) / 1000);
  return {
    per: median,
    vel: velocity,
    att: longestPause,
  };
}
