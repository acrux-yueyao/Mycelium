/**
 * TreeHoleInput — the sentence portal.
 *
 * Behavior:
 *  - Single-line visual style with auto-expanding textarea.
 *  - Enter submits (Shift+Enter for newline).
 *  - While `disabled` (parent is reading / growing) input is dimmed and
 *    keystrokes are ignored.
 *  - Clears on successful submit (parent cues it via onSubmit callback).
 */
import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export interface TreeHoleInputProps {
  onSubmit: (text: string) => void;
  disabled?: boolean;
  loading?: boolean;
}

export function TreeHoleInput({ onSubmit, disabled, loading }: TreeHoleInputProps) {
  const [text, setText] = useState('');
  const [focused, setFocused] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  // Auto-resize the textarea to fit content
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [text]);

  const commit = () => {
    const t = text.trim();
    if (!t || disabled) return;
    onSubmit(t);
    setText('');
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      commit();
    }
  };

  return (
    <div className={`totem ${disabled ? 'dimmed' : ''}`}>
      <AnimatePresence mode="wait">
        {!loading ? (
          <motion.div
            key="input"
            className="totem-inner"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.35 }}
          >
            <div className="totem-eyebrow">Mycelium · 树洞</div>
            <textarea
              ref={textareaRef}
              className="totem-input"
              placeholder="今天，心里像是⋯⋯"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={onKeyDown}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              rows={1}
              maxLength={240}
              disabled={disabled}
              spellCheck={false}
            />
            <div className={`totem-hint ${focused && text ? 'visible' : ''}`}>
              按 <kbd>Enter</kbd> 呼出 · <kbd>Shift + Enter</kbd> 换行
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="reading"
            className="totem-reading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4 }}
          >
            <div className="totem-reading-inner">
              <span>菌丝正在凝听</span>
              <span className="dots">
                <span>·</span><span>·</span><span>·</span>
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
