/**
 * Browser SpeechRecognition wrapper. Chromium and WebKit ship it as
 * `webkitSpeechRecognition`; Firefox doesn't implement it at all, so
 * `supported = false` in that case and the UI hides the mic button
 * rather than fail on click.
 *
 * Usage model is single-utterance: start() → user speaks → short
 * silence auto-ends the session → onFinal fires with the transcript.
 * During listening, `interim` reflects the in-progress recognition
 * text so the UI can show a live caption.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

interface SpeechResultAlternative {
  transcript: string;
}
interface SpeechResult {
  isFinal: boolean;
  0: SpeechResultAlternative;
  length: number;
}
interface SpeechEvent {
  resultIndex: number;
  results: ArrayLike<SpeechResult>;
}
interface SpeechErrorEvent {
  error: string;
}
interface SpeechRecognitionInstance {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: SpeechEvent) => void) | null;
  onerror: ((e: SpeechErrorEvent) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionInstance;

interface Options {
  /** BCP-47 language tag. Defaults to browser locale → zh-CN or en-US. */
  lang?: string;
  /** Called once with each final utterance. interim updates go to the
   *  `interim` state instead so the caller can show a live caption. */
  onFinal?: (text: string) => void;
}

export function useSpeechRecognition({ lang, onFinal }: Options = {}) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState('');
  const [error, setError] = useState<string | null>(null);
  const recRef = useRef<SpeechRecognitionInstance | null>(null);
  const onFinalRef = useRef(onFinal);
  useEffect(() => { onFinalRef.current = onFinal; }, [onFinal]);

  const resolvedLang =
    lang ??
    (typeof navigator !== 'undefined' &&
     navigator.language &&
     navigator.language.toLowerCase().startsWith('zh')
       ? 'zh-CN'
       : 'en-US');

  useEffect(() => {
    const w = window as unknown as {
      SpeechRecognition?: SpeechRecognitionCtor;
      webkitSpeechRecognition?: SpeechRecognitionCtor;
    };
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Ctor) {
      setSupported(false);
      return;
    }
    setSupported(true);
    const rec = new Ctor();
    rec.lang = resolvedLang;
    rec.continuous = false;
    rec.interimResults = true;
    rec.onresult = (event: SpeechEvent) => {
      let interimText = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          const text = result[0].transcript.trim();
          if (text) onFinalRef.current?.(text);
        } else {
          interimText += result[0].transcript;
        }
      }
      setInterim(interimText);
    };
    rec.onend = () => {
      setListening(false);
      setInterim('');
    };
    rec.onerror = (e: SpeechErrorEvent) => {
      console.error('[speech]', e.error);
      // 'no-speech' and 'aborted' are normal silences — don't flash
      // an error toast for those.
      if (e.error !== 'no-speech' && e.error !== 'aborted') {
        setError(String(e.error));
      }
      setListening(false);
    };
    recRef.current = rec;
    return () => {
      try { rec.abort(); } catch { /* already stopped */ }
      recRef.current = null;
    };
  }, [resolvedLang]);

  const start = useCallback(() => {
    const rec = recRef.current;
    if (!rec || listening) return;
    setError(null);
    setInterim('');
    try {
      rec.start();
      setListening(true);
    } catch (e) {
      // Chrome throws if start() is called twice in quick succession.
      console.error('[speech] start failed:', e);
    }
  }, [listening]);

  const stop = useCallback(() => {
    const rec = recRef.current;
    if (!rec) return;
    try { rec.stop(); } catch { /* already stopped */ }
  }, []);

  return { supported, listening, interim, error, start, stop, lang: resolvedLang };
}
