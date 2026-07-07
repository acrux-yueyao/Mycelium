/**
 * LandingPoster — the "The Whisper Network" entry page.
 *
 * A biennial-style poster laid over the live ecology (DitherField renders
 * behind it in App). Editorial mono type pinned to the corners, the
 * living population count, and ENTER THE WORLD to cross into the field.
 * Fades out on enter.
 */
import { motion } from 'framer-motion';

interface Props {
  population: number;
  onEnter: () => void;
}

export function LandingPoster({ population, onEnter }: Props) {
  return (
    <motion.div
      className="landing"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.9, ease: 'easeInOut' }}
    >
      <div className="landing-brand">
        MYCELIUM FIELD<br />2024—∞
        <div className="landing-sw">
          <i style={{ background: '#c79be6' }} />
          <i style={{ background: '#46a65a' }} />
          <i style={{ background: '#dfd49a' }} />
        </div>
      </div>

      <nav className="landing-nav">
        <span>ABOUT</span><span>ARCHIVE</span><span>CREATURES</span>
      </nav>

      <div className="landing-hero">
        <h1>The Whisper<br />Network</h1>
        <div className="landing-sub">an underground web of feeling</div>
        <div className="landing-desc">A DIGITAL ECOSYSTEM OF<br />COLLECTIVE IMAGINATION</div>
      </div>

      <div className="landing-meta">
        H&amp;R BLOCK<br />ARTSPACE<br />MYCELIUM FIELD
        <div className="landing-date">whisper a sentence<br />→ grow a specimen</div>
      </div>

      <button className="landing-enter" onClick={onEnter}>
        <span>ENTER THE WORLD</span>
        <span className="landing-arrow" />
      </button>

      <div className="landing-pop">
        CURRENT POPULATION:<br />
        <span className="n" style={{ fontVariantNumeric: 'tabular-nums' }}>
          {population.toLocaleString()} CREATURES
        </span>
      </div>
    </motion.div>
  );
}
