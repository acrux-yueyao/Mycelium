import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Background } from './components/Background';
import { Entity } from './components/Entity';
import { SparkleLayer } from './components/SparkleLayer';
import { TendrilLayer } from './components/TendrilLayer';
import { TreeHoleInput } from './components/TreeHoleInput';
import { useEmotion } from './hooks/useEmotion';
import type { CharId } from './data/characters';

interface LiveEntity {
  id: string;
  charId: CharId;
  x: number;
  y: number;
  size: number;
  bornAt: number;
  rationale?: string;
}

/**
 * Root stage.
 *
 * Step 4 adds:
 *  - TreeHoleInput wired to useEmotion
 *  - Entity list state (append a new Entity each time user submits)
 *  - Error toast when API fails
 *
 * The old hardcoded-center demo entity is removed. Spawn positions
 * avoid the center third of the screen (reserved for input text area)
 * on first few spawns, then fill in randomly.
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

  const spawnAt = (): { x: number; y: number } => {
    const w = viewport.w;
    const h = viewport.h;
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
    setEntities((prev) => [
      ...prev,
      {
        id: `e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        charId: result.charId,
        x,
        y,
        size,
        bornAt: Date.now(),
        rationale: result.reading.rationale,
      },
    ]);
  };

  return (
    <div className="stage">
      <Background />
      <TendrilLayer entities={[]} connections={[]} />

      {entities.map((e, i) => (
        <Entity
          key={e.id}
          id={e.id}
          charId={e.charId}
          x={e.x}
          y={e.y}
          size={e.size}
          phaseOffset={(i * 0.17) % 1}
        />
      ))}

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
