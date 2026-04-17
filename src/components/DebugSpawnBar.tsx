/**
 * DebugSpawnBar — appears when ?debug is in the URL. Type a sequence
 * of letters (A-F, case insensitive, separators ignored) and press
 * Enter to spawn one mushroom per letter, bypassing the emotion API.
 *
 *   A=char0 radial, B=char1 bubble, C=char2 mushroom,
 *   D=char3 glitter, E=char4 cups, F=char5 shrub
 */
import { useState } from 'react';
import type { CharId } from '../data/characters';

const LETTER_TO_CHARID: Record<string, CharId> = {
  a: 0, b: 1, c: 2, d: 3, e: 4, f: 5,
};

interface Props {
  onSpawn: (ids: CharId[]) => void;
}

export function DebugSpawnBar({ onSpawn }: Props) {
  const [text, setText] = useState('');
  const submit = () => {
    const ids: CharId[] = [];
    for (const ch of text.toLowerCase()) {
      const id = LETTER_TO_CHARID[ch];
      if (id != null) ids.push(id);
    }
    if (ids.length === 0) return;
    onSpawn(ids);
    setText('');
  };
  const spawnOne = (id: CharId) => onSpawn([id]);

  const btn = (id: CharId): React.CSSProperties => ({
    padding: '4px 8px',
    border: '1px solid rgba(0, 0, 0, 0.12)',
    borderRadius: 4,
    background: '#fff',
    cursor: 'pointer',
    fontFamily: 'system-ui, sans-serif',
    fontSize: 11,
    color: '#444',
    marginLeft: id === 0 ? 0 : 4,
  });

  return (
    <div
      style={{
        position: 'fixed',
        top: 16,
        right: 16,
        zIndex: 100,
        background: 'rgba(255, 255, 255, 0.9)',
        border: '1px solid rgba(0, 0, 0, 0.1)',
        borderRadius: 8,
        padding: '10px 12px',
        fontFamily: 'system-ui, sans-serif',
        fontSize: 12,
        color: '#444',
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.06)',
        minWidth: 280,
      }}
    >
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <span style={{ color: '#666', fontSize: 11 }}>spawn:</span>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit();
          }}
          placeholder="A B C D  (Enter)"
          style={{
            flex: 1,
            padding: '4px 6px',
            border: '1px solid #ccc',
            borderRadius: 4,
            fontFamily: 'monospace',
            fontSize: 12,
            outline: 'none',
          }}
        />
        <button onClick={submit} style={btn(0)}>
          召唤
        </button>
      </div>
      <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap' }}>
        {(['A', 'B', 'C', 'D', 'E', 'F'] as const).map((letter, idx) => (
          <button
            key={letter}
            onClick={() => spawnOne(idx as CharId)}
            style={btn(idx as CharId)}
            title={`spawn ${letter}`}
          >
            {letter}
          </button>
        ))}
      </div>
      <div style={{ marginTop: 6, fontSize: 10, color: '#888', lineHeight: 1.5 }}>
        A radial · B bubble · C mushroom · D glitter · E cups · F shrub
      </div>
    </div>
  );
}
