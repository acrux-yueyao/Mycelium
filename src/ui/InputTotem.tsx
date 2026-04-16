import { useRef, useState, useEffect } from 'react';
import type { TypingRhythm } from '../core/seed';

interface Props {
  onSubmit: (text: string, rhythm: TypingRhythm) => void;
  fading: boolean;
}

/**
 * InputTotem — the textual ritual. Dark organic backdrop, serif,
 * single text field. We silently observe typing rhythm (interval,
 * velocity, longest pause) as seed salt; the user never sees it.
 */
export function InputTotem({ onSubmit, fading }: Props) {
  const [text, setText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const keyTimes = useRef<number[]>([]);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    keyTimes.current.push(performance.now());
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      commit();
    }
  };

  const commit = () => {
    const t = text.trim();
    if (!t) return;
    onSubmit(t, computeRhythm(keyTimes.current));
  };

  return (
    <div className={`totem ${fading ? 'fading' : ''}`}>
      <div className="totem-eyebrow">Mycelium · Genesis</div>
      <textarea
        ref={textareaRef}
        className="totem-input"
        placeholder="今天，心里像是⋯⋯"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKeyDown}
        rows={3}
        maxLength={240}
      />
      <div className="totem-hint">
        按 <kbd>Enter</kbd> 将语句呼出，菌丝会在黑暗中成形
      </div>
    </div>
  );
}

function computeRhythm(times: number[]): TypingRhythm {
  if (times.length < 2) return { per: 0, vel: 0, att: 0 };
  const deltas: number[] = [];
  for (let i = 1; i < times.length; i++) deltas.push(times[i] - times[i - 1]);
  const sorted = [...deltas].sort((a, b) => a - b);
  const per = sorted[Math.floor(sorted.length / 2)];
  const duration = (times[times.length - 1] - times[0]) / 1000;
  const vel = duration > 0 ? times.length / duration : 0;
  const att = Math.max(...deltas);
  return { per, vel, att };
}
