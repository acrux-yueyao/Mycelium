import { normalizeSceneSpec, type SceneSpec } from './scene';

export class SceneApiError extends Error {
  constructor(message: string, public cause?: unknown) {
    super(message);
    this.name = 'SceneApiError';
  }
}

export async function readSceneSpec(text: string): Promise<SceneSpec> {
  let response: Response;
  try {
    response = await fetch('/api/scene', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text }),
    });
  } catch (error) {
    throw new SceneApiError('network-failed', error);
  }

  if (!response.ok) {
    let detail = '';
    try {
      detail = await response.text();
    } catch {
      // ignore body parse failure
    }
    throw new SceneApiError(`http-${response.status}: ${detail}`);
  }

  let parsed: unknown;
  try {
    parsed = await response.json();
  } catch (error) {
    throw new SceneApiError('invalid-json', error);
  }

  try {
    return normalizeSceneSpec(parsed, { strict: true });
  } catch (error) {
    throw new SceneApiError('schema-mismatch', error);
  }
}
