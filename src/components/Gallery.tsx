/**
 * Gallery — debug/audit view showing every base character and every
 * hybrid in one screen. Access by appending `?gallery` to the URL.
 * Each tile uses the real <Entity> component so face positions,
 * blinks, and animations match exactly what the live stage shows.
 */
import { useEffect, useState } from 'react';
import { Entity } from './Entity';
import { CHARACTERS, type CharId } from '../data/characters';

const TILE = 200;
const GAP = 12;
const LABEL_H = 28;

interface TileSpec {
  key: string;
  charId: CharId;
  label: string;
  infectionState?: 'normal' | 'hybrid';
  infectionPair?: [CharId, CharId];
}

const LETTER: Record<CharId, string> = { 0: 'A', 1: 'B', 2: 'C', 3: 'D', 4: 'E', 5: 'F' };

function hybridTiles(): TileSpec[] {
  const out: TileSpec[] = [];
  for (let a = 0 as CharId; a < 6; a = (a + 1) as CharId) {
    for (let b = (a + 1) as CharId; b < 6; b = (b + 1) as CharId) {
      out.push({
        key: `h-${a}-${b}`,
        charId: a,
        label: `${LETTER[a]}_${LETTER[b]}  ${CHARACTERS[a].name} × ${CHARACTERS[b].name}`,
        infectionState: 'hybrid',
        infectionPair: [a, b],
      });
    }
  }
  return out;
}

function baseTiles(): TileSpec[] {
  return ([0, 1, 2, 3, 4, 5] as CharId[]).map((id) => ({
    key: `b-${id}`,
    charId: id,
    label: `${LETTER[id]}  char${id} ${CHARACTERS[id].name}`,
  }));
}

export function Gallery() {
  const bases = baseTiles();
  const hybrids = hybridTiles();
  const [gazeTick, setGazeTick] = useState(0);
  // Make all entities slowly rotate their gaze so we can verify the
  // programmatic eye tracking works in both normal and hybrid states.
  useEffect(() => {
    const id = window.setInterval(() => setGazeTick((t) => t + 1), 2500);
    return () => window.clearInterval(id);
  }, []);
  const gazeOffset = 40;
  const gazeAngle = (gazeTick * Math.PI) / 4;

  const renderTile = (t: TileSpec, col: number, row: number) => {
    const left = col * (TILE + GAP);
    const top = row * (TILE + LABEL_H + GAP);
    // Entity positions itself via x/y at its center; place at tile center.
    const ex = left + TILE / 2;
    const ey = top + TILE / 2;
    const gx = ex + Math.cos(gazeAngle) * gazeOffset;
    const gy = ey + Math.sin(gazeAngle) * gazeOffset;
    return (
      <div
        key={t.key}
        style={{
          position: 'absolute',
          left,
          top,
          width: TILE,
          height: TILE + LABEL_H,
          boxSizing: 'border-box',
          textAlign: 'center',
          fontFamily: 'system-ui, sans-serif',
          fontSize: 12,
          color: '#4a4540',
        }}
      >
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            width: TILE,
            height: TILE,
            background: 'rgba(255, 255, 255, 0.35)',
            border: '1px dashed rgba(180, 160, 140, 0.4)',
            borderRadius: 8,
            overflow: 'hidden',
          }}
        />
        <Entity
          id={t.key}
          charId={t.charId}
          x={ex}
          y={ey}
          size={TILE - 24}
          gazeTargetX={gx}
          gazeTargetY={gy}
          infectionState={t.infectionState}
          infectionPair={t.infectionPair}
        />
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: TILE + 4,
            width: TILE,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {t.label}
        </div>
      </div>
    );
  };

  const BASE_COLS = 6;
  const HYB_COLS = 5;
  const baseRows = Math.ceil(bases.length / BASE_COLS);
  const hybridRows = Math.ceil(hybrids.length / HYB_COLS);

  const headingStyle: React.CSSProperties = {
    fontFamily: 'system-ui, sans-serif',
    fontSize: 14,
    fontWeight: 600,
    color: '#6b5f56',
    margin: '24px 16px 8px',
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
  };

  const baseHeight = baseRows * (TILE + LABEL_H + GAP);
  const hybridHeight = hybridRows * (TILE + LABEL_H + GAP);
  const baseBlockHeight = baseHeight + 40;
  const hybridBlockHeight = hybridHeight + 40;

  return (
    <div
      className="gallery"
      style={{
        position: 'absolute',
        inset: 0,
        background: '#f4ecdf',
        overflow: 'auto',
        padding: 16,
        boxSizing: 'border-box',
      }}
    >
      <div style={headingStyle}>基础菌（6 只）</div>
      <div
        style={{
          position: 'relative',
          width: BASE_COLS * (TILE + GAP),
          height: baseHeight,
          margin: '0 auto',
        }}
      >
        {bases.map((t, i) =>
          renderTile(t, i % BASE_COLS, Math.floor(i / BASE_COLS)),
        )}
      </div>

      <div style={headingStyle}>杂交菌（15 对 · 全部呈 hybrid 终态）</div>
      <div
        style={{
          position: 'relative',
          width: HYB_COLS * (TILE + GAP),
          height: hybridHeight,
          margin: '0 auto',
        }}
      >
        {hybrids.map((t, i) =>
          renderTile(t, i % HYB_COLS, Math.floor(i / HYB_COLS)),
        )}
      </div>

      <div style={{ height: 40 }} />
      <div
        style={{
          position: 'absolute',
          top: 12,
          right: 16,
          fontFamily: 'system-ui, sans-serif',
          fontSize: 12,
          color: '#8a7f76',
        }}
      >
        回到主界面：把 URL 里的 <code>?gallery</code> 去掉
      </div>
      {/* Silences unused-variable lints for rows counts: */}
      <div style={{ display: 'none' }}>{baseBlockHeight + hybridBlockHeight}</div>
    </div>
  );
}
