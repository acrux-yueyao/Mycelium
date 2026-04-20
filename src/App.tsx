import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Background } from './components/Background';
import { Butterflies } from './components/Butterflies';
import { DebugSpawnBar } from './components/DebugSpawnBar';
import { Entity } from './components/Entity';
import { Gallery } from './components/Gallery';
import { SparkleLayer } from './components/SparkleLayer';
import { TendrilLayer } from './components/TendrilLayer';
import { TreeHoleInput } from './components/TreeHoleInput';
import { useEmotion } from './hooks/useEmotion';
import { CHARACTERS, type CharId } from './data/characters';
import { randomName } from './core/names';
import { findNearestBody, stepField } from './core/field';
import { stepConnections, isActive, type Connection } from './core/connections';
import { type ExplorationProbe } from './core/probes';
import {
  ambientStart,
  cueSpawn,
  cueConnect,
  cueInfect,
  ensureAudioContext,
  isMuted,
  setMuted,
} from './core/audio';

const EMPTY_PROBES: ExplorationProbe[] = [];

export type InfectionState = 'normal' | 'infecting' | 'transforming' | 'hybrid';

interface LiveEntity {
  id: string;
  charId: CharId;
  /** Whimsical two-word label ("Sleepy Mochi") drawn below the sprite. */
  name: string;
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
  /** Wall-clock ms when this entity most recently had an active
   *  (non-retracting) connection. Used to detect prolonged isolation
   *  so mother trees can reach out. Defaults to bornAt. */
  lastSocialAt?: number;
}

const GAZE_MAX_RANGE = 450;
const GREETING_RADIUS = 320;
const LONELY_EXPOSE_PER_S = 0.15;
const LONELY_RECOVER_PER_S = 0.08;
const LONELY_SAT_FLOOR = 0.55;

// === Mother-tree mechanic ===
// In `?debug` we collapse all the waiting windows so the effect is
// observable within seconds instead of nearly a minute — otherwise
// the mechanic is invisible during hands-on testing.
const IS_DEBUG =
  typeof window !== 'undefined' &&
  new URLSearchParams(window.location.search).has('debug');
// After this much time on stage, an entity quietly becomes a "mother
// tree" — not flagged to the user, not elevated in rank, just a node
// that the system considers as a potential source of support for
// isolated mushrooms nearby.
const MOTHER_AGE_MS = IS_DEBUG ? 6_000 : 40_000;
// An entity is considered isolated once it has been without an
// active connection for this long. Mother trees will then try to
// reach toward it.
const ISOLATION_MS = IS_DEBUG ? 4_000 : 18_000;
// How far a mother tree can extend a support connection.
const MOTHER_REACH = 400;
// Support connections live considerably longer than organic bonds —
// they're meant to provide a calm, stable presence.
const SUPPORT_LIFE_MS = 18_000;
// Support tendrils tolerate much more stretch before giving up.
const SUPPORT_STRETCH_FACTOR = 2.4;

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
  const [probes, setProbes] = useState<ExplorationProbe[]>([]);
  const [muted, setMutedState] = useState(false);
  const { loading, error, read, clearError } = useEmotion();

  useEffect(() => {
    const update = () => setViewport({ w: window.innerWidth, h: window.innerHeight });
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  // Audio: browsers block context creation until a user gesture. Wire
  // a one-shot listener; on the first keydown or click we boot the
  // context and start the ambient bed. After that, cue functions can
  // play on demand.
  useEffect(() => {
    const onFirstGesture = () => {
      ensureAudioContext();
      ambientStart();
      window.removeEventListener('pointerdown', onFirstGesture);
      window.removeEventListener('keydown', onFirstGesture);
    };
    window.addEventListener('pointerdown', onFirstGesture, { once: false });
    window.addEventListener('keydown', onFirstGesture, { once: false });
    return () => {
      window.removeEventListener('pointerdown', onFirstGesture);
      window.removeEventListener('keydown', onFirstGesture);
    };
  }, []);

  const vpRef = useRef(viewport);
  useEffect(() => { vpRef.current = viewport; }, [viewport]);

  // Ref mirrors of state, so spawnAt() always sees the latest.
  const entitiesRef = useRef<LiveEntity[]>([]);
  useEffect(() => { entitiesRef.current = entities; }, [entities]);

  const connectionMapRef = useRef<Map<string, Connection>>(new Map());
  // Per-pair wall-clock ms until which reconnection is blocked after a
  // connection fully retracts. Managed by stepConnections.
  const connCooldownRef = useRef<Map<string, number>>(new Map());
  const lastFrameTimeRef = useRef(performance.now());
  // Pair key → timestamp of the last "didn't fire" probability check.
  // Prevents re-rolling the same bonded pair every frame while they linger.
  const rolledPairsRef = useRef<Map<string, number>>(new Map());
  // Live exploratory probes (mushrooms always searching). Mutated in the
  // RAF loop; setProbes mirrors it into React state for the layer.
  const probesRef = useRef<ExplorationProbe[]>([]);
  // Per-mushroom cooldown so we don't spawn multiple probes at once.
  const probeCooldownRef = useRef<Map<string, number>>(new Map());

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

        const stepped = stepField(
          prev,
          vpRef.current.w,
          vpRef.current.h,
          connectionMapRef.current,
          connCooldownRef.current,
          now,
        );
        const prevConnMap = connectionMapRef.current;
        const nextConn = stepConnections(
          stepped,
          prevConnMap,
          connCooldownRef.current,
          now,
        );
        connectionMapRef.current = nextConn;

        // Cue sound on growing → bonded transitions: a tendril just
        // reached its target. Positive compat only — repellers don't
        // chime.
        for (const [key, c] of nextConn) {
          if (c.state !== 'bonded' || c.compat < 0) continue;
          const prev = prevConnMap.get(key);
          if (prev && prev.state === 'bonded') continue;  // already chimed
          cueConnect();
        }

        const entityById = new Map(stepped.map((e) => [e.id, e]));

        // === Mother-tree support reach ===
        // For every entity that has been isolated for > ISOLATION_MS,
        // find the nearest aged "mother tree" within MOTHER_REACH and
        // inject a support connection. No UI, no hint — just a quiet
        // tendril growing in. One such reach per frame at most, so
        // multiple isolated mushrooms get supported gradually rather
        // than in a lockstep burst.
        const isActiveConn = (c: Connection) => c.state !== 'retracting';
        const socialIds = new Set<string>();
        for (const c of nextConn.values()) {
          if (isActiveConn(c)) {
            socialIds.add(c.a.id);
            socialIds.add(c.b.id);
          }
        }
        findSupport: for (const isolated of stepped) {
          if (isolated.infectionState !== 'normal') continue;
          if (socialIds.has(isolated.id)) continue;
          const lastSocial = isolated.lastSocialAt ?? isolated.bornAt;
          if (now - lastSocial < ISOLATION_MS) continue;

          let mother: typeof isolated | null = null;
          let bestD = MOTHER_REACH;
          for (const other of stepped) {
            if (other.id === isolated.id) continue;
            if (other.infectionState !== 'normal') continue;
            if (now - other.bornAt < MOTHER_AGE_MS) continue;
            const d = Math.hypot(other.x - isolated.x, other.y - isolated.y);
            if (d < bestD) {
              bestD = d;
              mother = other;
            }
          }
          if (!mother) continue;

          const pairKeyLocal =
            isolated.id < mother.id
              ? `${isolated.id}__${mother.id}`
              : `${mother.id}__${isolated.id}`;
          if (nextConn.has(pairKeyLocal)) continue;
          const cdUntil = connCooldownRef.current.get(pairKeyLocal);
          if (cdUntil != null && now < cdUntil) continue;

          // Inject the support connection directly into the map so
          // this frame's rendering already picks it up. The mother
          // is a → isolated is b so the tendril visibly grows FROM
          // the mother toward the isolated one.
          nextConn.set(pairKeyLocal, {
            id: pairKeyLocal,
            a: { id: mother.id, charId: mother.charId, x: mother.x, y: mother.y },
            b: { id: isolated.id, charId: isolated.charId, x: isolated.x, y: isolated.y },
            bornAt: now,
            compat: 0.6,                              // warm-ish floor regardless of pair compat
            maxLifeMs: SUPPORT_LIFE_MS,
            state: 'growing',
            isSupport: true,
            stretchFactor: SUPPORT_STRETCH_FACTOR,
          });
          // Limit to one new reach per frame so multiple lonely
          // entities don't all light up at once.
          break findSupport;
        }

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
          if (!isActive(c)) continue;
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
          cueInfect();
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

          // Stamp lastSocialAt whenever this entity has at least one
          // active connection. Used by the mother-tree reach logic
          // to detect "been alone for a while".
          if (socialIds.has(next.id)) {
            next = { ...next, lastSocialAt: now };
          }

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

      // === Exploratory probes (V2a) — DISABLED ===
      // Per user feedback: "只找别的菌，不要瞎找". Random-angle probes
      // into empty space were reading as aimless / random. Kept the
      // data path so we can revive targeted probes (a mushroom reaching
      // for a specific other mushroom) later, but no new probes spawn.
      const liveIds = new Set(entitiesRef.current.map((e) => e.id));
      probesRef.current = probesRef.current.filter((p) => {
        if (!liveIds.has(p.originId)) return false;
        const total = p.growMs + p.stableMs + p.retractMs;
        return now - p.bornAt < total;
      });
      // GC cooldown entries for despawned entities.
      for (const id of probeCooldownRef.current.keys()) {
        if (!liveIds.has(id)) probeCooldownRef.current.delete(id);
      }
      setProbes(probesRef.current.length > 0 ? [...probesRef.current] : EMPTY_PROBES);

      const arr = Array.from(connectionMapRef.current.values());
      setConnections((prevConns) => {
        if (prevConns.length !== arr.length) return arr;
        for (let i = 0; i < arr.length; i++) {
          const p = prevConns[i];
          const n = arr[i];
          // Any of: id swap, state change, or endpoint move re-renders.
          if (p.id !== n.id || p.state !== n.state) return arr;
          if (p.a.x !== n.a.x || p.a.y !== n.a.y) return arr;
          if (p.b.x !== n.b.x || p.b.y !== n.b.y) return arr;
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
    const liveEntities = entitiesRef.current;
    const liveConns = Array.from(connectionMapRef.current.values());

    // Spawn candidates must sit clear of:
    //   - the tree-hole input in the middle
    //   - any existing mushroom (can't birth inside another)
    //   - any active connection line (can't birth on a tendril)
    const MIN_ENTITY_DIST = 170;
    const MIN_CONN_DIST = 70;
    for (let attempt = 0; attempt < 40; attempt++) {
      const x = centerX + (Math.random() - 0.5) * w * 0.6;
      const y = centerY + (Math.random() - 0.65) * h * 0.5;
      if (Math.abs(x - centerX) < w * 0.12 && Math.abs(y - centerY) < h * 0.18) continue;

      let ok = true;
      for (const e of liveEntities) {
        if (Math.hypot(e.x - x, e.y - y) < MIN_ENTITY_DIST) { ok = false; break; }
      }
      if (!ok) continue;

      // Approximate tendril paths with straight A–B lines (cheap and close
      // enough; the actual bezier sways but not by more than MIN_CONN_DIST).
      for (const c of liveConns) {
        for (let i = 0; i <= 8; i++) {
          const t = i / 8;
          const sx = c.a.x + (c.b.x - c.a.x) * t;
          const sy = c.a.y + (c.b.y - c.a.y) * t;
          if (Math.hypot(sx - x, sy - y) < MIN_CONN_DIST) { ok = false; break; }
        }
        if (!ok) break;
      }
      if (!ok) continue;

      return { x, y };
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
      name: randomName(),
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
    cueSpawn();
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

  const entityByIdMap = useMemo(() => {
    const m = new Map<string, { x: number; y: number; charId: CharId }>();
    for (const e of entities) m.set(e.id, { x: e.x, y: e.y, charId: e.charId });
    return m;
  }, [entities]);

  return (
    <div className="stage">
      <Background />
      <TendrilLayer
        connections={connections}
        probes={probes}
        entityById={entityByIdMap}
      />

      {entities.map((e, i) => {
        const t = gazeMap.get(e.id);
        const sat = Math.max(LONELY_SAT_FLOOR, 1 - e.lonelyExposure * 0.35);
        const partner = e.partnerId ? entities.find((x) => x.id === e.partnerId) : null;
        const partnerColor = partner ? CHARACTERS[partner.charId].color : undefined;
        // Mother-tree status: an entity becomes a mother tree once it
        // has been on stage for MOTHER_AGE_MS. No explicit spawn of
        // mother trees — they emerge from ordinary mushrooms that stick
        // around long enough.
        const renderNow = performance.now();
        const isMotherTree =
          e.infectionState === 'normal' &&
          renderNow - e.bornAt > MOTHER_AGE_MS;
        return (
          <Entity
            key={e.id}
            id={e.id}
            charId={e.charId}
            name={e.name}
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
            isMotherTree={isMotherTree}
          />
        );
      })}

      <SparkleLayer />
      <Butterflies />

      {showDebug && <DebugSpawnBar onSpawn={handleDebugSpawn} />}

      {/* Mute toggle — tiny corner button, wakes the audio context on
       *  first tap so users who click it get ambient audio too. */}
      <button
        type="button"
        className="mute-toggle"
        aria-label={muted ? 'unmute audio' : 'mute audio'}
        onClick={() => {
          ensureAudioContext();
          ambientStart();
          const next = !isMuted();
          setMuted(next);
          setMutedState(next);
        }}
      >
        {muted ? '♪̸' : '♪'}
      </button>

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
            <div>the mycelium couldn't take shape</div>
            <div className="error-detail">{error}</div>
            <button onClick={clearError}>try again</button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
