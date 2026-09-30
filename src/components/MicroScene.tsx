/**
 * MicroScene — kiosk-only view for the tower's low panel.
 *
 * A microscope over the newest resident: the latest creature rendered
 * huge (chunky pixels), breathing slowly, beside its specimen readout.
 * The whispered sentence itself is deliberately NOT shown — whispers
 * stay private; only the organism they grew is public.
 *
 * Tower link: when a visitor picks a spore on the 15.6" field, the field
 * streams it over the LAN bus (core/towerBus) and this panel becomes its
 * microscope instead — same layout, but live: its colour exchange plays out
 * cell by cell, it sways and looks where it's being dragged, and it
 * squirms (throwing off a few pixel motes) while the cursor pets it.
 * Released (or silent for a few seconds) → back to the newest resident.
 */
import { useEffect, useRef, useState, type MutableRefObject } from 'react';
import { motion } from 'framer-motion';
import { CreatureThumb } from './CreatureThumb';
import type { FieldCreature } from './DitherField';
import { nameFor } from '../core/names';
import { CHARACTERS } from '../data/characters';
import { agedSpec, drawMoshCreature } from '../core/fieldRender';
import { Rng, xmur3 } from '../core/seed';
import { towerSubscribe, type TowerInfo, type TowerMsg, type TowerSeed } from '../core/towerBus';

interface Props {
  creatures: FieldCreature[];
}

type Frame = Extract<TowerMsg, { t: 'frame' }>;
interface FrameSlot { f: Frame | null; rxAt: number }
/** the field went quiet this long (no heartbeat) → treat as released */
const STALE_MS = 6000;

function fmtBorn(ms?: number): string {
  return ms
    ? new Date(ms).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '—';
}

function liveLine(info: TowerInfo, drag: boolean, pet: boolean): string {
  if (drag) return 'being held';
  if (pet) return 'being petted';
  const d = info.dye;
  if (d) {
    const pct = Math.round(d.progress * 100);
    if (d.phase === 'exchanging') return `exchanging colour with ${d.from} · ${pct}%`;
    if (d.phase === 'holding') return `keeping ${d.from}'s colour · ${pct}%`;
    return `letting ${d.from}'s colour fade · ${pct}%`;
  }
  if (info.perm) return 'carries an old encounter';
  return info.bonds > 0 ? `resting · ${info.bonds} bond${info.bonds > 1 ? 's' : ''}` : 'resting · its own palette';
}

export function MicroScene({ creatures }: Props) {
  // the tower's 7" panel is only 480px tall — shrink the microscope so
  // the specimen and its readout both stay on the slide
  const compact = typeof window !== 'undefined' && window.innerHeight <= 560;
  const cell = compact ? 4 : 7;
  const height = compact ? 280 : 430;

  const [obs, setObs] = useState<{ seed: TowerSeed; info: TowerInfo } | null>(null);
  const [mood, setMood] = useState({ drag: false, pet: false });
  const frameRef = useRef<FrameSlot>({ f: null, rxAt: 0 });
  const lastRx = useRef(0);

  useEffect(() => {
    // gate on the URL, not body.kiosk-mode: App adds that class in its own
    // effect, which runs AFTER this child effect on first mount
    if (new URLSearchParams(window.location.search).get('kiosk') !== 'micro') return;
    const off = towerSubscribe((m) => {
      lastRx.current = Date.now();
      if (m.t === 'obs') {
        setObs((cur) => (cur && cur.seed.id === m.seed.id && cur.info === m.info ? cur : { seed: m.seed, info: m.info }));
      } else if (m.t === 'frame') {
        frameRef.current = { f: m, rxAt: Date.now() };
        setMood((cur) => (cur.drag === m.drag && cur.pet === m.pet ? cur : { drag: m.drag, pet: m.pet }));
      } else if (m.t === 'rel') {
        setObs(null);
        setMood({ drag: false, pet: false });
      }
    });
    // field crashed / unplugged mid-observation: don't freeze on a ghost
    const id = window.setInterval(() => {
      if (Date.now() - lastRx.current > STALE_MS) setObs(null);
    }, 1000);
    return () => { off(); window.clearInterval(id); };
  }, []);

  const latest = creatures[0];
  if (!obs && !latest) {
    return (
      <div className="micro-scene">
        <div className="micro-meta">AWAITING THE FIRST WHISPER…</div>
      </div>
    );
  }

  // one readout for both modes — the layout never changes
  const s = obs
    ? { id: obs.seed.id, name: obs.seed.name, charId: obs.seed.charId, intensity: obs.seed.intensity, bornAt: obs.seed.bornAt }
    : { id: latest.id, name: latest.name || nameFor(latest.id), charId: latest.charId, intensity: latest.intensity, bornAt: latest.bornAt };
  const family = CHARACTERS[s.charId]?.name ?? '—';

  return (
    <motion.div
      className="micro-scene"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 1.0 }}
    >
      <motion.div
        className="micro-stage"
        key={(obs ? 'obs:' : 'new:') + s.id}
        initial={{ scale: 0.92, opacity: 0 }}
        animate={{ scale: [1, 1.03, 1], opacity: 1 }}
        transition={{
          opacity: { duration: obs ? 0.45 : 0.8 },
          scale: { duration: 6, repeat: Infinity, ease: 'easeInOut' },
        }}
      >
        {obs
          ? <LiveSpecimen seed={obs.seed} slot={frameRef} cell={cell} height={height} />
          : <CreatureThumb creature={latest} cell={cell} height={height} />}
      </motion.div>
      <div className="micro-meta">
        <div className="micro-label">
          {obs ? <>UNDER OBSERVATION<i className="micro-live-dot" /></> : 'NEWEST RESIDENT'}
        </div>
        <div className="micro-name">{s.name}</div>
        <div className="micro-row">family · {family}</div>
        <div className="micro-row">intensity · {(s.intensity * 100).toFixed(0)}%</div>
        <div className="micro-row">born · {fmtBorn(s.bornAt)}</div>
        {obs && <div className="micro-row micro-live">now · {liveLine(obs.info, mood.drag, mood.pet)}</div>}
        <div className="micro-row micro-dim">id · {s.id.slice(0, 12)}</div>
      </div>
    </motion.div>
  );
}

/** The observed spore, redrawn every frame from the field's live stream.
 *  Same canvas geometry as CreatureThumb so the slide doesn't jump. */
function LiveSpecimen({ seed, slot, cell, height }: {
  seed: TowerSeed; slot: MutableRefObject<FrameSlot>; cell: number; height: number;
}) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const g = cv.getContext('2d');
    if (!g) return;
    const spec = agedSpec(seed, seed.bornAt ?? null);
    const pad = 6;
    const w = (spec.cols + pad) * cell, h = (spec.rows + pad) * cell;
    const dpr = 2;
    cv.width = w * dpr; cv.height = h * dpr;
    cv.style.height = height + 'px';
    cv.style.width = (w * height) / h + 'px';
    const ox = (pad / 2) * cell, oy = (pad / 3) * cell;
    const cx = ox + (spec.cols * cell) / 2, cy = oy + (spec.rows * cell) / 2;
    const restGaze = (new Rng(xmur3(seed.id + ':rest')()).next() < 0.5 ? -1 : 1) * 0.85;
    const palette = spec.cells.map((c) => c.color);

    let gaze = restGaze, tilt = 0, squish = 0, raf = 0, lastSpark = 0;
    let blinkAt = performance.now() + 2000 + Math.random() * 3000;
    const motes: Array<{ x: number; y: number; vx: number; vy: number; born: number; color: string }> = [];

    const loop = (now: number) => {
      const { f: fr, rxAt } = slot.current;
      const f = fr && fr.id === seed.id ? fr : null;
      const live = f && Date.now() - rxAt < 1500 ? f : null;

      // eyes follow the motion on the field; rest gaze when still
      const speed = live ? Math.hypot(live.vx, live.vy) : 0;
      const tGaze = live && speed > 0.3 ? Math.max(-1, Math.min(1, live.vx / 2)) * 0.85 : restGaze;
      gaze += (tGaze - gaze) * 0.12;
      // held: lean into the drag and wobble; otherwise settle upright
      const tTilt = live?.drag
        ? Math.max(-0.32, Math.min(0.32, live.vx * 0.035)) + Math.sin(now * 0.018) * 0.05
        : 0;
      tilt += (tTilt - tilt) * 0.15;
      // petted: a soft squirm
      squish += ((live?.pet ? 1 : 0) - squish) * 0.1;
      const sq = squish * 0.055 * Math.sin(now * 0.013);
      // blink: the field's own blink while live, else a local idle blink
      let blink = !!live?.blink;
      if (!live) {
        if (now > blinkAt + 140) blinkAt = now + 2500 + Math.random() * 4000;
        blink = now >= blinkAt && now < blinkAt + 140;
      }

      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, w, h);
      g.save();
      g.translate(cx, cy + (live?.drag ? -cell * 0.8 : 0));
      g.rotate(tilt);
      g.scale(1 + sq, 1 - sq);
      g.translate(-cx, -cy);
      drawMoshCreature(g, spec, ox, oy, cell, seed.id, gaze, f?.dye ?? null, blink);
      g.restore();

      // petting throws off motes in the spore's own colours
      if (squish > 0.5 && now - lastSpark > 160) {
        lastSpark = now;
        motes.push({
          x: cx + (Math.random() - 0.5) * spec.cols * cell * 0.7,
          y: oy + cell * 1.5,
          vx: (Math.random() - 0.5) * 0.25, vy: -0.35 - Math.random() * 0.35,
          born: now, color: palette[(Math.random() * palette.length) | 0] ?? '#fff',
        });
      }
      for (let i = motes.length - 1; i >= 0; i--) {
        const m = motes[i];
        const age = (now - m.born) / 1400;
        if (age >= 1) { motes.splice(i, 1); continue; }
        m.x += m.vx; m.y += m.vy;
        g.globalAlpha = 1 - age;
        g.fillStyle = m.color;
        g.fillRect(Math.round(m.x / cell) * cell, Math.round(m.y / cell) * cell, cell, cell);
      }
      g.globalAlpha = 1;
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [seed, slot, cell, height]);

  return <canvas ref={ref} style={{ imageRendering: 'pixelated', display: 'block' }} aria-hidden />;
}
