import { DEFAULT_SCENE_SPEC, type Family, type SceneSpec } from './scene';
import { Rng } from './seed';

interface NumericBundle {
  colonyCount: number;
  sporeCount: number;
  shellOpenness: number;
  latticeDensity: number;
  filamentLength: number;
  branching: number;
  asymmetry: number;
  stemLength: number;
  droop: number;
  hollowness: number;
  scaleVariance: number;
  spawnRadius: number;
  birthStagger: number;
  drift: number;
  swirl: number;
  pulse: number;
  collisionSoftness: number;
  cohesion: number;
  scatter: number;
  recovery: number;
  jitter: number;
  translucency: number;
  wetness: number;
  glow: number;
  grain: number;
  pointerStrength: number;
  pointerRadius: number;
  pointerRecovery: number;
}

export interface ResolvedOrganismSpec {
  family: Family;
  palette: string[];
  rationale: string;
  mood: SceneSpec['mood'];
  interaction: SceneSpec['interaction'];
  colonyCount: number;
  sporeCount: number;
  shellOpenness: number;
  latticeDensity: number;
  filamentLength: number;
  branching: number;
  asymmetry: number;
  stemLength: number;
  droop: number;
  hollowness: number;
  scaleVariance: number;
  spawnRadius: number;
  birthStagger: number;
  drift: number;
  swirl: number;
  pulse: number;
  collisionSoftness: number;
  cohesion: number;
  scatter: number;
  recovery: number;
  jitter: number;
  translucency: number;
  wetness: number;
  glow: number;
  grain: number;
  pointerStrength: number;
  pointerRadius: number;
  pointerRecovery: number;
}

const DEFAULT_BUNDLE: NumericBundle = {
  colonyCount: DEFAULT_SCENE_SPEC.morphology.colonyCount,
  sporeCount: DEFAULT_SCENE_SPEC.morphology.sporeCount,
  shellOpenness: DEFAULT_SCENE_SPEC.morphology.shellOpenness,
  latticeDensity: DEFAULT_SCENE_SPEC.morphology.latticeDensity,
  filamentLength: DEFAULT_SCENE_SPEC.morphology.filamentLength,
  branching: DEFAULT_SCENE_SPEC.morphology.branching,
  asymmetry: DEFAULT_SCENE_SPEC.morphology.asymmetry,
  stemLength: DEFAULT_SCENE_SPEC.morphology.stemLength,
  droop: DEFAULT_SCENE_SPEC.morphology.droop,
  hollowness: DEFAULT_SCENE_SPEC.morphology.hollowness,
  scaleVariance: DEFAULT_SCENE_SPEC.morphology.scaleVariance,
  spawnRadius: DEFAULT_SCENE_SPEC.morphology.spawnRadius,
  birthStagger: DEFAULT_SCENE_SPEC.morphology.birthStagger,
  drift: DEFAULT_SCENE_SPEC.motion.drift,
  swirl: DEFAULT_SCENE_SPEC.motion.swirl,
  pulse: DEFAULT_SCENE_SPEC.motion.pulse,
  collisionSoftness: DEFAULT_SCENE_SPEC.motion.collisionSoftness,
  cohesion: DEFAULT_SCENE_SPEC.motion.cohesion,
  scatter: DEFAULT_SCENE_SPEC.motion.scatter,
  recovery: DEFAULT_SCENE_SPEC.motion.recovery,
  jitter: DEFAULT_SCENE_SPEC.motion.jitter,
  translucency: DEFAULT_SCENE_SPEC.material.translucency,
  wetness: DEFAULT_SCENE_SPEC.material.wetness,
  glow: DEFAULT_SCENE_SPEC.material.glow,
  grain: DEFAULT_SCENE_SPEC.material.grain,
  pointerStrength: DEFAULT_SCENE_SPEC.interaction.pointerStrength,
  pointerRadius: DEFAULT_SCENE_SPEC.interaction.pointerRadius,
  pointerRecovery: DEFAULT_SCENE_SPEC.interaction.pointerRecovery,
};

const FAMILY_PRIORS: Record<Family, NumericBundle> = {
  metatrichia: {
    ...DEFAULT_BUNDLE,
    colonyCount: 0.3,
    sporeCount: 0.65,
    shellOpenness: 0.38,
    latticeDensity: 0.74,
    filamentLength: 0.66,
    branching: 0.75,
    asymmetry: 0.62,
    droop: 0.55,
    hollowness: 0.35,
    drift: 0.35,
    cohesion: 0.64,
    scatter: 0.26,
    glow: 0.25,
    grain: 0.62,
  },
  physarum: {
    ...DEFAULT_BUNDLE,
    colonyCount: 0.55,
    sporeCount: 0.62,
    shellOpenness: 0.64,
    latticeDensity: 0.55,
    filamentLength: 0.73,
    branching: 0.68,
    asymmetry: 0.6,
    stemLength: 0.35,
    drift: 0.7,
    swirl: 0.58,
    pulse: 0.72,
    cohesion: 0.46,
    scatter: 0.58,
    jitter: 0.58,
    glow: 0.44,
  },
  cribraria: {
    ...DEFAULT_BUNDLE,
    colonyCount: 0.45,
    sporeCount: 0.48,
    shellOpenness: 0.56,
    latticeDensity: 0.7,
    filamentLength: 0.44,
    branching: 0.42,
    asymmetry: 0.36,
    stemLength: 0.58,
    hollowness: 0.58,
    drift: 0.4,
    swirl: 0.3,
    pulse: 0.33,
    cohesion: 0.62,
    scatter: 0.28,
    translucency: 0.6,
    grain: 0.55,
  },
  chlorociboria: {
    ...DEFAULT_BUNDLE,
    colonyCount: 0.4,
    sporeCount: 0.44,
    shellOpenness: 0.66,
    latticeDensity: 0.43,
    filamentLength: 0.55,
    branching: 0.35,
    asymmetry: 0.34,
    stemLength: 0.42,
    droop: 0.62,
    hollowness: 0.64,
    drift: 0.3,
    swirl: 0.23,
    pulse: 0.28,
    cohesion: 0.53,
    scatter: 0.22,
    recovery: 0.72,
    translucency: 0.7,
    wetness: 0.66,
    glow: 0.42,
  },
  badhamia: {
    ...DEFAULT_BUNDLE,
    colonyCount: 0.56,
    sporeCount: 0.58,
    shellOpenness: 0.52,
    latticeDensity: 0.6,
    filamentLength: 0.6,
    branching: 0.65,
    asymmetry: 0.7,
    stemLength: 0.4,
    scaleVariance: 0.66,
    drift: 0.62,
    swirl: 0.72,
    pulse: 0.66,
    cohesion: 0.42,
    scatter: 0.64,
    jitter: 0.64,
    glow: 0.62,
    grain: 0.48,
  },
  colloderma: {
    ...DEFAULT_BUNDLE,
    colonyCount: 0.34,
    sporeCount: 0.4,
    shellOpenness: 0.72,
    latticeDensity: 0.35,
    filamentLength: 0.5,
    branching: 0.3,
    asymmetry: 0.4,
    stemLength: 0.47,
    droop: 0.5,
    hollowness: 0.74,
    drift: 0.24,
    swirl: 0.2,
    pulse: 0.26,
    cohesion: 0.56,
    scatter: 0.2,
    recovery: 0.76,
    jitter: 0.2,
    translucency: 0.78,
    wetness: 0.72,
    glow: 0.52,
    grain: 0.26,
  },
};

export function resolveOrganismSpec(scene: SceneSpec, seed: number): ResolvedOrganismSpec {
  const rng = new Rng(seed ^ 0x9e3779b9);
  const prior = FAMILY_PRIORS[scene.morphology.family];
  const sceneBundle = sceneToBundle(scene);

  const merged: NumericBundle = {
    colonyCount: blend(DEFAULT_BUNDLE.colonyCount, prior.colonyCount, sceneBundle.colonyCount, rng, 0.04),
    sporeCount: blend(DEFAULT_BUNDLE.sporeCount, prior.sporeCount, sceneBundle.sporeCount, rng, 0.04),
    shellOpenness: blend(DEFAULT_BUNDLE.shellOpenness, prior.shellOpenness, sceneBundle.shellOpenness, rng, 0.05),
    latticeDensity: blend(DEFAULT_BUNDLE.latticeDensity, prior.latticeDensity, sceneBundle.latticeDensity, rng, 0.04),
    filamentLength: blend(DEFAULT_BUNDLE.filamentLength, prior.filamentLength, sceneBundle.filamentLength, rng, 0.05),
    branching: blend(DEFAULT_BUNDLE.branching, prior.branching, sceneBundle.branching, rng, 0.05),
    asymmetry: blend(DEFAULT_BUNDLE.asymmetry, prior.asymmetry, sceneBundle.asymmetry, rng, 0.05),
    stemLength: blend(DEFAULT_BUNDLE.stemLength, prior.stemLength, sceneBundle.stemLength, rng, 0.05),
    droop: blend(DEFAULT_BUNDLE.droop, prior.droop, sceneBundle.droop, rng, 0.05),
    hollowness: blend(DEFAULT_BUNDLE.hollowness, prior.hollowness, sceneBundle.hollowness, rng, 0.05),
    scaleVariance: blend(DEFAULT_BUNDLE.scaleVariance, prior.scaleVariance, sceneBundle.scaleVariance, rng, 0.06),
    spawnRadius: blend(DEFAULT_BUNDLE.spawnRadius, prior.spawnRadius, sceneBundle.spawnRadius, rng, 0.05),
    birthStagger: blend(DEFAULT_BUNDLE.birthStagger, prior.birthStagger, sceneBundle.birthStagger, rng, 0.05),
    drift: blend(DEFAULT_BUNDLE.drift, prior.drift, sceneBundle.drift, rng, 0.06),
    swirl: blend(DEFAULT_BUNDLE.swirl, prior.swirl, sceneBundle.swirl, rng, 0.06),
    pulse: blend(DEFAULT_BUNDLE.pulse, prior.pulse, sceneBundle.pulse, rng, 0.06),
    collisionSoftness: blend(
      DEFAULT_BUNDLE.collisionSoftness,
      prior.collisionSoftness,
      sceneBundle.collisionSoftness,
      rng,
      0.04
    ),
    cohesion: blend(DEFAULT_BUNDLE.cohesion, prior.cohesion, sceneBundle.cohesion, rng, 0.05),
    scatter: blend(DEFAULT_BUNDLE.scatter, prior.scatter, sceneBundle.scatter, rng, 0.05),
    recovery: blend(DEFAULT_BUNDLE.recovery, prior.recovery, sceneBundle.recovery, rng, 0.05),
    jitter: blend(DEFAULT_BUNDLE.jitter, prior.jitter, sceneBundle.jitter, rng, 0.06),
    translucency: blend(DEFAULT_BUNDLE.translucency, prior.translucency, sceneBundle.translucency, rng, 0.04),
    wetness: blend(DEFAULT_BUNDLE.wetness, prior.wetness, sceneBundle.wetness, rng, 0.04),
    glow: blend(DEFAULT_BUNDLE.glow, prior.glow, sceneBundle.glow, rng, 0.04),
    grain: blend(DEFAULT_BUNDLE.grain, prior.grain, sceneBundle.grain, rng, 0.04),
    pointerStrength: blend(
      DEFAULT_BUNDLE.pointerStrength,
      prior.pointerStrength,
      sceneBundle.pointerStrength,
      rng,
      0.05
    ),
    pointerRadius: blend(
      DEFAULT_BUNDLE.pointerRadius,
      prior.pointerRadius,
      sceneBundle.pointerRadius,
      rng,
      0.05
    ),
    pointerRecovery: blend(
      DEFAULT_BUNDLE.pointerRecovery,
      prior.pointerRecovery,
      sceneBundle.pointerRecovery,
      rng,
      0.04
    ),
  };

  const colonyCount = Math.round(remap(merged.colonyCount, 1, 7));
  const sporeCount = Math.round(remap(merged.sporeCount, 80, 520));

  return {
    family: scene.morphology.family,
    mood: scene.mood,
    interaction: {
      pointerResponse: scene.interaction.pointerResponse,
      pointerStrength: merged.pointerStrength,
      pointerRadius: merged.pointerRadius,
      pointerRecovery: merged.pointerRecovery,
    },
    rationale: scene.rationale,
    palette: scene.material.palette,
    colonyCount,
    sporeCount,
    shellOpenness: merged.shellOpenness,
    latticeDensity: merged.latticeDensity,
    filamentLength: merged.filamentLength,
    branching: merged.branching,
    asymmetry: merged.asymmetry,
    stemLength: merged.stemLength,
    droop: merged.droop,
    hollowness: merged.hollowness,
    scaleVariance: merged.scaleVariance,
    spawnRadius: merged.spawnRadius,
    birthStagger: merged.birthStagger,
    drift: merged.drift,
    swirl: merged.swirl,
    pulse: merged.pulse,
    collisionSoftness: merged.collisionSoftness,
    cohesion: merged.cohesion,
    scatter: merged.scatter,
    recovery: merged.recovery,
    jitter: merged.jitter,
    translucency: merged.translucency,
    wetness: merged.wetness,
    glow: merged.glow,
    grain: merged.grain,
    pointerStrength: merged.pointerStrength,
    pointerRadius: merged.pointerRadius,
    pointerRecovery: merged.pointerRecovery,
  };
}

function sceneToBundle(scene: SceneSpec): NumericBundle {
  return {
    colonyCount: scene.morphology.colonyCount,
    sporeCount: scene.morphology.sporeCount,
    shellOpenness: scene.morphology.shellOpenness,
    latticeDensity: scene.morphology.latticeDensity,
    filamentLength: scene.morphology.filamentLength,
    branching: scene.morphology.branching,
    asymmetry: scene.morphology.asymmetry,
    stemLength: scene.morphology.stemLength,
    droop: scene.morphology.droop,
    hollowness: scene.morphology.hollowness,
    scaleVariance: scene.morphology.scaleVariance,
    spawnRadius: scene.morphology.spawnRadius,
    birthStagger: scene.morphology.birthStagger,
    drift: scene.motion.drift,
    swirl: scene.motion.swirl,
    pulse: scene.motion.pulse,
    collisionSoftness: scene.motion.collisionSoftness,
    cohesion: scene.motion.cohesion,
    scatter: scene.motion.scatter,
    recovery: scene.motion.recovery,
    jitter: scene.motion.jitter,
    translucency: scene.material.translucency,
    wetness: scene.material.wetness,
    glow: scene.material.glow,
    grain: scene.material.grain,
    pointerStrength: scene.interaction.pointerStrength,
    pointerRadius: scene.interaction.pointerRadius,
    pointerRecovery: scene.interaction.pointerRecovery,
  };
}

function blend(base: number, prior: number, scene: number, rng: Rng, jitterAmount: number): number {
  const noise = (rng.next() - 0.5) * 2 * jitterAmount;
  const value = base * 0.15 + prior * 0.25 + scene * 0.6 + noise;
  return clamp01(value);
}

function remap(value: number, min: number, max: number): number {
  return min + (max - min) * clamp01(value);
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}
