/**
 * Character catalog. Each entry maps a charId (0..5) to:
 *   - its PNG asset path
 *   - display name
 *   - primary color (for tendril mixing, particle color, aura)
 *   - emotion labels that prefer this character
 *   - face coordinates (eyes + small smile mouth; all 0..1 of sprite box)
 *   - an optional secondaryFace (char4 is twin cups — two full faces)
 *
 * Sprites are eye-less "clean" bases — FaceOverlay owns all facial
 * features programmatically. Eye spacing is Jellycat-wide; each
 * character has a small curved smile mouth just below the eye line.
 */

export type CharId = 0 | 1 | 2 | 3 | 4 | 5;

export interface FaceConfig {
  eyeY: number;
  eyeLeftX: number;
  eyeRightX: number;
  eyeSize: number;
  /** Vertical position of the small smile mouth (0..1 of sprite box). */
  mouthY: number;
}

export interface Character {
  id: CharId;
  slug: string;
  name: string;
  color: string;
  emotions: string[];
  face: FaceConfig;
  /** Rendered in addition to `face` — used by the twin-cup character. */
  secondaryFace?: FaceConfig;
}

export const CHARACTERS: Record<CharId, Character> = {
  0: {
    id: 0,
    slug: 'char0_radial',
    name: '放射星',
    color: '#E8A28A',
    emotions: ['tender', 'nostalgic', 'soft'],
    face: { eyeY: 0.54, eyeLeftX: 0.43, eyeRightX: 0.70, eyeSize: 0.038, mouthY: 0.61 },
  },
  1: {
    id: 1,
    slug: 'char1_bubble',
    name: '水泡',
    color: '#A7C8D6',
    emotions: ['calm', 'clear', 'empty'],
    face: { eyeY: 0.40, eyeLeftX: 0.36, eyeRightX: 0.64, eyeSize: 0.036, mouthY: 0.47 },
  },
  2: {
    id: 2,
    slug: 'char2_mushroom',
    name: '蘑菇',
    color: '#E89A5C',
    emotions: ['curious', 'playful', 'clumsy'],
    face: { eyeY: 0.34, eyeLeftX: 0.32, eyeRightX: 0.56, eyeSize: 0.034, mouthY: 0.41 },
  },
  3: {
    id: 3,
    slug: 'char3_glitter',
    name: '亮片',
    color: '#9AAEE0',
    emotions: ['dreamy', 'excited', 'romantic'],
    face: { eyeY: 0.40, eyeLeftX: 0.33, eyeRightX: 0.60, eyeSize: 0.035, mouthY: 0.47 },
  },
  4: {
    id: 4,
    slug: 'char4_cups',
    name: '双子杯',
    color: '#7CC8B8',
    emotions: ['companion', 'social', 'attached'],
    // Two cups side by side — each gets its own face.
    face: { eyeY: 0.33, eyeLeftX: 0.21, eyeRightX: 0.34, eyeSize: 0.024, mouthY: 0.40 },
    secondaryFace: { eyeY: 0.33, eyeLeftX: 0.52, eyeRightX: 0.65, eyeSize: 0.024, mouthY: 0.40 },
  },
  5: {
    id: 5,
    slug: 'char5_shrub',
    name: '枯枝',
    color: '#6E6C6A',
    emotions: ['lonely', 'restrained', 'quiet'],
    face: { eyeY: 0.50, eyeLeftX: 0.39, eyeRightX: 0.54, eyeSize: 0.026, mouthY: 0.57 },
  },
};

export function charAsset(id: CharId): string {
  return `/assets/characters/${CHARACTERS[id].slug}.png`;
}

const HYBRID_LETTER: Record<CharId, string> = { 0: 'A', 1: 'B', 2: 'C', 3: 'D', 4: 'E', 5: 'F' };

export function hybridAsset(a: CharId, b: CharId): string {
  // Only 15 cross-kind hybrid PNGs exist (A_B .. E_F). Same-kind fusion
  // is blocked upstream, but fall back to the base sprite defensively
  // instead of 404-ing on a nonexistent hybrid_X_X.png.
  if (a === b) return charAsset(a);
  const [lo, hi] = a < b ? [a, b] : [b, a];
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
