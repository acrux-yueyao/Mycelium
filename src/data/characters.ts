/**
 * Character catalog. Each entry maps a charId (0..5) to:
 *   - its PNG asset path
 *   - display name
 *   - primary color (for tendril mixing, particle color, aura)
 *   - emotion labels that prefer this character
 */

export type CharId = 0 | 1 | 2 | 3 | 4 | 5;

export interface Character {
  id: CharId;
  slug: string;          // filename slug, e.g., 'char0_radial'
  name: string;          // display name
  color: string;         // primary hex, used for tendril/particle mixing
  emotions: string[];    // primary emotion labels that map here
}

export const CHARACTERS: Record<CharId, Character> = {
  0: {
    id: 0,
    slug: 'char0_radial',
    name: '放射星',
    color: '#E8A28A',      // warm peach
    emotions: ['tender', 'nostalgic', 'soft'],
  },
  1: {
    id: 1,
    slug: 'char1_bubble',
    name: '水泡',
    color: '#A7C8D6',      // soft blue
    emotions: ['calm', 'clear', 'empty'],
  },
  2: {
    id: 2,
    slug: 'char2_mushroom',
    name: '蘑菇',
    color: '#E89A5C',      // warm orange
    emotions: ['curious', 'playful', 'clumsy'],
  },
  3: {
    id: 3,
    slug: 'char3_glitter',
    name: '亮片',
    color: '#9AAEE0',      // iridescent blue
    emotions: ['dreamy', 'excited', 'romantic'],
  },
  4: {
    id: 4,
    slug: 'char4_cups',
    name: '双子杯',
    color: '#7CC8B8',      // teal
    emotions: ['companion', 'social', 'attached'],
  },
  5: {
    id: 5,
    slug: 'char5_shrub',
    name: '枯枝',
    color: '#6E6C6A',      // charcoal
    emotions: ['lonely', 'restrained', 'quiet'],
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
