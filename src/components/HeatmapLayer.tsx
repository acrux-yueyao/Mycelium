/**
 * HeatmapLayer — glowing blobs at every active connection midpoint.
 *
 * Per the design vision: "more connections → that region brightens
 * / warms". We express that by dropping one translucent radial blob
 * per active connection, at the midpoint of its endpoints. Where
 * multiple blobs overlap, their alphas stack (via `lighter` blend),
 * so a tight cluster of six tendrils actually lights up its patch
 * of paper noticeably warmer than an isolated pair does.
 *
 * Re-renders are throttled to ~6 fps: the connection set changes
 * slowly, and painting blobs every RAF would be wasted work.
 */
import { useEffect, useState } from 'react';
import type { Connection } from '../core/connections';

interface Props {
  connections: Connection[];
}

const BLOB_RADIUS = 150;   // px, feathered radial
const THROTTLE_MS = 160;   // ~6 fps, plenty smooth for a slow bloom

export function HeatmapLayer({ connections }: Props) {
  // Mirror the incoming connections into local state on a throttle,
  // so React only re-renders the SVG at ~6 fps.
  const [snapshot, setSnapshot] = useState<Array<{ id: string; x: number; y: number; warmth: number }>>([]);

  useEffect(() => {
    let lastT = 0;
    let rafId: number | null = null;
    const tick = () => {
      const now = performance.now();
      if (now - lastT >= THROTTLE_MS) {
        lastT = now;
        const next = connections
          .filter((c) => c.state !== 'retracting')
          .map((c) => ({
            id: c.id,
            x: (c.a.x + c.b.x) / 2,
            y: (c.a.y + c.b.y) / 2,
            // Support and high-compat connections glow a bit stronger.
            warmth: c.isSupport ? 1.0 : Math.max(0.35, Math.min(1, c.compat + 0.35)),
          }));
        setSnapshot(next);
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => {
      if (rafId != null) cancelAnimationFrame(rafId);
    };
  }, [connections]);

  return (
    <svg
      aria-hidden
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        // Sits between the warm wash and the polka dots, multiply-
        // blended so it tints the paper rather than washing over it.
        mixBlendMode: 'multiply',
        zIndex: 0,
      }}
    >
      <defs>
        <radialGradient id="heatBlob" cx="50%" cy="50%" r="50%">
          <stop offset="0%"  stopColor="#E8B98E" stopOpacity="0.30" />
          <stop offset="55%" stopColor="#E8B98E" stopOpacity="0.11" />
          <stop offset="100%" stopColor="#E8B98E" stopOpacity="0" />
        </radialGradient>
      </defs>
      {snapshot.map((b) => (
        <circle
          key={b.id}
          cx={b.x}
          cy={b.y}
          r={BLOB_RADIUS}
          fill="url(#heatBlob)"
          opacity={b.warmth}
        />
      ))}
    </svg>
  );
}
