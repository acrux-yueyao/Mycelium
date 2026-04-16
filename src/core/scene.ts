export type Family =
  | 'metatrichia'
  | 'physarum'
  | 'cribraria'
  | 'chlorociboria'
  | 'badhamia'
  | 'colloderma';

export type PointerResponse = 'attract' | 'repel-soft' | 'repel-burst' | 'follow';

export interface SceneSpec {
  mood: {
    valence: number;
    arousal: number;
    fragility: number;
    tension: number;
    wonder: number;
  };
  morphology: {
    family: Family;
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
  };
  motion: {
    drift: number;
    swirl: number;
    pulse: number;
    collisionSoftness: number;
    cohesion: number;
    scatter: number;
    recovery: number;
    jitter: number;
  };
  material: {
    translucency: number;
    wetness: number;
    glow: number;
    grain: number;
    palette: string[];
  };
  interaction: {
    pointerResponse: PointerResponse;
    pointerStrength: number;
    pointerRadius: number;
    pointerRecovery: number;
  };
  rationale: string;
}

export const FAMILY_VALUES: Family[] = [
  'metatrichia',
  'physarum',
  'cribraria',
  'chlorociboria',
  'badhamia',
  'colloderma',
];

export const POINTER_RESPONSE_VALUES: PointerResponse[] = [
  'attract',
  'repel-soft',
  'repel-burst',
  'follow',
];

export const DEFAULT_SCENE_SPEC: SceneSpec = {
  mood: {
    valence: 0.5,
    arousal: 0.45,
    fragility: 0.5,
    tension: 0.45,
    wonder: 0.55,
  },
  morphology: {
    family: 'cribraria',
    colonyCount: 0.45,
    sporeCount: 0.5,
    shellOpenness: 0.5,
    latticeDensity: 0.5,
    filamentLength: 0.48,
    branching: 0.46,
    asymmetry: 0.45,
    stemLength: 0.44,
    droop: 0.35,
    hollowness: 0.5,
    scaleVariance: 0.45,
    spawnRadius: 0.5,
    birthStagger: 0.4,
  },
  motion: {
    drift: 0.45,
    swirl: 0.35,
    pulse: 0.4,
    collisionSoftness: 0.6,
    cohesion: 0.5,
    scatter: 0.35,
    recovery: 0.5,
    jitter: 0.3,
  },
  material: {
    translucency: 0.55,
    wetness: 0.5,
    glow: 0.35,
    grain: 0.4,
    palette: ['#4f6a6d', '#8fa8a8', '#d9c7ac'],
  },
  interaction: {
    pointerResponse: 'repel-soft',
    pointerStrength: 0.55,
    pointerRadius: 0.5,
    pointerRecovery: 0.55,
  },
  rationale: 'A quiet lattice gathering and drifting in slow breath.',
};

interface NormalizeOptions {
  strict?: boolean;
}

export function normalizeSceneSpec(input: unknown, options: NormalizeOptions = {}): SceneSpec {
  const strict = options.strict ?? false;
  const fail = (message: string): never => {
    throw new Error(message);
  };
  const fallback = DEFAULT_SCENE_SPEC;
  if (!isRecord(input)) {
    if (strict) fail('scene-not-object');
    return fallback;
  }

  const moodRaw = requireRecord(input.mood, 'mood', strict);
  const morphologyRaw = requireRecord(input.morphology, 'morphology', strict);
  const motionRaw = requireRecord(input.motion, 'motion', strict);
  const materialRaw = requireRecord(input.material, 'material', strict);
  const interactionRaw = requireRecord(input.interaction, 'interaction', strict);

  const family = readEnum<Family>(
    morphologyRaw.family,
    FAMILY_VALUES,
    fallback.morphology.family,
    strict,
    'morphology.family'
  );
  const pointerResponse = readEnum<PointerResponse>(
    interactionRaw.pointerResponse,
    POINTER_RESPONSE_VALUES,
    fallback.interaction.pointerResponse,
    strict,
    'interaction.pointerResponse'
  );

  const palette = normalizePalette(materialRaw.palette, fallback.material.palette);
  if (strict && palette.length < 3) {
    fail('material.palette-too-short');
  }

  const rationale = typeof input.rationale === 'string'
    ? input.rationale.trim().slice(0, 180)
    : fallback.rationale;
  if (strict && rationale.length === 0) {
    fail('rationale-empty');
  }

  return {
    mood: {
      valence: readUnit(moodRaw.valence, fallback.mood.valence, strict, 'mood.valence'),
      arousal: readUnit(moodRaw.arousal, fallback.mood.arousal, strict, 'mood.arousal'),
      fragility: readUnit(moodRaw.fragility, fallback.mood.fragility, strict, 'mood.fragility'),
      tension: readUnit(moodRaw.tension, fallback.mood.tension, strict, 'mood.tension'),
      wonder: readUnit(moodRaw.wonder, fallback.mood.wonder, strict, 'mood.wonder'),
    },
    morphology: {
      family,
      colonyCount: readUnit(
        morphologyRaw.colonyCount,
        fallback.morphology.colonyCount,
        strict,
        'morphology.colonyCount'
      ),
      sporeCount: readUnit(
        morphologyRaw.sporeCount,
        fallback.morphology.sporeCount,
        strict,
        'morphology.sporeCount'
      ),
      shellOpenness: readUnit(
        morphologyRaw.shellOpenness,
        fallback.morphology.shellOpenness,
        strict,
        'morphology.shellOpenness'
      ),
      latticeDensity: readUnit(
        morphologyRaw.latticeDensity,
        fallback.morphology.latticeDensity,
        strict,
        'morphology.latticeDensity'
      ),
      filamentLength: readUnit(
        morphologyRaw.filamentLength,
        fallback.morphology.filamentLength,
        strict,
        'morphology.filamentLength'
      ),
      branching: readUnit(
        morphologyRaw.branching,
        fallback.morphology.branching,
        strict,
        'morphology.branching'
      ),
      asymmetry: readUnit(
        morphologyRaw.asymmetry,
        fallback.morphology.asymmetry,
        strict,
        'morphology.asymmetry'
      ),
      stemLength: readUnit(
        morphologyRaw.stemLength,
        fallback.morphology.stemLength,
        strict,
        'morphology.stemLength'
      ),
      droop: readUnit(morphologyRaw.droop, fallback.morphology.droop, strict, 'morphology.droop'),
      hollowness: readUnit(
        morphologyRaw.hollowness,
        fallback.morphology.hollowness,
        strict,
        'morphology.hollowness'
      ),
      scaleVariance: readUnit(
        morphologyRaw.scaleVariance,
        fallback.morphology.scaleVariance,
        strict,
        'morphology.scaleVariance'
      ),
      spawnRadius: readUnit(
        morphologyRaw.spawnRadius,
        fallback.morphology.spawnRadius,
        strict,
        'morphology.spawnRadius'
      ),
      birthStagger: readUnit(
        morphologyRaw.birthStagger,
        fallback.morphology.birthStagger,
        strict,
        'morphology.birthStagger'
      ),
    },
    motion: {
      drift: readUnit(motionRaw.drift, fallback.motion.drift, strict, 'motion.drift'),
      swirl: readUnit(motionRaw.swirl, fallback.motion.swirl, strict, 'motion.swirl'),
      pulse: readUnit(motionRaw.pulse, fallback.motion.pulse, strict, 'motion.pulse'),
      collisionSoftness: readUnit(
        motionRaw.collisionSoftness,
        fallback.motion.collisionSoftness,
        strict,
        'motion.collisionSoftness'
      ),
      cohesion: readUnit(motionRaw.cohesion, fallback.motion.cohesion, strict, 'motion.cohesion'),
      scatter: readUnit(motionRaw.scatter, fallback.motion.scatter, strict, 'motion.scatter'),
      recovery: readUnit(motionRaw.recovery, fallback.motion.recovery, strict, 'motion.recovery'),
      jitter: readUnit(motionRaw.jitter, fallback.motion.jitter, strict, 'motion.jitter'),
    },
    material: {
      translucency: readUnit(
        materialRaw.translucency,
        fallback.material.translucency,
        strict,
        'material.translucency'
      ),
      wetness: readUnit(materialRaw.wetness, fallback.material.wetness, strict, 'material.wetness'),
      glow: readUnit(materialRaw.glow, fallback.material.glow, strict, 'material.glow'),
      grain: readUnit(materialRaw.grain, fallback.material.grain, strict, 'material.grain'),
      palette,
    },
    interaction: {
      pointerResponse,
      pointerStrength: readUnit(
        interactionRaw.pointerStrength,
        fallback.interaction.pointerStrength,
        strict,
        'interaction.pointerStrength'
      ),
      pointerRadius: readUnit(
        interactionRaw.pointerRadius,
        fallback.interaction.pointerRadius,
        strict,
        'interaction.pointerRadius'
      ),
      pointerRecovery: readUnit(
        interactionRaw.pointerRecovery,
        fallback.interaction.pointerRecovery,
        strict,
        'interaction.pointerRecovery'
      ),
    },
    rationale: rationale.length > 0 ? rationale : fallback.rationale,
  };
}

export function sceneFingerprint(scene: SceneSpec): string {
  return JSON.stringify([
    scene.mood.valence,
    scene.mood.arousal,
    scene.mood.fragility,
    scene.mood.tension,
    scene.mood.wonder,
    scene.morphology.family,
    scene.morphology.colonyCount,
    scene.morphology.sporeCount,
    scene.morphology.shellOpenness,
    scene.morphology.latticeDensity,
    scene.morphology.filamentLength,
    scene.morphology.branching,
    scene.morphology.asymmetry,
    scene.morphology.stemLength,
    scene.morphology.droop,
    scene.morphology.hollowness,
    scene.morphology.scaleVariance,
    scene.morphology.spawnRadius,
    scene.morphology.birthStagger,
    scene.motion.drift,
    scene.motion.swirl,
    scene.motion.pulse,
    scene.motion.collisionSoftness,
    scene.motion.cohesion,
    scene.motion.scatter,
    scene.motion.recovery,
    scene.motion.jitter,
    scene.material.translucency,
    scene.material.wetness,
    scene.material.glow,
    scene.material.grain,
    scene.material.palette.join(','),
    scene.interaction.pointerResponse,
    scene.interaction.pointerStrength,
    scene.interaction.pointerRadius,
    scene.interaction.pointerRecovery,
  ]);
}

export function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function requireRecord(value: unknown, path: string, strict: boolean): Record<string, unknown> {
  if (isRecord(value)) return value;
  if (strict) {
    throw new Error(`${path}-missing`);
  }
  return {};
}

function readUnit(value: unknown, fallback: number, strict: boolean, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    if (strict) {
      throw new Error(`${path}-not-number`);
    }
    return fallback;
  }
  return clamp01(value);
}

function readEnum<T extends string>(
  value: unknown,
  allowed: readonly T[],
  fallback: T,
  strict: boolean,
  path: string
): T {
  if (typeof value === 'string' && (allowed as readonly string[]).includes(value)) {
    return value as T;
  }
  if (strict) {
    throw new Error(`${path}-invalid`);
  }
  return fallback;
}

function normalizePalette(input: unknown, fallback: string[]): string[] {
  if (!Array.isArray(input)) return fallback;
  const valid = input
    .filter((c): c is string => typeof c === 'string')
    .map((c) => c.trim())
    .filter((c) => /^#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})$/.test(c));
  if (valid.length === 0) return fallback;
  const clamped = valid.slice(0, 5);
  while (clamped.length < 3) {
    clamped.push(fallback[clamped.length % fallback.length]);
  }
  return clamped;
}
