/**
 * LandingPoster — the "The Whisper Network" entry page.
 *
 * A biennial-style poster laid over the live ecology (DitherField renders
 * behind it in App). Editorial mono type pinned to the corners, the
 * living population count, and ENTER THE WORLD to cross into the field.
 * Fades out on enter.
 */
import { motion } from 'framer-motion';
import { landingContainer, riseItem, heroItem } from '../ui/motion';

interface Props {
  population: number;
  onEnter: () => void;
}

export function LandingPoster({ population, onEnter }: Props) {
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
        <h1>The Whisper<br />Network</h1>
        <div className="landing-sub">an underground web of feeling</div>
        <div className="landing-desc">A DIGITAL ECOSYSTEM OF<br />COLLECTIVE IMAGINATION</div>
      </motion.div>

      <motion.div className="landing-meta" variants={riseItem}>
        H&amp;R BLOCK<br />ARTSPACE<br />MYCELIUM FIELD
        <div className="landing-date">whisper a sentence<br />→ grow a specimen</div>
      </motion.div>

      <motion.button className="landing-enter" variants={riseItem} onClick={onEnter}>
        <span>ENTER THE WORLD</span>
        <span className="landing-arrow" />
      </motion.button>

      <motion.div className="landing-pop" variants={riseItem}>
        CURRENT POPULATION:<br />
        <span className="n" style={{ fontVariantNumeric: 'tabular-nums' }}>
          {population.toLocaleString()} CREATURES
        </span>
      </motion.div>
    </motion.div>
  );
}
