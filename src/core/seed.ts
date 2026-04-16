/**
 * Deterministic seed derivation: a given (text, emotionLabel) pair
 * always produces the same specimen. Typing-rhythm data nudges the seed
 * so that writing the same sentence at different cadences produces
 * subtly different specimens.
 */

export interface TypingRhythm {
  /** median keystroke interval in ms */
  per: number;
  /** typing velocity in chars/second */
  vel: number;
  /** longest pause in ms */
  att: number;
}

// xmur3 string hash
function xmur3(str: string): () => number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return function () {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return h >>> 0;
  };
}

/** 32-bit LCG seeded deterministically from inputs */
export class Rng {
  private state: number;
  constructor(seed: number) {
    this.state = seed >>> 0 || 1;
  }
  next(): number {
    // Numerical Recipes LCG
    this.state = (Math.imul(this.state, 1664525) + 1013904223) >>> 0;
    return this.state / 4294967296;
  }
  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }
  int(min: number, max: number): number {
    return Math.floor(this.range(min, max));
  }
}

export function deriveSeed(
  text: string,
  emotionLabel: string,
  rhythm?: TypingRhythm
): number {
  const r = rhythm
    ? `|${rhythm.per.toFixed(0)}|${rhythm.vel.toFixed(2)}|${rhythm.att.toFixed(0)}`
    : '';
  const h = xmur3(`${text}::${emotionLabel}${r}`);
  return h();
}
