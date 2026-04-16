import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Background } from './components/Background';
import { Entity } from './components/Entity';
import { SparkleLayer } from './components/SparkleLayer';
import { TendrilLayer } from './components/TendrilLayer';
import { TreeHoleInput } from './components/TreeHoleInput';
import { useEmotion } from './hooks/useEmotion';
import type { CharId } from './data/characters';
import { findNearestBody, stepField } from './core/field';

interface LiveEntity {
  id: string;
  charId: CharId;
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  bornAt: number;
  /** Incremented whenever a new neighbor arrives — fires a greeting bounce. */
  greetingPulse: number;
  rationale?: string;
}

const GAZE_MAX_RANGE = 450;
const GREETING_RADIUS = 320;

/**
 * Root stage.
 *
 * Phases active:
 *   A · physics field (attract / repel / walls / center-repel)
 *   B · eye tracking + newcomer greeting
 */
export default function App() {
  const [viewport, setViewport] = useState({ w: 0, h: 0 });
  const [entities, setEntities] = useState<LiveEntity[]>([]);
  const { loading, error, read, clearError } = useEmotion();

  useEffect(() => {
    const update = () => setViewport({ w: window.innerWidth, h: window.innerHeight });
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  const vpRef = useRef(viewport);
  useEffect(() => { vpRef.current = viewport; }, [viewport]);

  useEffect(() => {
    let raf = 0;
    const loop = () => {
      setEntities((prev) => {
        if (prev.length === 0) return prev;
        return stepField(prev, vpRef.current.w, vpRef.current.h);
      });
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  // Per-entity gaze targets — nearest other within GAZE_MAX_RANGE.
  const gazeMap = useMemo(() => {
    const map = new Map<string, { x: number; y: number } | null>();
    for (const e of entities) {
      const t = findNearestBody(e, entities, GAZE_MAX_RANGE);
      map.set(e.id, t ? { x: t.x, y: t.y } : null);
    }
    return map;
  }, [entities]);

  const spawnAt = (): { x: number; y: number } => {
    const w = vpRef.current.w || window.innerWidth;
    const h = vpRef.current.h || window.innerHeight;
    const centerX = w / 2;
    const centerY = h / 2;
    for (let attempt = 0; attempt < 20; attempt++) {
      const x = centerX + (Math.random() - 0.5) * w * 0.6;
      const y = centerY + (Math.random() - 0.65) * h * 0.5;
      const nearCenter =
        Math.abs(x - centerX) < w * 0.12 && Math.abs(y - centerY) < h * 0.18;
      if (!nearCenter) return { x, y };
    }
    return { x: centerX - w * 0.2, y: centerY - h * 0.2 };
  };

  const handleSubmit = async (text: string) => {
    const result = await read(text);
    if (!result) return;
    const { x, y } = spawnAt();
    const size = 180;
    const a = Math.random() * Math.PI * 2;
    const v0 = 0.4;
    const newEntity: LiveEntity = {
      id: `e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      charId: result.charId,
      x,
      y,
      vx: Math.cos(a) * v0,
      vy: Math.sin(a) * v0,
      size,
      bornAt: Date.now(),
      greetingPulse: 0,
      rationale: result.reading.rationale,
    };
    setEntities((prev) => {
      const bumped = prev.map((e) => {
        const d = Math.hypot(e.x - x, e.y - y);
        return d < GREETING_RADIUS
          ? { ...e, greetingPulse: e.greetingPulse + 1 }
          : e;
      });
      return [...bumped, newEntity];
    });
  };

  return (
    <div className="stage">
      <Background />
      <TendrilLayer entities={[]} connections={[]} />

      {entities.map((e, i) => {
        const t = gazeMap.get(e.id);
        return (
          <Entity
            key={e.id}
            id={e.id}
            charId={e.charId}
            x={e.x}
            y={e.y}
            size={e.size}
            phaseOffset={(i * 0.17) % 1}
            gazeTargetX={t ? t.x : null}
            gazeTargetY={t ? t.y : null}
            greetingPulse={e.greetingPulse}
          />
        );
      })}

      <SparkleLayer />

      <TreeHoleInput onSubmit={handleSubmit} disabled={loading} loading={loading} />

      <AnimatePresence>
        {error && (
          <motion.div
            key="err"
            className="error-toast"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            transition={{ duration: 0.35 }}
          >
            <div>菌丝未能成形</div>
            <div className="error-detail">{error}</div>
            <button onClick={clearError}>再呼出一次</button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
