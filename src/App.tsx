import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Background } from './components/Background';
import { DebugSpawnBar } from './components/DebugSpawnBar';
import { Entity } from './components/Entity';
import { Gallery } from './components/Gallery';
import { SparkleLayer } from './components/SparkleLayer';
import { TendrilLayer } from './components/TendrilLayer';
import { TreeHoleInput } from './components/TreeHoleInput';
import { useEmotion } from './hooks/useEmotion';
import { CHARACTERS, type CharId } from './data/characters';
import { findNearestBody, stepField } from './core/field';
import { stepConnections, type Connection } from './core/connections';

export type InfectionState = 'normal' | 'infecting' | 'transforming' | 'hybrid';

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
  /** State-machine for hybrid transformation. Default 'normal'. */
  infectionState: InfectionState;
  /** Wall-clock ms when the current infectionState was entered. */
  infectionStart?: number;
  /** Sorted [lo, hi] CharIds of the hybrid PNG this entity will morph into. */
  infectionPair?: [CharId, CharId];
  /** Entity id of the neighbor currently influencing this one. */
  partnerId?: string;
  rationale?: string;
}

const GAZE_MAX_RANGE = 450;
const GREETING_RADIUS = 320;
const LONELY_EXPOSE_PER_S = 0.15;
const LONELY_RECOVER_PER_S = 0.08;
const LONELY_SAT_FLOOR = 0.55;

// === Infection / transformation state machine ===
// Contact → hold → roll outcome → infecting → transforming → hybrid.
// No extra entities ever spawned: the original entity IS the hybrid once
// its state flips to 'hybrid'.
const INFECT_HOLD_MS = 3500;         // connection must hold this long before rolling
const INFECTING_MS = 3500;           // color / texture drift phase (tint pulse)
const TRANSFORM_MS = 2400;           // sprite + face crossfade phase
const INFECTION_MIN_COMPAT = 0.5;    // below this, pairs bond but never infect
// Base chance an eligible pair actually rolls for infection on any given
// frame (gated by compat on top, so likely infection is ≈ BASE * compat).
// Lower → rarer hybrid events, closer bonds without transforming.
const BASE_INFECTION_PROB = 0.25;    // per-frame chance once HOLD is satisfied
const ROLL_COOLDOWN_MS = 6000;       // after a "didn't fire" roll, wait this long
const MUTUAL_COMPAT_CUTOFF = 0.85;   // at or above: both sides always transform
const ONEWAY_COMPAT_CUTOFF = 0.65;   // at or above: 50/50 mutual vs one-way

/**
 * Root stage.
 *
 * Phases active:
 *   A · physics (attract / repel / walls / center)
 *   B · eye tracking + newcomer greeting
 *   C · compatibility matrix + tendrils + loneliness desaturation
 *   D · infection-based transformation (no new entities spawned):
 *       two compatible mushrooms touch, influence each other, and one
 *       or both morph in place into the pair-specific hybrid form.
 */
export default function App() {
  // URL-param gallery mode: append `?gallery` to view all characters + hybrids.
  const params =
    typeof window !== 'undefined'
      ? new URLSearchParams(window.location.search)
      : new URLSearchParams();
  const showGallery = params.has('gallery');
  const showDebug = params.has('debug');
  if (showGallery) return <Gallery />;

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
  // Pair key → timestamp of the last "didn't fire" probability check.
  // Prevents re-rolling the same bonded pair every frame while they linger.
  const rolledPairsRef = useRef<Map<string, number>>(new Map());

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

        const entityById = new Map(stepped.map((e) => [e.id, e]));

        // === Infection roll: only pairs where both sides are still 'normal',
        //     cross-kind, compat ≥ 0.5, and have held contact ≥ INFECT_HOLD_MS.
        //     Outcome is rolled once; rolled sides flip to 'infecting'.
        //     Same-kind pairs bond but never infect (no same-kind hybrid art).
        interface InfectionRoll {
          aId: string;
          bId: string;
          aInfected: boolean;
          bInfected: boolean;
          pair: [CharId, CharId];
        }
        const rolls: InfectionRoll[] = [];
        for (const c of nextConn.values()) {
          const ea = entityById.get(c.a.id);
          const eb = entityById.get(c.b.id);
          if (!ea || !eb) continue;
          if (ea.infectionState !== 'normal' || eb.infectionState !== 'normal') continue;
          if (ea.charId === eb.charId) continue;
          if (c.compat < INFECTION_MIN_COMPAT) continue;
          if (now - c.bornAt < INFECT_HOLD_MS) continue;

          // Per-frame probability gate, scaled by compat. Pairs that don't
          // fire enter a cooldown so we don't spam-roll them every frame.
          const lastRoll = rolledPairsRef.current.get(c.id);
          if (lastRoll != null && now - lastRoll < ROLL_COOLDOWN_MS) continue;
          if (Math.random() > BASE_INFECTION_PROB * c.compat) {
            rolledPairsRef.current.set(c.id, now);
            continue;
          }

          const pair: [CharId, CharId] =
            ea.charId < eb.charId ? [ea.charId, eb.charId] : [eb.charId, ea.charId];
          let aInfected: boolean;
          let bInfected: boolean;
          if (c.compat >= MUTUAL_COMPAT_CUTOFF) {
            aInfected = bInfected = true;
          } else if (c.compat >= ONEWAY_COMPAT_CUTOFF) {
            if (Math.random() < 0.5) {
              aInfected = bInfected = true;
            } else {
              aInfected = Math.random() < 0.5;
              bInfected = !aInfected;
            }
          } else {
            if (Math.random() < 0.2) {
              aInfected = bInfected = true;
            } else {
              aInfected = Math.random() < 0.5;
              bInfected = !aInfected;
            }
          }
          rolls.push({ aId: c.a.id, bId: c.b.id, aInfected, bInfected, pair });
          rolledPairsRef.current.delete(c.id);
        }

        // GC old roll-cooldown entries for pairs that no longer exist.
        for (const key of rolledPairsRef.current.keys()) {
          if (!nextConn.has(key)) rolledPairsRef.current.delete(key);
        }

        const lonelyConnected = new Set<string>();
        for (const c of connectionMapRef.current.values()) {
          if (c.a.charId === 5) lonelyConnected.add(c.b.id);
          if (c.b.charId === 5) lonelyConnected.add(c.a.id);
        }

        // Apply: loneliness, infection roll start, state-machine advance.
        const updated = stepped.map((e) => {
          let next = e;

          // Loneliness exposure.
          let exp = next.lonelyExposure;
          if (lonelyConnected.has(next.id)) {
            exp = Math.min(3, exp + LONELY_EXPOSE_PER_S * dt);
          } else {
            exp = Math.max(0, exp - LONELY_RECOVER_PER_S * dt);
          }
          if (exp !== next.lonelyExposure) next = { ...next, lonelyExposure: exp };

          // Start infection for freshly rolled sides.
          for (const r of rolls) {
            if (r.aId === next.id && r.aInfected) {
              next = {
                ...next,
                infectionState: 'infecting',
                infectionStart: now,
                infectionPair: r.pair,
                partnerId: r.bId,
              };
              break;
            }
            if (r.bId === next.id && r.bInfected) {
              next = {
                ...next,
                infectionState: 'infecting',
                infectionStart: now,
                infectionPair: r.pair,
                partnerId: r.aId,
              };
              break;
            }
          }

          // Advance state machine on the already-infected.
          if (next.infectionState === 'infecting' && next.infectionStart != null) {
            if (now - next.infectionStart >= INFECTING_MS) {
              next = { ...next, infectionState: 'transforming', infectionStart: now };
            }
          } else if (next.infectionState === 'transforming' && next.infectionStart != null) {
            if (now - next.infectionStart >= TRANSFORM_MS) {
              next = {
                ...next,
                infectionState: 'hybrid',
                infectionStart: now,
                partnerId: undefined,
              };
            }
          }

          return next;
        });

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

  // Build a fresh LiveEntity at a random non-overlapping spawn point.
  const makeEntity = (charId: CharId, rationale?: string): LiveEntity => {
    const { x, y } = spawnAt();
    const a = Math.random() * Math.PI * 2;
    const v0 = 0.4;
    return {
      id: `e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      charId,
      x,
      y,
      vx: Math.cos(a) * v0,
      vy: Math.sin(a) * v0,
      size: 180,
      bornAt: Date.now(),
      greetingPulse: 0,
      lonelyExposure: 0,
      infectionState: 'normal',
      rationale,
    };
  };

  // Add an entity to the stage; nearby existing entities pulse a greeting.
  const pushEntity = (entity: LiveEntity) => {
    setEntities((prev) => {
      const bumped = prev.map((e) => {
        const d = Math.hypot(e.x - entity.x, e.y - entity.y);
        return d < GREETING_RADIUS
          ? { ...e, greetingPulse: e.greetingPulse + 1 }
          : e;
      });
      return [...bumped, entity];
    });
  };

  const handleSubmit = async (text: string) => {
    const result = await read(text);
    if (!result) return;
    pushEntity(makeEntity(result.charId, result.reading.rationale));
  };

  // Debug bar handler: spawn one entity per CharId from a typed letter sequence.
  const handleDebugSpawn = (ids: CharId[]) => {
    for (const id of ids) pushEntity(makeEntity(id));
  };

  return (
    <div className="stage">
      <Background />
      <TendrilLayer connections={connections} />

      {entities.map((e, i) => {
        const t = gazeMap.get(e.id);
        const sat = Math.max(LONELY_SAT_FLOOR, 1 - e.lonelyExposure * 0.35);
        const partner = e.partnerId ? entities.find((x) => x.id === e.partnerId) : null;
        const partnerColor = partner ? CHARACTERS[partner.charId].color : undefined;
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
            infectionState={e.infectionState}
            infectionPair={e.infectionPair}
            partnerColor={partnerColor}
          />
        );
      })}

      <SparkleLayer />

      {showDebug && <DebugSpawnBar onSpawn={handleDebugSpawn} />}

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
