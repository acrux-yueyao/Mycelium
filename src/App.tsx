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
import { stepConnections, type Connection } from './core/connections';

interface LiveEntity {
  id: string;
  charId: CharId;
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  bornAt: number;
  greetingPulse: number;
  lonelyExposure: number;
  isHybrid?: boolean;
  parentIds?: [CharId, CharId];
  rationale?: string;
}

const GAZE_MAX_RANGE = 450;
const GREETING_RADIUS = 320;
const LONELY_EXPOSE_PER_S = 0.15;
const LONELY_RECOVER_PER_S = 0.08;
const LONELY_SAT_FLOOR = 0.55;

const FUSION_HOLD_MS = 4000;
const FUSION_MIN_COMPAT = 0.5;
const FUSION_COOLDOWN_MS = 15000;

/**
 * Root stage.
 *
 * Phases active:
 *   A \u00b7 physics (attract / repel / walls / center)
 *   B \u00b7 eye tracking + newcomer greeting
 *   C \u00b7 compatibility matrix + tendrils + loneliness desaturation
 *   D.1 \u00b7 hybrid fusion (compat > 0.5 held \u2265 4s \u2192 rainbow hybrid)
 *         hybrids are sterile \u2014 they can connect visually but never fuse
 */
export default function App() {
  const [viewport, setViewport] = useState({ w: 0, h: 0 });
  const [entities, setEntities] = useState<LiveEntity[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const { loading, error, read, clearError } = useEmotion();

  useEffect(() => {
    const update = () => setViewport({ w: window.innerWidth, h: window.innerHeight });
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  const vpRef = useRef(viewport);
  useEffect(() => { vpRef.current = viewport; }, [viewport]);

  const connectionMapRef = useRef<Map<string, Connection>>(new Map());
  const lastFrameTimeRef = useRef(performance.now());
  const fusedPairsRef = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    let raf = 0;
    const loop = () => {
      const now = performance.now();
      const dt = Math.min(0.05, (now - lastFrameTimeRef.current) / 1000);
      lastFrameTimeRef.current = now;

      setEntities((prev) => {
        if (prev.length === 0) {
          if (connectionMapRef.current.size > 0) {
            connectionMapRef.current = new Map();
            setConnections([]);
          }
          return prev;
        }

        const stepped = stepField(prev, vpRef.current.w, vpRef.current.h);
        const nextConn = stepConnections(stepped, connectionMapRef.current, now);
        connectionMapRef.current = nextConn;

        // Lookup so fusion logic can skip hybrid endpoints. Hybrids keep
        // their baked charId (0) to reuse palette / gaze / physics code,
        // but they must NOT fuse \u2014 otherwise hybrid + parent keeps
        // fusing into new hybrids and the population explodes.
        const entityById = new Map(stepped.map((e) => [e.id, e]));

        // === Phase D.1 fusion detection ===
        const fusions: Array<{ pairId: string; a: Connection['a']; b: Connection['b'] }> = [];
        for (const c of nextConn.values()) {
          const ea = entityById.get(c.a.id);
          const eb = entityById.get(c.b.id);
          // Hybrids are sterile \u2014 visual connections only, no fusion.
          if (ea?.isHybrid || eb?.isHybrid) continue;
          // Same-kind pairs bond deeply but don't fuse — we only have art
          // for the 15 cross-kind combinations (A_B .. E_F).
          if (ea && eb && ea.charId === eb.charId) continue;
          if (c.compat < FUSION_MIN_COMPAT) continue;
          if (now - c.bornAt < FUSION_HOLD_MS) continue;
          const lastFused = fusedPairsRef.current.get(c.id);
          if (lastFused != null && now - lastFused < FUSION_COOLDOWN_MS) continue;
          fusions.push({ pairId: c.id, a: c.a, b: c.b });
          fusedPairsRef.current.set(c.id, now);
          connectionMapRef.current.delete(c.id);
        }

        const lonelyConnected = new Set<string>();
        for (const c of connectionMapRef.current.values()) {
          if (c.a.charId === 5) lonelyConnected.add(c.b.id);
          if (c.b.charId === 5) lonelyConnected.add(c.a.id);
        }

        let updated = stepped.map((e) => {
          let exp = e.lonelyExposure;
          if (lonelyConnected.has(e.id)) {
            exp = Math.min(3, exp + LONELY_EXPOSE_PER_S * dt);
          } else {
            exp = Math.max(0, exp - LONELY_RECOVER_PER_S * dt);
          }
          return exp === e.lonelyExposure ? e : { ...e, lonelyExposure: exp };
        });

        for (const f of fusions) {
          const dx = f.a.x - f.b.x;
          const dy = f.a.y - f.b.y;
          const d = Math.hypot(dx, dy) || 1;
          const nx = dx / d;
          const ny = dy / d;
          const midX = (f.a.x + f.b.x) / 2;
          const midY = (f.a.y + f.b.y) / 2;
          updated = updated.map((e) => {
            if (e.id === f.a.id) return { ...e, vx: e.vx + nx * 1.6, vy: e.vy + ny * 1.6 };
            if (e.id === f.b.id) return { ...e, vx: e.vx - nx * 1.6, vy: e.vy - ny * 1.6 };
            return e;
          });
          const hybrid: LiveEntity = {
            id: `h-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            charId: 0,
            x: midX,
            y: midY,
            vx: 0,
            vy: -0.3,
            size: 180,
            bornAt: Date.now(),
            greetingPulse: 0,
            lonelyExposure: 0,
            isHybrid: true,
            parentIds: [f.a.charId, f.b.charId],
          };
          updated = [...updated, hybrid];
        }

        for (const [key, ts] of fusedPairsRef.current) {
          if (now - ts > FUSION_COOLDOWN_MS * 2 && !connectionMapRef.current.has(key)) {
            fusedPairsRef.current.delete(key);
          }
        }

        return updated;
      });

      const arr = Array.from(connectionMapRef.current.values());
      setConnections((prevConns) => {
        if (prevConns.length !== arr.length) return arr;
        for (let i = 0; i < arr.length; i++) {
          if (prevConns[i].id !== arr[i].id) return arr;
        }
        return arr;
      });

      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

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
      lonelyExposure: 0,
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
      <TendrilLayer connections={connections} />

      {entities.map((e, i) => {
        const t = gazeMap.get(e.id);
        const sat = Math.max(LONELY_SAT_FLOOR, 1 - e.lonelyExposure * 0.35);
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
            saturation={sat}
            isHybrid={e.isHybrid}
            parentIds={e.parentIds}
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
            <div>\u83cc\u4e1d\u672a\u80fd\u6210\u5f62</div>
            <div className="error-detail">{error}</div>
            <button onClick={clearError}>\u518d\u547c\u51fa\u4e00\u6b21</button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
