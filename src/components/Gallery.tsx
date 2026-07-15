/**
 * Gallery — debug/audit view for the procedural pixel-spore generator.
 * Access by appending `?gallery` to the URL.
 *
 * Shows the 6 emotion palette families; each row is several distinct
 * specimens (different seeds) at rising intensity, so you can eyeball
 * that (a) each family reads as its own palette, (b) same-family spores
 * are all different, and (c) intensity widens mono → rainbow. Hybrids
 * are no longer fixed art (they're a per-pair dye at runtime), so there
 * is no hybrid grid here.
 */
import { useEffect, useState } from 'react';
import { Entity } from './Entity';
import { CHARACTERS, type CharId } from '../data/characters';
import type { Morphology } from '../core/emotion';

const TILE = 150;
const GAP = 14;
const LABEL_H = 26;
const PER_ROW = 7;

const FAMILY_HUE: Record<CharId, number> = { 0: 24, 1: 205, 2: 32, 3: 268, 4: 158, 5: 222 };

interface TileSpec {
  key: string;
  charId: CharId;
  intensity: number;
  morphology: Morphology;
  label: string;
}

function familyTiles(charId: CharId): TileSpec[] {
  const out: TileSpec[] = [];
  for (let k = 0; k < PER_ROW; k++) {
    const intensity = 0.12 + (k / (PER_ROW - 1)) * 0.83;
    const density = 0.35 + ((k * 3) % PER_ROW) / PER_ROW * 0.6;
    out.push({
      key: `fam-${charId}-${k}`,
      charId,
      intensity,
      morphology: {
        density,
        agitation: 0.3,
        tendrilCount: 5,
        glow: 0.15,
        // gently vary the accent hue around the family base so tiles
        // stay recognizably in-family (real spores get tintHue from
        // the LLM to fit the sentence).
        tintHue: (FAMILY_HUE[charId] + (k - 3) * 14 + 360) % 360,
        particles: false,
      },
      label: `i·${intensity.toFixed(2)}`,
    });
  }
  return out;
}

export function Gallery() {
  const [gazeTick, setGazeTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setGazeTick((t) => t + 1), 2200);
    return () => window.clearInterval(id);
  }, []);
  const gazeAngle = (gazeTick * Math.PI) / 4;
  const gazeOffset = 40;

  const renderTile = (t: TileSpec, col: number, row: number) => {
    const left = col * (TILE + GAP);
    const top = row * (TILE + LABEL_H + GAP);
    // Entity centers itself at (x,y) relative to THIS tile div (its
    // positioned parent), so use tile-local center, not row-global.
    const cx = TILE / 2;
    const cy = TILE / 2;
    const gx = cx + Math.cos(gazeAngle) * gazeOffset;
    const gy = cy + Math.sin(gazeAngle) * gazeOffset;
    return (
      <div
        key={t.key}
        style={{
          position: 'absolute',
          left,
          top,
          width: TILE,
          height: TILE + LABEL_H,
          textAlign: 'center',
          fontFamily: 'ui-monospace, monospace',
          fontSize: 11,
          color: '#9d9c92',
        }}
      >
        <Entity
          id={t.key}
          charId={t.charId}
          morphology={t.morphology}
          intensity={t.intensity}
          x={cx}
          y={cy}
          size={TILE - 24}
          gazeTargetX={gx}
          gazeTargetY={gy}
        />
        <div style={{ position: 'absolute', left: 0, top: TILE + 2, width: TILE, letterSpacing: '0.04em' }}>
          {t.label}
        </div>
      </div>
    );
  };

  const headingStyle: React.CSSProperties = {
    fontFamily: 'system-ui, sans-serif',
    fontSize: 13,
    fontWeight: 600,
    color: '#6b6a62',
    margin: '22px 16px 8px',
    letterSpacing: '0.04em',
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  };

  const families = ([0, 1, 2, 3, 4, 5] as CharId[]);
  const rowH = TILE + LABEL_H + GAP;

  return (
    <div
      className="gallery"
      style={{
        position: 'absolute',
        inset: 0,
        background: '#F1F0EB',
        overflow: 'auto',
        padding: 16,
        boxSizing: 'border-box',
      }}
    >
      <div style={{ ...headingStyle, fontSize: 15, textTransform: 'none' }}>
        Mycelium · pixel-spore generator · 6 emotion palette families
      </div>
      {families.map((charId) => {
        const tiles = familyTiles(charId);
        return (
          <div key={charId}>
            <div style={headingStyle}>
              <span
                style={{
                  width: 12, height: 12, borderRadius: 3,
                  background: `hsl(${FAMILY_HUE[charId]},55%,55%)`,
                  boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.15)',
                }}
              />
              {CHARACTERS[charId].name} · {CHARACTERS[charId].emotions.join(' · ')}
            </div>
            <div style={{ position: 'relative', width: PER_ROW * (TILE + GAP), height: rowH, margin: '0 auto 4px' }}>
              {tiles.map((t, i) => renderTile(t, i, 0))}
            </div>
          </div>
        );
      })}

      <div style={{ height: 60 }} />
      <div
        style={{
          position: 'absolute', top: 12, right: 16,
          fontFamily: 'system-ui, sans-serif', fontSize: 12, color: '#9d9c92',
        }}
      >
        back to the stage: drop <code>?gallery</code> from the URL
      </div>
    </div>
  );
}
