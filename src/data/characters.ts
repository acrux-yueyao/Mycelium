/**
 * Character catalog. Each entry maps a charId (0..5) to:
 *   - its PNG asset path
 *   - display name
 *   - primary color (for tendril mixing, particle color, aura)
 *   - emotion labels that prefer this character
 *   - face coordinates (eyes + mouth; all 0..1 of sprite box)
 *
 * Sprites are eye-less "clean" bases — FaceOverlay owns all facial
 * features programmatically. Eye spacing is Jellycat-wide (eyes sit
 * toward the outer edges of each head) and each character has a
 * small stitched mouth below the eye line.
 */

export type CharId = 0 | 1 | 2 | 3 | 4 | 5;

export interface FaceConfig {
  eyeY: number;
  eyeLeftX: number;
  eyeRightX: number;
  eyeSize: number;
  /** Vertical position of the small mouth (0..1 of sprite box). */
  mouthY: number;
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
    face: { eyeY: 0.46, eyeLeftX: 0.44, eyeRightX: 0.72, eyeSize: 0.042, mouthY: 0.57, skinColor: '#F5EFE5' },
  },
  1: {
    id: 1,
    slug: 'char1_bubble',
    name: '水泡',
    color: '#A7C8D6',
    emotions: ['calm', 'clear', 'empty'],
    face: { eyeY: 0.44, eyeLeftX: 0.42, eyeRightX: 0.68, eyeSize: 0.040, mouthY: 0.56, skinColor: '#F2F4F3' },
  },
  2: {
    id: 2,
    slug: 'char2_mushroom',
    name: '蘑菇',
    color: '#E89A5C',
    emotions: ['curious', 'playful', 'clumsy'],
    face: { eyeY: 0.39, eyeLeftX: 0.24, eyeRightX: 0.48, eyeSize: 0.038, mouthY: 0.50, skinColor: '#F3B478' },
  },
  3: {
    id: 3,
    slug: 'char3_glitter',
    name: '亮片',
    color: '#9AAEE0',
    emotions: ['dreamy', 'excited', 'romantic'],
    face: { eyeY: 0.43, eyeLeftX: 0.38, eyeRightX: 0.62, eyeSize: 0.034, mouthY: 0.54, skinColor: '#A8B8D4' },
  },
  4: {
    id: 4,
    slug: 'char4_cups',
    name: '双子杯',
    color: '#7CC8B8',
    emotions: ['companion', 'social', 'attached'],
    face: { eyeY: 0.45, eyeLeftX: 0.35, eyeRightX: 0.75, eyeSize: 0.038, mouthY: 0.56, skinColor: '#9BD4C4' },
  },
  5: {
    id: 5,
    slug: 'char5_shrub',
    name: '枯枝',
    color: '#6E6C6A',
    emotions: ['lonely', 'restrained', 'quiet'],
    face: { eyeY: 0.52, eyeLeftX: 0.40, eyeRightX: 0.60, eyeSize: 0.030, mouthY: 0.61, skinColor: '#D4D1C9' },
  },
};

export function charAsset(id: CharId): string {
  return `/assets/characters/${CHARACTERS[id].slug}.png`;
}

const HYBRID_LETTER: Record<CharId, string> = { 0: 'A', 1: 'B', 2: 'C', 3: 'D', 4: 'E', 5: 'F' };

export function hybridAsset(a: CharId, b: CharId): string {
  const [lo, hi] = a <= b ? [a, b] : [b, a];
  return `/assets/characters/hybrid_${HYBRID_LETTER[lo]}_${HYBRID_LETTER[hi]}.png`;
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
 * multiplier on long-range attraction: positive → eager to approach,
 * negative → repel. Used by the tendril layer to color connection lines.
 *
 * Rows = self, columns = other. Diagonal is 1.0 (same kind always bonds).
 * Lonely (5) is mostly negative — it pushes others away, except for
 * calm (1) which can sit comfortably with it.
 */
const COMPAT_MATRIX: number[][] = [
  // 0 tender 1 calm  2 curious 3 dreamy 4 companion 5 lonely
  [   1.0,    0.8,    0.5,      0.6,     0.9,        -0.2 ], // 0 tender
  [   0.8,    1.0,    0.3,      0.4,     0.7,         0.5 ], // 1 calm
  [   0.5,    0.3,    1.0,      0.8,     0.6,        -0.1 ], // 2 curious
  [   0.6,    0.4,    0.8,      1.0,     0.5,        -0.3 ], // 3 dreamy
  [   0.9,    0.7,    0.6,      0.5,     1.0,        -0.4 ], // 4 companion
  [  -0.2,    0.5,   -0.1,     -0.3,    -0.4,         1.0 ], // 5 lonely
];

export function compatibility(a: CharId, b: CharId): number {
  return COMPAT_MATRIX[a][b];
}
