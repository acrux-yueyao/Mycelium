/**
 * sporeId — the creature's cross-medium identity number.
 *
 * `MYC-<family letter><5 × Crockford Base32>`, derived from the same
 * xmur3 hash of the whispered sentence that the engine grows the body
 * from. The web spore, the kit drawing and the printed companion all
 * compute it independently and land on the same number — no registry.
 * (Physical-side twin: scripts/spore3d.mts, hardware/NUMBERING.md.)
 */
import { xmur3 } from './seed';
import type { CharId } from '../data/characters';

/** Crockford Base32 — no 0/O/1/I lookalikes, safe to read aloud. */
const B32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
/** tender calm cuRious dreamy comPanion lonely — matches CharId order. */
const FAM_CODE = 'TCRDPL';

export function sporeId(c: { myc?: string; text?: string; id: string; charId: CharId }): string {
  // a number fixed at birth wins — the sentence it was hashed from is not
  // stored, so this is how a stored spore keeps the number from its card.
  if (c.myc) return c.myc;
  // otherwise hash the sentence when we have it (identical to the print
  // pipeline); demo/legacy creatures without one fall back to their field id.
  const h0 = xmur3(c.text || c.id)();
  let tail = '';
  for (let k = 4; k >= 0; k--) tail += B32[(h0 >>> (k * 5)) & 31];
  return `MYC-${FAM_CODE[c.charId] ?? 'X'}${tail}`;
}
