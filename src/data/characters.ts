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
  eyeY: number;          // vertical center of eye line (0..1 of sprite height)
  eyeLeftX: number;      // horizontal center of left eye (0..1 of sprite width)
  eyeRightX: number;     // horizontal center of right eye
  eyeSize: number;       // eye radius as fraction of sprite width
  skinColor: string;     // fill color for eyelid (matches surrounding surface)
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
    name: '\u653e\u5c04\u661f',
    color: '#E8A28A',
    emotions: ['tender', 'nostalgic', 'soft'],
    // Baked eye dots at (248,203) and (314,203) on 484x435 sprite
    face: { eyeY: 0.467, eyeLeftX: 0.512, eyeRightX: 0.649, eyeSize: 0.032, skinColor: '#F5EFE5' },
  },
  1: {
    id: 1,
    slug: 'char1_bubble',
    name: '\u6c34\u6ce1',
    color: '#A7C8D6',
    emotions: ['calm', 'clear', 'empty'],
    // Baked eye dots at (222,190) and (311,192) on 484x435
    face: { eyeY: 0.439, eyeLeftX: 0.459, eyeRightX: 0.643, eyeSize: 0.030, skinColor: '#F2F4F3' },
  },
  2: {
    id: 2,
    slug: 'char2_mushroom',
    name: '\u8611\u83c7',
    color: '#E89A5C',
    emotions: ['curious', 'playful', 'clumsy'],
    // Baked eye dots at (142,169) and (207,173) on 484x435 \u2014 cap is offset left
    face: { eyeY: 0.394, eyeLeftX: 0.293, eyeRightX: 0.428, eyeSize: 0.028, skinColor: '#F3B478' },
  },
  3: {
    id: 3,
    slug: 'char3_glitter',
    name: '\u4eae\u7247',
    color: '#9AAEE0',
    emotions: ['dreamy', 'excited', 'romantic'],
    // Eyes near center of the glitter ball (manual estimate \u2014 sparkles fooled scanner)
    face: { eyeY: 0.430, eyeLeftX: 0.455, eyeRightX: 0.550, eyeSize: 0.026, skinColor: '#A8B8D4' },
  },
  4: {
    id: 4,
    slug: 'char4_cups',
    name: '\u53cc\u5b50\u676f',
    color: '#7CC8B8',
    emotions: ['companion', 'social', 'attached'],
    // Twin cups \u2014 each "eye" is roughly the center of each creature's face
    face: { eyeY: 0.450, eyeLeftX: 0.349, eyeRightX: 0.752, eyeSize: 0.030, skinColor: '#9BD4C4' },
  },
  5: {
    id: 5,
    slug: 'char5_shrub',
    name: '\u67af\u679d',
    color: '#6E6C6A',
    emotions: ['lonely', 'restrained', 'quiet'],
    // Small eyes inside the shrub's shadowy body (manual estimate)
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
