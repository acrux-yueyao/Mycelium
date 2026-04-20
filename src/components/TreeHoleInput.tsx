/**
 * TreeHoleInput — the sentence portal.
 *
 * Behavior:
 *  - Hidden for MOUNT_DELAY_MS on initial mount, then softly fades in
 *    over ~1.5s so the page opens into a quiet beat before offering
 *    the prompt.
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

const MOUNT_DELAY_MS = 2000;

export function TreeHoleInput({ onSubmit, disabled, loading }: TreeHoleInputProps) {
  const [text, setText] = useState('');
  const [focused, setFocused] = useState(false);
  const [visible, setVisible] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Hold back for 2s on mount, then fade in.
  useEffect(() => {
    const id = window.setTimeout(() => setVisible(true), MOUNT_DELAY_MS);
    return () => window.clearTimeout(id);
  }, []);

  useEffect(() => {
    if (!visible) return;
    // Focus the textarea only after it's actually revealed.
    const id = window.setTimeout(() => textareaRef.current?.focus(), 300);
    return () => window.clearTimeout(id);
  }, [visible]);

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
    <motion.div
      className={`totem ${disabled ? 'dimmed' : ''}`}
      initial={{ opacity: 0, y: 18 }}
      animate={{
        opacity: visible ? 1 : 0,
        y: visible ? 0 : 18,
      }}
      transition={{ duration: 1.5, ease: [0.22, 0.6, 0.3, 1] }}
    >
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
            <div className="totem-eyebrow">Mycelium · Tree Hole</div>
            <textarea
              ref={textareaRef}
              className="totem-input"
              placeholder="today, my heart feels like…"
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
              <kbd>Enter</kbd> to whisper · <kbd>Shift + Enter</kbd> for a new line
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
              <span>the mycelium is listening</span>
              <span className="dots">
                <span>·</span><span>·</span><span>·</span>
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
