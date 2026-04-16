// Deposit pass (point rendering).
// Each vertex of a Points geometry corresponds to one texel in the agent
// texture. We read the agent's position from the texture and emit a point
// at that position in clip space of the trail RT.

precision highp float;

uniform sampler2D uAgents;
uniform float uPointSize;
uniform float uGrowth; // 0..1 — gates which agents are "alive" yet

attribute vec2 aUv;    // where to read in the agent texture
attribute float aOrder; // normalized spawn order 0..1

varying float vAlive;

void main() {
  vec4 a = texture2D(uAgents, aUv);
  vec2 pos = a.rg; // 0..1
  // Convert to clip space [-1, 1]
  vec2 clip = pos * 2.0 - 1.0;

  // Gate by growth envelope — agents activate in their spawn-order range
  vAlive = aOrder <= uGrowth ? 1.0 : 0.0;

  gl_Position = vec4(clip, 0.0, 1.0);
  gl_PointSize = uPointSize;
}
