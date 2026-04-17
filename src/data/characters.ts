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
    face: { eyeY: 0.52, eyeLeftX: 0.55, eyeRightX: 0.71, eyeSize: 0.028, mouthY: 0.60 },
  },
  1: {
    id: 1,
    slug: 'char1_bubble',
    name: '水泡',
    color: '#A7C8D6',
    emotions: ['calm', 'clear', 'empty'],
    face: { eyeY: 0.43, eyeLeftX: 0.42, eyeRightX: 0.58, eyeSize: 0.028, mouthY: 0.51 },
  },
  2: {
    id: 2,
    slug: 'char2_mushroom',
    name: '蘑菇',
    color: '#E89A5C',
    emotions: ['curious', 'playful', 'clumsy'],
    face: { eyeY: 0.57, eyeLeftX: 0.34, eyeRightX: 0.50, eyeSize: 0.028, mouthY: 0.65 },
  },
  3: {
    id: 3,
    slug: 'char3_glitter',
    name: '亮片',
    color: '#9AAEE0',
    emotions: ['dreamy', 'excited', 'romantic'],
    face: { eyeY: 0.48, eyeLeftX: 0.39, eyeRightX: 0.55, eyeSize: 0.028, mouthY: 0.56 },
  },
  4: {
    id: 4,
    slug: 'char4_cups',
    name: '双子杯',
    color: '#7CC8B8',
    emotions: ['companion', 'social', 'attached'],
    face: { eyeY: 0.42, eyeLeftX: 0.18, eyeRightX: 0.33, eyeSize: 0.024, mouthY: 0.50 },
    secondaryFace: { eyeY: 0.42, eyeLeftX: 0.57, eyeRightX: 0.72, eyeSize: 0.024, mouthY: 0.50 },
  },
  5: {
    id: 5,
    slug: 'char5_shrub',
    name: '枯枝',
    color: '#6E6C6A',
    emotions: ['lonely', 'restrained', 'quiet'],
    face: { eyeY: 0.50, eyeLeftX: 0.37, eyeRightX: 0.53, eyeSize: 0.026, mouthY: 0.58 },
  },
};

export function charAsset(id: CharId): string {
  return `/assets/characters/${CHARACTERS[id].slug}.png`;
}

/**
 * Default generic face for single-body hybrids — centered close-set
 * eyes with a small smile just below.
 */
export const HYBRID_FACE: FaceConfig = {
  eyeY: 0.45,
  eyeLeftX: 0.40,
  eyeRightX: 0.56,
  eyeSize: 0.030,
  mouthY: 0.53,
};

/**
 * CharId → letter mapping used in hybrid filenames. This is the
 * *artist's* labeling, not a simple 0..5 → A..F sequence:
 *   A = char2 mushroom (橙色空心蘑菇)
 *   B = char3 glitter  (彩色闪片圆头菌)
 *   C = char5 shrub    (黑枝白团菌)
 *   D = char1 bubble   (白色果冻水滴菌)
 *   E = char0 radial   (白球星芒菌)
 *   F = char4 cups     (薄荷双杯菌)
 */
const HYBRID_LETTER: Record<CharId, string> = { 0: 'E', 1: 'D', 2: 'A', 3: 'B', 4: 'F', 5: 'C' };

/**
 * Per-pair face overrides for hybrids whose art has a twin-body layout
 * (two separate creatures fused into one sprite). Keyed by sorted letter
 * pair. If absent, a hybrid falls back to a single HYBRID_FACE.
 *
 * Audit status (2026-04): the hand-drawn art doesn't always match the
 * filename pair. We wire twin faces only where the visible image
 * actually shows twin anatomy — coords here are correct FOR THE IMAGE,
 * not for the nominal pair.
 */
const HYBRID_FACES_MAP: Partial<Record<string, FaceConfig[]>> = {
  'A_C': [
    { eyeY: 0.52, eyeLeftX: 0.22, eyeRightX: 0.36, eyeSize: 0.024, mouthY: 0.60 },
    { eyeY: 0.52, eyeLeftX: 0.61, eyeRightX: 0.75, eyeSize: 0.024, mouthY: 0.60 },
  ],
  'A_F': [
    { eyeY: 0.42, eyeLeftX: 0.19, eyeRightX: 0.33, eyeSize: 0.024, mouthY: 0.50 },
    { eyeY: 0.42, eyeLeftX: 0.60, eyeRightX: 0.73, eyeSize: 0.024, mouthY: 0.50 },
  ],
  'B_E': [
    { eyeY: 0.28, eyeLeftX: 0.24, eyeRightX: 0.38, eyeSize: 0.024, mouthY: 0.36 },
    { eyeY: 0.70, eyeLeftX: 0.57, eyeRightX: 0.71, eyeSize: 0.024, mouthY: 0.78 },
  ],
  'B_F': [
    { eyeY: 0.42, eyeLeftX: 0.19, eyeRightX: 0.33, eyeSize: 0.024, mouthY: 0.50 },
    { eyeY: 0.42, eyeLeftX: 0.60, eyeRightX: 0.73, eyeSize: 0.024, mouthY: 0.50 },
  ],
  'C_F': [
    { eyeY: 0.48, eyeLeftX: 0.19, eyeRightX: 0.33, eyeSize: 0.024, mouthY: 0.56 },
    { eyeY: 0.48, eyeLeftX: 0.60, eyeRightX: 0.73, eyeSize: 0.024, mouthY: 0.56 },
  ],
  'D_F': [
    { eyeY: 0.40, eyeLeftX: 0.19, eyeRightX: 0.33, eyeSize: 0.024, mouthY: 0.48 },
    { eyeY: 0.40, eyeLeftX: 0.60, eyeRightX: 0.73, eyeSize: 0.024, mouthY: 0.48 },
  ],
  'E_F': [
    { eyeY: 0.38, eyeLeftX: 0.19, eyeRightX: 0.33, eyeSize: 0.024, mouthY: 0.46 },
    { eyeY: 0.38, eyeLeftX: 0.60, eyeRightX: 0.73, eyeSize: 0.024, mouthY: 0.46 },
  ],
};

export function hybridFaces(a: CharId, b: CharId): FaceConfig[] {
  if (a === b) return [CHARACTERS[a].face];
  const la = HYBRID_LETTER[a];
  const lb = HYBRID_LETTER[b];
  const [lo, hi] = la < lb ? [la, lb] : [lb, la];
  const key = `${lo}_${hi}`;
  return HYBRID_FACES_MAP[key] ?? [HYBRID_FACE];
}

export function hybridAsset(a: CharId, b: CharId): string {
  // Only 15 cross-kind hybrid PNGs exist (A_B .. E_F). Same-kind fusion
  // is blocked upstream, but fall back to the base sprite defensively
  // instead of 404-ing on a nonexistent hybrid_X_X.png.
  if (a === b) return charAsset(a);
  const la = HYBRID_LETTER[a];
  const lb = HYBRID_LETTER[b];
  const [lo, hi] = la < lb ? [la, lb] : [lb, la];
  return `/assets/characters/hybrid_${lo}_${hi}.png`;
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
