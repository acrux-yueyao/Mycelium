/**
 * useMagnetic — a button that leans toward the cursor when it's near,
 * springing back when the pointer leaves. Returns a ref to attach and a
 * motion style ({x, y}) to spread onto a motion element.
 */
import { useEffect, useRef } from 'react';
import { useMotionValue, useSpring } from 'framer-motion';

export function useMagnetic(strength = 0.4, radius = 150) {
  const ref = useRef<HTMLButtonElement | null>(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const sx = useSpring(x, { stiffness: 220, damping: 18, mass: 0.4 });
  const sy = useSpring(y, { stiffness: 220, damping: 18, mass: 0.4 });

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const el = ref.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const dx = e.clientX - (r.left + r.width / 2);
      const dy = e.clientY - (r.top + r.height / 2);
      if (Math.hypot(dx, dy) < radius) { x.set(dx * strength); y.set(dy * strength); }
      else { x.set(0); y.set(0); }
    };
    window.addEventListener('pointermove', onMove);
    return () => window.removeEventListener('pointermove', onMove);
  }, [strength, radius, x, y]);

  return { ref, style: { x: sx, y: sy } };
}
