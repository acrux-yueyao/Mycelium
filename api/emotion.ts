import type { SceneSpec } from '../src/core/scene';
import sceneHandler, { config } from './scene';

export { config };

interface LegacyEmotionResponse {
  primary: { label: string; weight: number };
  secondary: { label: string; weight: number };
  intensity: number;
  species: SceneSpec['morphology']['family'];
  surfaceModifier: 'none';
  rationale: string;
}

export default async function handler(req: Request): Promise<Response> {
  const sceneResponse = await sceneHandler(req);
  if (!sceneResponse.ok) {
    return sceneResponse;
  }
  const scene = (await sceneResponse.json()) as SceneSpec;
  const legacy = toLegacy(scene);
  return json(legacy, 200);
}

function toLegacy(scene: SceneSpec): LegacyEmotionResponse {
  const intensity = clamp01(
    scene.motion.drift * 0.2 +
      scene.motion.pulse * 0.2 +
      scene.mood.arousal * 0.3 +
      scene.mood.tension * 0.2 +
      scene.interaction.pointerStrength * 0.1
  );

  const primary = scene.morphology.family;
  const secondary = scene.interaction.pointerResponse === 'repel-burst'
    ? 'bursting'
    : scene.interaction.pointerResponse === 'follow'
      ? 'following'
      : scene.interaction.pointerResponse;

  return {
    primary: { label: primary, weight: 0.62 },
    secondary: { label: secondary, weight: 0.38 },
    intensity,
    species: scene.morphology.family,
    surfaceModifier: 'none',
    rationale: scene.rationale,
  };
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function json(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
