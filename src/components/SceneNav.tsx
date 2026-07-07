/**
 * SceneNav — the top bar shown in the field / archive / feedback scenes.
 * Editorial mono nav that moves between the rooms of the world and shows
 * the living population.
 */
export type Scene = 'landing' | 'field' | 'archive' | 'feedback' | 'survey';

interface Props {
  scene: Scene;
  population: number;
  onNavigate: (s: Scene) => void;
}

const LINKS: Array<{ key: Scene; label: string }> = [
  { key: 'field', label: 'FIELD' },
  { key: 'archive', label: 'ARCHIVE' },
  { key: 'survey', label: 'FEEDBACK' },
];

export function SceneNav({ scene, population, onNavigate }: Props) {
  return (
    <div className="scene-nav">
      <button className="scene-nav-brand" onClick={() => onNavigate('landing')}>
        MYCELIUM
      </button>
      <nav className="scene-nav-links">
        {LINKS.map((l) => (
          <button
            key={l.key}
            className={`scene-nav-link${scene === l.key ? ' is-active' : ''}`}
            onClick={() => onNavigate(l.key)}
          >
            {l.label}
          </button>
        ))}
      </nav>
      <div className="scene-nav-pop">
        POP.&nbsp;<span style={{ fontVariantNumeric: 'tabular-nums' }}>{population.toLocaleString()}</span>
      </div>
    </div>
  );
}
