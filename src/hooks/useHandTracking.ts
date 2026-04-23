/**
 * useHandTracking — lifecycle + state for the HandTracker.
 *
 * Exposes a `snapshotRef` that is updated in place on every detection
 * tick (so the physics loop can read it without triggering renders),
 * and a React state mirror for UI pieces that only care about coarse
 * status (on/off, first gesture seen, loading, error).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { HandTracker, type HandSnapshot } from '../core/handTracking';

export interface HandTrackingState {
  enabled: boolean;
  loading: boolean;
  error: string | null;
  handsSeen: number;
}

export function useHandTracking(videoRef: React.RefObject<HTMLVideoElement | null>) {
  const [state, setState] = useState<HandTrackingState>({
    enabled: false,
    loading: false,
    error: null,
    handsSeen: 0,
  });
  const trackerRef = useRef<HandTracker | null>(null);
  const snapshotRef = useRef<HandSnapshot[]>([]);

  useEffect(() => {
    const t = new HandTracker();
    trackerRef.current = t;
    const unsub = t.subscribe((hands) => {
      snapshotRef.current = hands;
      setState((s) => (s.handsSeen === hands.length ? s : { ...s, handsSeen: hands.length }));
    });
    return () => {
      unsub();
      t.stop();
    };
  }, []);

  const enable = useCallback(async () => {
    const t = trackerRef.current;
    const video = videoRef.current;
    if (!t || !video) return;
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      await t.start(video);
      setState((s) => ({ ...s, enabled: true, loading: false }));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('[hand-tracking] enable failed:', msg);
      setState((s) => ({
        ...s,
        enabled: false,
        loading: false,
        error: msg,
      }));
    }
  }, [videoRef]);

  const disable = useCallback(() => {
    trackerRef.current?.stop();
    snapshotRef.current = [];
    setState((s) => ({ ...s, enabled: false, handsSeen: 0 }));
  }, []);

  return { state, snapshotRef, enable, disable };
}
