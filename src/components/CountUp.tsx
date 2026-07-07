/**
 * CountUp — animates a number toward `value` with a soft ease, counting
 * from the previously shown value (so a live +1 ticks up, not a jarring
 * restart from zero). Rendered as a locale-formatted string.
 */
import { animate } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { EASE } from '../ui/motion';

export function CountUp({ value, duration = 1.4 }: { value: number; duration?: number }) {
  const [n, setN] = useState(0);
  const prev = useRef(0);
  useEffect(() => {
    const controls = animate(prev.current, value, {
      duration,
      ease: EASE,
      onUpdate: (v) => setN(Math.round(v)),
      onComplete: () => { prev.current = value; },
    });
    prev.current = value;
    return () => controls.stop();
  }, [value, duration]);
  return <>{n.toLocaleString()}</>;
}
