/**
 * Character catalog. Each charId (0..5) is an emotion cluster that maps to:
 *   - a display name (UI / Gallery / debug labels)
 *   - a primary color (tendril mixing, particle color, aura, infecting tint)
 *   - the emotion labels that prefer this cluster
 *
 * The cluster also selects a pixel-spore PALETTE FAMILY in core/mosaic.ts;
 * the visual body is generated there, not from any sprite asset.
 */

export type CharId = 0 | 1 | 2 | 3 | 4 | 5;

export interface Character {
  id: CharId;
  /** English short name — used in UI / Gallery / debug labels. */
  name: string;
  color: string;
  emotions: string[];
}

export const CHARACTERS: Record<CharId, Character> = {
  0: { id: 0, name: 'radial', color: '#E8A28A', emotions: ['tender', 'nostalgic', 'soft'] },
  1: { id: 1, name: 'bubble', color: '#A7C8D6', emotions: ['calm', 'clear', 'empty'] },
  2: { id: 2, name: 'mushroom', color: '#E89A5C', emotions: ['curious', 'playful', 'clumsy'] },
  3: { id: 3, name: 'glitter', color: '#9AAEE0', emotions: ['dreamy', 'excited', 'romantic'] },
  4: { id: 4, name: 'cups', color: '#7CC8B8', emotions: ['companion', 'social', 'attached'] },
  5: { id: 5, name: 'shrub', color: '#6E6C6A', emotions: ['lonely', 'restrained', 'quiet'] },
};

/** Lookup charId from an emotion label; defaults to 0 if unknown. */
export function emotionToCharId(label: string): CharId {
  const needle = label.toLowerCase().trim();
  for (const c of Object.values(CHARACTERS)) {
    if (c.emotions.includes(needle)) return c.id;
  }
  return 0;
}

/**
 * Compatibility between two clusters. Used by the physics layer as a
 * multiplier on long-range attraction (positive → approach, negative →
 * repel) and by the tendril layer to color / size connection lines.
 *
 * Rows = self, columns = other. Diagonal is 1.0 (same kind always bonds).
 * Lonely (5) is mostly negative — it pushes others away, except for
 * calm (1) which can sit comfortably with it.
 */
const COMPAT_MATRIX: number[][] = [
  // 0 tender 1 calm  2 curious 3 dreamy 4 companion 5 lonely
  [1.0, 0.8, 0.5, 0.6, 0.9, -0.2], // 0 tender
  [0.8, 1.0, 0.3, 0.4, 0.7, 0.5], // 1 calm
  [0.5, 0.3, 1.0, 0.8, 0.6, -0.1], // 2 curious
  [0.6, 0.4, 0.8, 1.0, 0.5, -0.3], // 3 dreamy
  [0.9, 0.7, 0.6, 0.5, 1.0, -0.4], // 4 companion
  [-0.2, 0.5, -0.1, -0.3, -0.4, 1.0], // 5 lonely
];

export function compatibility(a: CharId, b: CharId): number {
  return COMPAT_MATRIX[a][b];
}
