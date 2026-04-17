/**
 * Gallery — debug/audit view showing every base character and every
 * hybrid in one screen. Access by appending `?gallery` to the URL.
 *
 * IMPORTANT: hybrid labels only show the filename letter-pair (A_B,
 * B_E, …). We deliberately do NOT render a "char0 × char1" style
 * label next to each hybrid, because the hand-drawn hybrid PNGs
 * don't consistently match that mapping — the goal of this view is
 * to let you spot those mismatches. The top strip shows what each
 * letter is SUPPOSED to be per current code.
 */
import { useEffect, useState } from 'react';
import { Entity } from './Entity';
import { CHARACTERS, type CharId } from '../data/characters';

const TILE = 200;
const GAP = 12;
const LABEL_H = 28;
const KEY_TILE = 110;

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
        label: `${LETTER[a]}_${LETTER[b]}`,
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
    label: `${LETTER[id]}  char${id}  ${CHARACTERS[id].name}`,
  }));
}

export function Gallery() {
  const bases = baseTiles();
  const hybrids = hybridTiles();
  const [gazeTick, setGazeTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setGazeTick((t) => t + 1), 2500);
    return () => window.clearInterval(id);
  }, []);
  const gazeOffset = 40;
  const gazeAngle = (gazeTick * Math.PI) / 4;

  const renderTile = (t: TileSpec, col: number, row: number, tileSize = TILE) => {
    const left = col * (tileSize + GAP);
    const top = row * (tileSize + LABEL_H + GAP);
    const ex = left + tileSize / 2;
    const ey = top + tileSize / 2;
    const gx = ex + Math.cos(gazeAngle) * gazeOffset;
    const gy = ey + Math.sin(gazeAngle) * gazeOffset;
    return (
      <div
        key={t.key}
        style={{
          position: 'absolute',
          left,
          top,
          width: tileSize,
          height: tileSize + LABEL_H,
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
            width: tileSize,
            height: tileSize,
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
          size={tileSize - 24}
          gazeTargetX={gx}
          gazeTargetY={gy}
          infectionState={t.infectionState}
          infectionPair={t.infectionPair}
        />
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: tileSize + 4,
            width: tileSize,
            fontVariantNumeric: 'tabular-nums',
            letterSpacing: '0.04em',
          }}
        >
          {t.label}
        </div>
      </div>
    );
  };

  const BASE_COLS = 6;
  const HYB_COLS = 5;
  const KEY_COLS = 6;
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
  const warnStyle: React.CSSProperties = {
    fontFamily: 'system-ui, sans-serif',
    fontSize: 12,
    color: '#a85b3f',
    margin: '4px 16px 16px',
    maxWidth: 760,
    lineHeight: 1.6,
  };

  const baseHeight = baseRows * (TILE + LABEL_H + GAP);
  const hybridHeight = hybridRows * (TILE + LABEL_H + GAP);
  const keyHeight = KEY_TILE + LABEL_H + GAP;

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
      <div style={headingStyle}>字母对照（代码里的 charId → 字母）</div>
      <div
        style={{
          position: 'relative',
          width: KEY_COLS * (KEY_TILE + GAP),
          height: keyHeight,
          margin: '0 auto',
        }}
      >
        {bases.map((t, i) =>
          renderTile(
            { ...t, label: `${LETTER[t.charId]} = char${t.charId} ${CHARACTERS[t.charId].name}` },
            i % KEY_COLS,
            Math.floor(i / KEY_COLS),
            KEY_TILE,
          ),
        )}
      </div>
      <div style={warnStyle}>
        ⚠️ 下面 15 张杂交图的标签只写文件名字母对（A_B / B_E / …），
        <strong>不写"放射星×水泡"这种中文 pair 名</strong>。
        因为手绘 hybrid PNG 里实际画的东西不一定等于上方"字母 → 角色"表推出来的组合——
        这正是要用这个视图检查的。对不上的 pair 告诉我文件名（比如 "A_C 画的其实是 …"），我再修 HYBRID_LETTER 映射或者替换文件。
      </div>

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

      <div style={headingStyle}>杂交菌（15 张 · hybrid 终态 · 标签为文件名）</div>
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

      <div style={{ height: 60 }} />
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
    </div>
  );
}
