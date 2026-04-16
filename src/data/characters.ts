/**
 * Character catalog. Each entry maps a charId (0..5) to:
 *   - its PNG asset path
 *   - display name
 *   - primary color (for tendril mixing, particle color, aura)
 *   - emotion labels that prefer this character
 *   - face coordinates (for blink eyelid overlay; all 0..1 of sprite box)
 *
 * Face coords verified by pixel-scanning baked eye dots in each sprite.
 */

export type CharId = 0 | 1 | 2 | 3 | 4 | 5;

export interface FaceConfig {
  eyeY: number;
  eyeLeftX: number;
  eyeRightX: number;
  eyeSize: number;
  skinColor: string;
}

export interface Character {
  id: CharId;
  slug: string;
  name: string;
  color: string;
  emotions: string[];
  face: FaceConfig;
}

export const CHARACTERS: Record<CharId, Character> = {
  0: {
    id: 0,
    slug: 'char0_radial',
    name: '放射星',
    color: '#E8A28A',
    emotions: ['tender', 'nostalgic', 'soft'],
    face: { eyeY: 0.467, eyeLeftX: 0.512, eyeRightX: 0.649, eyeSize: 0.032, skinColor: '#F5EFE5' },
  },
  1: {
    id: 1,
    slug: 'char1_bubble',
    name: '水泡',
    color: '#A7C8D6',
    emotions: ['calm', 'clear', 'empty'],
    face: { eyeY: 0.439, eyeLeftX: 0.459, eyeRightX: 0.643, eyeSize: 0.030, skinColor: '#F2F4F3' },
  },
  2: {
    id: 2,
    slug: 'char2_mushroom',
    name: '蘑菇',
    color: '#E89A5C',
    emotions: ['curious', 'playful', 'clumsy'],
    face: { eyeY: 0.394, eyeLeftX: 0.293, eyeRightX: 0.428, eyeSize: 0.028, skinColor: '#F3B478' },
  },
  3: {
    id: 3,
    slug: 'char3_glitter',
    name: '亮片',
    color: '#9AAEE0',
    emotions: ['dreamy', 'excited', 'romantic'],
    face: { eyeY: 0.430, eyeLeftX: 0.455, eyeRightX: 0.550, eyeSize: 0.026, skinColor: '#A8B8D4' },
  },
  4: {
    id: 4,
    slug: 'char4_cups',
    name: '双子杯',
    color: '#7CC8B8',
    emotions: ['companion', 'social', 'attached'],
    face: { eyeY: 0.450, eyeLeftX: 0.349, eyeRightX: 0.752, eyeSize: 0.030, skinColor: '#9BD4C4' },
  },
  5: {
    id: 5,
    slug: 'char5_shrub',
    name: '枯枝',
    color: '#6E6C6A',
    emotions: ['lonely', 'restrained', 'quiet'],
    face: { eyeY: 0.520, eyeLeftX: 0.455, eyeRightX: 0.545, eyeSize: 0.022, skinColor: '#D4D1C9' },
  },
};

export const HYBRID_ASSET = '/assets/characters/hybrid_rainbow.png';

export function charAsset(id: CharId): string {
  return `/assets/characters/${CHARACTERS[id].slug}.png`;
}

/** Lookup charId from an emotion label; defaults to 0 if unknown. */
export function emotionToCharId(label: string): CharId {
  const needle = label.toLowerCase().trim();
  for (const c of Object.values(CHARACTERS)) {
    if (c.emotions.includes(needle)) return c.id;
  }
  return 0;
}

/**
 * Compatibility between two characters. Used by the physics layer as a
 * multiplier on long-range attraction: higher = more eager to approach,
 * negative = repel. Populated with a real 6×6 matrix in Phase C;
 * Phase A uses 1.0 (everyone gently attracts).
 */
export function compatibility(_a: CharId, _b: CharId): number {
  return 1.0;
}
