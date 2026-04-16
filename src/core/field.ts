/**
 * Physics field — per-frame force integration for the live entity list.
 *
 * Phase A scope:
 *  - Gentle long-range attraction between pairs (180 < d < 500) scaled by
 *    compatibility()
 *  - Short-range repulsion (d < 160) so entities don't overlap
 *  - Soft walls at 100px margin from viewport edges
 *  - Soft center-repel so entities don't crowd on top of the input totem
 *  - Velocity damping so motion feels like drifting through cream, not
 *    a bouncy ball
 *
 * Later phases will add: eye-tracking, compat matrix, color tint, aging.
 */
import { compatibility, type CharId } from '../data/characters';

export interface PhysBody {
  id: string;
  charId: CharId;
  x: number;
  y: number;
  vx: number;
  vy: number;
}

// Force tunables (per frame, assuming ~60fps). Dialed for a slow,
// cream-floating feel — no bouncy ball energy.
const ATTRACT_K = 0.10;        // long-range gentle pull
const ATTRACT_MIN = 180;
const ATTRACT_MAX = 500;
const REPEL_R = 160;
const REPEL_K = 0.18;
const WALL_MARGIN = 100;
const WALL_K = 0.06;
const CENTER_R = 190;           // input totem protective radius
const CENTER_K = 0.35;
const DAMPING = 0.92;           // keep 92% of velocity per frame

export function stepField<T extends PhysBody>(
  bodies: T[],
  viewportW: number,
  viewportH: number,
): T[] {
  if (bodies.length === 0 || viewportW === 0 || viewportH === 0) {
    return bodies;
  }
  const cx = viewportW / 2;
  const cy = viewportH / 2;

  return bodies.map((a) => {
    let fx = 0;
    let fy = 0;

    for (const b of bodies) {
      if (a.id === b.id) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = Math.hypot(dx, dy) || 1;
      const nx = dx / d;
      const ny = dy / d;

      // Long-range attraction
      if (d > ATTRACT_MIN && d < ATTRACT_MAX) {
        const f = ATTRACT_K * compatibility(a.charId, b.charId);
        fx += nx * f;
        fy += ny * f;
      }
      // Short-range repulsion — quadratic ramp so it kicks in hard near 0
      if (d < REPEL_R) {
        const t = (REPEL_R - d) / REPEL_R; // 0..1, stronger when closer
        const f = REPEL_K * t * t * REPEL_R;
        fx -= nx * f;
        fy -= ny * f;
      }
    }

    // Soft walls
    if (a.x < WALL_MARGIN) {
      fx += (WALL_MARGIN - a.x) * WALL_K;
    } else if (a.x > viewportW - WALL_MARGIN) {
      fx -= (a.x - (viewportW - WALL_MARGIN)) * WALL_K;
    }
    if (a.y < WALL_MARGIN) {
      fy += (WALL_MARGIN - a.y) * WALL_K;
    } else if (a.y > viewportH - WALL_MARGIN) {
      fy -= (a.y - (viewportH - WALL_MARGIN)) * WALL_K;
    }

    // Keep the center clear for the input totem
    const dcx = a.x - cx;
    const dcy = a.y - cy;
    const dc = Math.hypot(dcx, dcy) || 1;
    if (dc < CENTER_R) {
      const push = ((CENTER_R - dc) / CENTER_R) * CENTER_K;
      fx += (dcx / dc) * push * CENTER_R * 0.1;
      fy += (dcy / dc) * push * CENTER_R * 0.1;
    }

    const vx = (a.vx + fx) * DAMPING;
    const vy = (a.vy + fy) * DAMPING;
    const x = a.x + vx;
    const y = a.y + vy;

    // Hard clamp so nothing ever escapes the viewport.
    return {
      ...a,
      vx,
      vy,
      x: Math.max(20, Math.min(viewportW - 20, x)),
      y: Math.max(20, Math.min(viewportH - 20, y)),
    };
  });
}
