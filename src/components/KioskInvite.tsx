/**
 * KioskInvite — the field kiosk's only visible doorway.
 *
 * The tower's main screen hides every on-screen input on purpose; visitors
 * whisper from their own phones. This quiet corner card carries the QR code
 * that says so. It breathes slowly so the eye finds it without being shouted at.
 */
import { motion } from 'framer-motion';
import qrUrl from '../assets/qr-whisper.svg';

export function KioskInvite() {
  return (
    <motion.div
      className="kiosk-invite"
      initial={{ opacity: 0 }}
      animate={{ opacity: [0.55, 0.92, 0.55] }}
      transition={{ duration: 9, repeat: Infinity, ease: 'easeInOut' }}
    >
      <img className="kiosk-invite-qr" src={qrUrl} alt="QR: leave a whisper" />
      <div className="kiosk-invite-text">
        <div className="kiosk-invite-cn">扫码 · 轻声说一句</div>
        <div className="kiosk-invite-en">SCAN · LEAVE A WHISPER</div>
        <div className="kiosk-invite-sub">it will grow here</div>
      </div>
    </motion.div>
  );
}
