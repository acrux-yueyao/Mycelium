/**
 * LandingPoster — the "The Whisper Network" entry page.
 *
 * A biennial-style poster laid over the live ecology (DitherField renders
 * behind it in App). Editorial mono type pinned to the corners, the
 * living population count, and ENTER THE WORLD to cross into the field.
 * Fades out on enter.
 */
import { motion } from 'framer-motion';
import { landingContainer, riseItem, heroItem, EASE } from '../ui/motion';
import { CountUp } from './CountUp';
import { useMagnetic } from '../ui/useMagnetic';
import { halloweenActive } from '../core/halloween';

// Halloween: a 9×8 pixel pumpkin that sits after the title
const PUMPKIN = [
  '....gg...',
  '....g....',
  '.ooOoOoo.',
  'ooOooOooo',
  'o.Oo.Oo.o',
  'oooOoOooo',
  'oo.o.o.oo',
  '.ooOoOoo.',
];
const PCOL: Record<string, string> = { g: '#4f7d2a', o: '#ef8526', O: '#d8661a', '.': 'none' };
function PixelPumpkin() {
  return (
    <svg className="landing-pumpkin" viewBox="0 0 9 8" role="img" aria-label="Halloween pumpkin" shapeRendering="crispEdges">
      {PUMPKIN.flatMap((row, y) => [...row].map((ch, x) => (
        PCOL[ch] === 'none' ? null : <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill={PCOL[ch]} />
      )))}
    </svg>
  );
}

interface Props {
  population: number;
  onEnter: () => void;
}

const fadeItem = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.6, ease: EASE } },
};

export function LandingPoster({ population, onEnter }: Props) {
  const magnet = useMagnetic();
  return (
    <motion.div
      className="landing"
      variants={landingContainer}
      initial="hidden"
      animate="visible"
      exit="exit"
    >
      <motion.div className="landing-brand" variants={riseItem}>
        MYCELIUM FIELD<br />2024—∞
        <div className="landing-sw">
          <i style={{ background: '#c79be6' }} />
          <i style={{ background: '#46a65a' }} />
          <i style={{ background: '#dfd49a' }} />
        </div>
      </motion.div>

      <motion.nav className="landing-nav" variants={riseItem}>
        <span>ABOUT</span><span>ARCHIVE</span><span>CREATURES</span>
      </motion.nav>

      <motion.div className="landing-hero" variants={heroItem}>
        <h1>The Whisper<br />Network{halloweenActive() && <PixelPumpkin />}</h1>
        <div className="landing-sub">an underground web of feeling</div>
        <div className="landing-desc">A DIGITAL ECOSYSTEM OF<br />COLLECTIVE IMAGINATION</div>
      </motion.div>

      <motion.div className="landing-meta" variants={riseItem}>
        MYCELIUM FIELD
        <div className="landing-date">whisper a sentence<br />→ grow a specimen</div>
        {halloweenActive() && (
          <div className="landing-date landing-hw">this week, whisper a pumpkin,<br />a ghost or a witch…</div>
        )}
      </motion.div>

      <motion.button
        ref={magnet.ref}
        className="landing-enter"
        variants={fadeItem}
        style={magnet.style}
        onClick={onEnter}
      >
        <span>ENTER THE WORLD</span>
        <span className="landing-arrow" />
      </motion.button>

      <motion.div className="landing-pop" variants={riseItem}>
        CURRENT POPULATION:<br />
        <span className="n" style={{ fontVariantNumeric: 'tabular-nums' }}>
          <CountUp value={population} /> CREATURES
        </span>
      </motion.div>
    </motion.div>
  );
}
