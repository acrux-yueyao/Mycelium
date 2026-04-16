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
