// Particle vertex — positions particles in clip space, fades by life.
precision highp float;

attribute vec3 position; // xy = screen pos (aspect-corrected), z = unused
attribute vec2 aData;    // x = life (0..1 remaining), y = size in pixels

varying float vLife;

uniform float uAspect;

void main() {
  vLife = aData.x;
  vec2 clip;
  clip.x = (position.x / uAspect) * 2.0 - 1.0;
  clip.y = position.y * 2.0 - 1.0;
  gl_Position = vec4(clip, 0.0, 1.0);
  gl_PointSize = aData.y * vLife;
}
