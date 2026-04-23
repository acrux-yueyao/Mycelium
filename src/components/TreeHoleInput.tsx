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
import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSpeechRecognition } from '../hooks/useSpeechRecognition';

export interface TreeHoleInputProps {
  onSubmit: (text: string) => void;
  disabled?: boolean;
  loading?: boolean;
}

const MOUNT_DELAY_MS = 2000;

function MicIcon({ listening }: { listening: boolean }) {
  // Simple mic glyph; the button rim handles the pulse. Fill changes
  // so a listening mic reads visually "on" without an extra element.
  const color = listening ? '#E69B6E' : 'currentColor';
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" aria-hidden>
      <rect x="7" y="2.5" width="6" height="10" rx="3" fill={color} />
      <path
        d="M4 9 a6 6 0 0 0 12 0"
        stroke={color}
        strokeWidth="1.6"
        fill="none"
        strokeLinecap="round"
      />
      <line x1="10" y1="15" x2="10" y2="18" stroke={color} strokeWidth="1.6" strokeLinecap="round" />
      <line x1="7" y1="18" x2="13" y2="18" stroke={color} strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export function TreeHoleInput({ onSubmit, disabled, loading }: TreeHoleInputProps) {
  const [text, setText] = useState('');
  const [focused, setFocused] = useState(false);
  const [visible, setVisible] = useState(false);
  const [loadingSecs, setLoadingSecs] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Voice dictation. Final utterances get appended to the textarea
  // (with a space join) so the user can speak in bursts, keep
  // reviewing, then hit Enter. Interim caption is drawn below.
  const speech = useSpeechRecognition({
    onFinal: (t) => {
      setText((prev) => (prev ? `${prev} ${t}` : t));
    },
  });

  // Tick a seconds counter while loading so we can show progressive
  // reassurance text instead of leaving the user staring at the same
  // three dots for 30s when the backend is slow.
  useEffect(() => {
    if (!loading) { setLoadingSecs(0); return; }
    setLoadingSecs(0);
    const id = window.setInterval(() => setLoadingSecs((s) => s + 1), 1000);
    return () => window.clearInterval(id);
  }, [loading]);

  const loadingMessage = useMemo(() => {
    if (loadingSecs < 6)  return 'the mycelium is listening';
    if (loadingSecs < 14) return 'still listening, slow wind today';
    if (loadingSecs < 24) return 'taking longer than usual…';
    return 'mycelium is very slow today, hang on';
  }, [loadingSecs]);

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
            <div className="totem-input-row">
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
              {speech.supported && (
                <button
                  type="button"
                  className={`mic-button ${speech.listening ? 'listening' : ''}`}
                  onClick={speech.listening ? speech.stop : speech.start}
                  disabled={disabled}
                  aria-label={
                    speech.listening ? 'stop listening' : 'speak into the mycelium'
                  }
                  title={speech.listening ? 'tap to stop' : 'tap to speak'}
                >
                  <MicIcon listening={speech.listening} />
                </button>
              )}
            </div>
            <AnimatePresence>
              {speech.listening && (
                <motion.div
                  key="interim"
                  className="totem-interim"
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.25 }}
                >
                  <span className="mic-pulse" />
                  {speech.interim || (
                    <span className="totem-interim-hint">listening…</span>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
            {speech.error && !speech.listening && (
              <div className="totem-interim totem-interim-error">
                microphone: {speech.error}
              </div>
            )}
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
              <AnimatePresence mode="wait">
                <motion.span
                  key={loadingMessage}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.35 }}
                >
                  {loadingMessage}
                </motion.span>
              </AnimatePresence>
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
