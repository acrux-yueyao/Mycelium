/**
 * TendrilLayer — SVG overlay drawing curved tendrils between connected
 * entity pairs. Each path:
 *   - is a quadratic bezier from a → b with the control point lifted 40px
 *   - colored / weighted by tendrilStyle(connection)
 *   - fades in on connection birth, fades out on disconnect
 *     (via AnimatePresence + motion.path)
 */
import { motion, AnimatePresence } from 'framer-motion';
import { tendrilStyle, type Connection } from '../core/connections';

export interface TendrilLayerProps {
  connections: Connection[];
}

export type EntityRef = Connection['a'];
export type { Connection };

export function TendrilLayer({ connections }: TendrilLayerProps) {
  return (
    <svg
      className="overlay-layer"
      width="100%"
      height="100%"
      aria-hidden
    >
      <AnimatePresence>
        {connections.map((c) => {
          const mx = (c.a.x + c.b.x) / 2;
          const my = (c.a.y + c.b.y) / 2 - 40;
          const d = `M ${c.a.x} ${c.a.y} Q ${mx} ${my} ${c.b.x} ${c.b.y}`;
          const style = tendrilStyle(c);
          return (
            <motion.path
              key={c.id}
              d={d}
              stroke={style.color}
              strokeWidth={style.width}
              strokeOpacity={0}
              strokeDasharray={style.dash}
              strokeLinecap="round"
              fill="none"
              initial={{ strokeOpacity: 0 }}
              animate={{ strokeOpacity: style.opacity }}
              exit={{ strokeOpacity: 0 }}
              transition={{ duration: 0.6, ease: 'easeInOut' }}
            />
          );
        })}
      </AnimatePresence>
    </svg>
  );
}
