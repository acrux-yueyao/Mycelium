/**
 * SpeciesParams — every specimen is the same GPU Physarum simulation,
 * differentiated only by this parameter packet. Six canonical species,
 * each anchored to a real slime-mold / cup-fungus morphology.
 */

export type SpawnPattern = 'radial' | 'branching' | 'cluster' | 'cup' | 'grid';

export type SpeciesId =
  | 'metatrichia'
  | 'physarum'
  | 'cribraria'
  | 'chlorociboria'
  | 'badhamia'
  | 'colloderma';

export interface SpeciesParams {
  id: SpeciesId;
  latin: string;
  common: string;
  // --- simulation (agent behavior) ---
  agentCount: number;            // 5_000 – 200_000
  senseAngle: number;            // radians, cone half-angle
  senseDistance: number;         // texture-space pixels
  turnAngle: number;             // radians per step
  stepSize: number;              // texture-space pixels per step
  depositStrength: number;       // trail added per agent per frame
  diffuseRate: number;           // 0..1 contribution of neighbors
  decayRate: number;             // 0..1 multiplicative decay per frame
  // --- growth / life ---
  spawnPattern: SpawnPattern;
  spawnRadius: number;           // normalized 0..0.5
  pulseFrequency: number;        // Hz, for breathing
  pulseDepth: number;            // 0..1 modulation depth
  // --- visual ---
  gradient: [string, string, string]; // 3-stop trail colormap
  background: string;            // per-species deep-ground tint
  bloomIntensity: number;        // 0..2
  grainAmount: number;           // 0..0.3
  vignetteStrength: number;      // 0..1
}

// Center gradient color shifted subtly by secondary emotion ("surfaceModifier")
export type SurfaceModifier =
  | 'none'
  | 'pearl-translucency'   // lifts mid-tone toward pearl white
  | 'oxidized-copper'      // mid toward rust
  | 'chartreuse-sheen'     // mid toward yellow-green
  | 'indigo-bruise'        // mid toward deep blue-purple
  | 'ember-warmth';        // mid toward warm orange

export const SPECIES: Record<SpeciesId, SpeciesParams> = {
  metatrichia: {
    id: 'metatrichia',
    latin: 'Metatrichia vesparium',
    common: '暗红变毛菌',
    agentCount: 40_000,
    senseAngle: 0.48,
    senseDistance: 16,
    turnAngle: 0.72,
    stepSize: 0.55,
    depositStrength: 0.85,
    diffuseRate: 0.22,
    decayRate: 0.965,
    spawnPattern: 'branching',
    spawnRadius: 0.08,
    pulseFrequency: 0.22,
    pulseDepth: 0.35,
    gradient: ['#0a0505', '#4a1512', '#9b3524'],
    background: '#0b0707',
    bloomIntensity: 0.85,
    grainAmount: 0.14,
    vignetteStrength: 0.65,
  },
  physarum: {
    id: 'physarum',
    latin: 'Physarum polycephalum',
    common: '多头绒泡菌',
    agentCount: 140_000,
    senseAngle: 0.32,
    senseDistance: 10,
    turnAngle: 0.48,
    stepSize: 1.0,
    depositStrength: 1.0,
    diffuseRate: 0.18,
    decayRate: 0.955,
    spawnPattern: 'radial',
    spawnRadius: 0.05,
    pulseFrequency: 0.9,
    pulseDepth: 0.55,
    gradient: ['#130a03', '#c08a1a', '#f7d15b'],
    background: '#0a0704',
    bloomIntensity: 1.25,
    grainAmount: 0.1,
    vignetteStrength: 0.55,
  },
  cribraria: {
    id: 'cribraria',
    latin: 'Cribraria aurantiaca',
    common: '密筛菌',
    agentCount: 80_000,
    senseAngle: 0.28,
    senseDistance: 12,
    turnAngle: 0.26,
    stepSize: 0.75,
    depositStrength: 0.8,
    diffuseRate: 0.14,
    decayRate: 0.97,
    spawnPattern: 'grid',
    spawnRadius: 0.22,
    pulseFrequency: 0.5,
    pulseDepth: 0.25,
    gradient: ['#130a04', '#8a5a1a', '#e0b866'],
    background: '#0a0804',
    bloomIntensity: 0.9,
    grainAmount: 0.12,
    vignetteStrength: 0.5,
  },
  chlorociboria: {
    id: 'chlorociboria',
    latin: 'Chlorociboria aeruginascens',
    common: '波托绿杯菌',
    agentCount: 55_000,
    senseAngle: 0.62,
    senseDistance: 14,
    turnAngle: 0.2,
    stepSize: 0.45,
    depositStrength: 0.65,
    diffuseRate: 0.32,
    decayRate: 0.975,
    spawnPattern: 'cup',
    spawnRadius: 0.16,
    pulseFrequency: 0.12,
    pulseDepth: 0.2,
    gradient: ['#02110f', '#1a5a55', '#7ec6bb'],
    background: '#04100e',
    bloomIntensity: 1.0,
    grainAmount: 0.08,
    vignetteStrength: 0.6,
  },
  badhamia: {
    id: 'badhamia',
    latin: 'Badhamia utricularis',
    common: '钙丝菌',
    agentCount: 95_000,
    senseAngle: 0.55,
    senseDistance: 13,
    turnAngle: 0.95,
    stepSize: 0.85,
    depositStrength: 0.9,
    diffuseRate: 0.2,
    decayRate: 0.96,
    spawnPattern: 'cluster',
    spawnRadius: 0.12,
    pulseFrequency: 0.6,
    pulseDepth: 0.5,
    gradient: ['#0a0514', '#7a2a8a', '#c97fd8'],
    background: '#06040a',
    bloomIntensity: 1.35,
    grainAmount: 0.1,
    vignetteStrength: 0.5,
  },
  colloderma: {
    id: 'colloderma',
    latin: 'Colloderma oculatum',
    common: '胶皮菌',
    agentCount: 60_000,
    senseAngle: 0.42,
    senseDistance: 18,
    turnAngle: 0.3,
    stepSize: 0.5,
    depositStrength: 0.4,
    diffuseRate: 0.45,
    decayRate: 0.98,
    spawnPattern: 'radial',
    spawnRadius: 0.09,
    pulseFrequency: 0.3,
    pulseDepth: 0.4,
    gradient: ['#0a0a0c', '#9a8a95', '#f0e4e0'],
    background: '#07070a',
    bloomIntensity: 1.1,
    grainAmount: 0.07,
    vignetteStrength: 0.55,
  },
};

// Surface modifier tints the MIDDLE color of the gradient — not the endpoints —
// so species identity stays legible while secondary emotion shifts texture.
export function applySurfaceModifier(
  base: SpeciesParams,
  modifier: SurfaceModifier
): SpeciesParams {
  if (modifier === 'none') return base;
  const tints: Record<Exclude<SurfaceModifier, 'none'>, string> = {
    'pearl-translucency': '#d8cfd0',
    'oxidized-copper': '#a04a1f',
    'chartreuse-sheen': '#9ab836',
    'indigo-bruise': '#3a3078',
    'ember-warmth': '#d27a2a',
  };
  const blend = mixHex(base.gradient[1], tints[modifier], 0.45);
  return {
    ...base,
    gradient: [base.gradient[0], blend, base.gradient[2]],
  };
}

// intensity [0..1] scales growth speed and pulse amplitude
export function applyIntensity(base: SpeciesParams, intensity: number): SpeciesParams {
  const t = Math.max(0, Math.min(1, intensity));
  return {
    ...base,
    pulseDepth: base.pulseDepth * (0.6 + 0.8 * t),
    depositStrength: base.depositStrength * (0.75 + 0.5 * t),
  };
}

// --- color helpers ---
function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function rgbToHex(r: number, g: number, b: number): string {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v)))
    .toString(16)
    .padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}
function mixHex(a: string, b: string, t: number): string {
  const [ar, ag, ab] = hexToRgb(a);
  const [br, bg, bb] = hexToRgb(b);
  return rgbToHex(ar + (br - ar) * t, ag + (bg - ag) * t, ab + (bb - ab) * t);
}

// For shader uniforms
export function gradientToVec3s(gradient: [string, string, string]): Float32Array {
  const arr = new Float32Array(9);
  gradient.forEach((hex, i) => {
    const [r, g, b] = hexToRgb(hex);
    arr[i * 3 + 0] = r / 255;
    arr[i * 3 + 1] = g / 255;
    arr[i * 3 + 2] = b / 255;
  });
  return arr;
}
