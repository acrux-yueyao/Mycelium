/**
 * HandLayer — UI for the hand-tracking interaction.
 *
 *   - Toggle pill (bottom-right, next to the mute button) that
 *     enables / disables MediaPipe + camera.
 *   - A small mirrored <video> preview so the user can see what the
 *     tracker sees (helps line up gestures).
 *   - A full-screen overlay that draws small markers for each
 *     visible hand: fingertip dot (index), palm ring, and a pair of
 *     circles at thumb + index to make pinches visible.
 *
 * The actual gesture → physics coupling lives in App.tsx; this
 * component owns only the media stream, the status pill, and the
 * visual feedback.
 */
import { useEffect, useRef, useState, type MutableRefObject } from 'react';
import type { HandSnapshot } from '../core/handTracking';
import type { HandTrackingState } from '../hooks/useHandTracking';

interface HandLayerProps {
  videoRef: MutableRefObject<HTMLVideoElement | null>;
  state: HandTrackingState;
  snapshotRef: MutableRefObject<HandSnapshot[]>;
  onEnable: () => void;
  onDisable: () => void;
}

export function HandLayer({
  videoRef,
  state,
  snapshotRef,
  onEnable,
  onDisable,
}: HandLayerProps) {
  // Local hand snapshot, mirrored from snapshotRef for render purposes.
  // We tick it at ~25fps via rAF to keep the overlay smooth without
  // causing a render storm when nothing's changed.
  const [hands, setHands] = useState<HandSnapshot[]>([]);
  const overlayRafRef = useRef<number | null>(null);

  useEffect(() => {
    if (!state.enabled) {
      setHands([]);
      return;
    }
    let last: HandSnapshot[] | null = null;
    const tick = () => {
      const cur = snapshotRef.current;
      if (cur !== last) {
        last = cur;
        setHands(cur);
      }
      overlayRafRef.current = requestAnimationFrame(tick);
    };
    overlayRafRef.current = requestAnimationFrame(tick);
    return () => {
      if (overlayRafRef.current != null) cancelAnimationFrame(overlayRafRef.current);
    };
  }, [state.enabled, snapshotRef]);

  const statusLabel = state.loading
    ? 'warming up…'
    : state.enabled
      ? state.handsSeen > 0
        ? `${state.handsSeen} hand${state.handsSeen > 1 ? 's' : ''}`
        : 'show your hands'
      : 'hand tracking';

  return (
    <>
      {/* Preview video — always mounted so the ref is valid when the
       *  tracker tries to start. Hidden via opacity + pointer-events
       *  when disabled. */}
      <video
        ref={videoRef}
        muted
        playsInline
        aria-hidden
        style={{
          position: 'fixed',
          right: 20,
          bottom: 70,
          width: 180,
          height: 135,
          borderRadius: 14,
          border: '1.5px dashed rgba(74, 64, 52, 0.22)',
          background: 'rgba(255, 250, 235, 0.5)',
          // Mirror so "hand goes right" on screen reads intuitively.
          transform: 'scaleX(-1)',
          objectFit: 'cover',
          zIndex: 29,
          opacity: state.enabled ? 0.78 : 0,
          pointerEvents: 'none',
          transition: 'opacity 0.5s ease',
        }}
      />

      {/* Fingertip + palm markers drawn on top of the stage. */}
      {state.enabled && hands.length > 0 && (
        <svg
          aria-hidden
          style={{
            position: 'fixed',
            inset: 0,
            width: '100vw',
            height: '100vh',
            pointerEvents: 'none',
            zIndex: 28,
          }}
        >
          {hands.map((h, i) => {
            const color =
              h.isPinching ? '#D27B4E' : h.isOpen ? '#7FA68A' : '#6B5B47';
            return (
              <g key={i}>
                {/* Palm ring — scales with the detected palm, pulses
                 *  when open-palm gesture is active. */}
                <circle
                  cx={h.palmCenter.x}
                  cy={h.palmCenter.y}
                  r={h.palmRadius * (h.isOpen ? 1.8 : 1.1)}
                  fill="none"
                  stroke={color}
                  strokeWidth={h.isOpen ? 2 : 1}
                  strokeDasharray={h.isOpen ? '6 4' : '3 6'}
                  opacity={h.isOpen ? 0.6 : 0.28}
                />
                {/* Index tip dot */}
                <circle
                  cx={h.indexTip.x}
                  cy={h.indexTip.y}
                  r={h.isPointing ? 9 : 6}
                  fill={color}
                  opacity={h.isPointing ? 0.8 : 0.55}
                />
                {/* Thumb tip dot — only drawn when relevant (pinch) */}
                <circle
                  cx={h.thumbTip.x}
                  cy={h.thumbTip.y}
                  r={h.isPinching ? 7 : 4}
                  fill={h.isPinching ? '#D27B4E' : '#A89B85'}
                  opacity={h.isPinching ? 0.85 : 0.35}
                />
                {/* Pinch connector — a line between thumb and index
                 *  tip that shortens as the pinch closes. */}
                {h.isPinching && (
                  <line
                    x1={h.thumbTip.x}
                    y1={h.thumbTip.y}
                    x2={h.indexTip.x}
                    y2={h.indexTip.y}
                    stroke="#D27B4E"
                    strokeWidth={2}
                    opacity={0.6}
                    strokeLinecap="round"
                  />
                )}
              </g>
            );
          })}
        </svg>
      )}

      {/* Toggle button */}
      <button
        type="button"
        className="hand-toggle"
        aria-pressed={state.enabled}
        onClick={state.enabled ? onDisable : onEnable}
        disabled={state.loading}
        title={state.error ?? undefined}
      >
        <span
          className="hand-dot"
          style={{
            background: state.enabled
              ? state.handsSeen > 0
                ? '#7FA68A'
                : '#E69B6E'
              : '#C5B8A0',
          }}
        />
        <span>{statusLabel}</span>
      </button>
    </>
  );
}
