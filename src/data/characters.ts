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

/**
 * Default generic face for single-body hybrids.
 */
export const HYBRID_FACE: FaceConfig = {
  eyeY: 0.42,
  eyeLeftX: 0.36,
  eyeRightX: 0.64,
  eyeSize: 0.035,
  mouthY: 0.51,
};

const HYBRID_LETTER: Record<CharId, string> = { 0: 'A', 1: 'B', 2: 'C', 3: 'D', 4: 'E', 5: 'F' };

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
  // Visibly twin images we've confirmed so far:
  'A_C': [
    { eyeY: 0.52, eyeLeftX: 0.23, eyeRightX: 0.36, eyeSize: 0.024, mouthY: 0.60 },
    { eyeY: 0.52, eyeLeftX: 0.60, eyeRightX: 0.73, eyeSize: 0.024, mouthY: 0.60 },
  ],
  'A_F': [
    { eyeY: 0.36, eyeLeftX: 0.18, eyeRightX: 0.35, eyeSize: 0.028, mouthY: 0.46 },
    { eyeY: 0.36, eyeLeftX: 0.58, eyeRightX: 0.75, eyeSize: 0.028, mouthY: 0.46 },
  ],
  'B_E': [
    { eyeY: 0.24, eyeLeftX: 0.23, eyeRightX: 0.42, eyeSize: 0.028, mouthY: 0.34 },
    { eyeY: 0.72, eyeLeftX: 0.54, eyeRightX: 0.70, eyeSize: 0.028, mouthY: 0.81 },
  ],
  'B_F': [
    { eyeY: 0.36, eyeLeftX: 0.18, eyeRightX: 0.35, eyeSize: 0.028, mouthY: 0.46 },
    { eyeY: 0.36, eyeLeftX: 0.58, eyeRightX: 0.75, eyeSize: 0.028, mouthY: 0.46 },
  ],
  'C_F': [
    { eyeY: 0.45, eyeLeftX: 0.18, eyeRightX: 0.35, eyeSize: 0.028, mouthY: 0.54 },
    { eyeY: 0.45, eyeLeftX: 0.60, eyeRightX: 0.77, eyeSize: 0.028, mouthY: 0.54 },
  ],
  'D_F': [
    { eyeY: 0.35, eyeLeftX: 0.20, eyeRightX: 0.36, eyeSize: 0.028, mouthY: 0.44 },
    { eyeY: 0.35, eyeLeftX: 0.60, eyeRightX: 0.76, eyeSize: 0.028, mouthY: 0.44 },
  ],
  'E_F': [
    { eyeY: 0.32, eyeLeftX: 0.22, eyeRightX: 0.38, eyeSize: 0.028, mouthY: 0.40 },
    { eyeY: 0.32, eyeLeftX: 0.62, eyeRightX: 0.78, eyeSize: 0.028, mouthY: 0.40 },
  ],
};

export function hybridFaces(a: CharId, b: CharId): FaceConfig[] {
  if (a === b) return [CHARACTERS[a].face];
  const lo = a < b ? a : b;
  const hi = a < b ? b : a;
  const key = `${HYBRID_LETTER[lo]}_${HYBRID_LETTER[hi]}`;
  return HYBRID_FACES_MAP[key] ?? [HYBRID_FACE];
}

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
