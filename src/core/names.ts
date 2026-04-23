/**
 * Random name generator for newborn mushrooms. Pairs a gentle
 * adjective with a small-creature noun — about 20 × 20 = 400
 * combinations, all readable and cute (Velvet Mochi, Sleepy Pip,
 * Honey Biscuit, etc). Kept as a separate module so the pool is
 * easy to extend later.
 */

const ADJECTIVES = [
  'Tiny',   'Sleepy', 'Sunny',  'Fuzzy',  'Honey',
  'Misty',  'Velvet', 'Little', 'Gentle', 'Wobbly',
  'Cloudy', 'Peach',  'Minty',  'Ember',  'Dusky',
  'Dewy',   'Sugar',  'Marble', 'Silky',  'Moony',
];

const NOUNS = [
  'Pudding',  'Biscuit', 'Mochi',    'Crumb',   'Puff',
  'Pip',      'Bun',     'Dewdrop',  'Bell',    'Bean',
  'Moth',     'Button',  'Whisper',  'Doodle',  'Dumpling',
  'Sprite',   'Wisp',    'Pebble',   'Bundle',  'Tartlet',
];

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function randomName(): string {
  return `${pick(ADJECTIVES)} ${pick(NOUNS)}`;
}
