// Diffuse + decay pass.
// 3x3 box blur weighted by diffuseRate, then multiplicative decay.
precision highp float;

varying vec2 vUv;

uniform sampler2D uTrail;
uniform vec2  uSimSize;
uniform float uDiffuseRate; // 0..1 — neighbor contribution
uniform float uDecayRate;   // 0..1 — multiplicative retention

void main() {
  vec2 px = 1.0 / uSimSize;
  float c = texture2D(uTrail, vUv).r;
  float s = 0.0;
  // 8 neighbors
  s += texture2D(uTrail, vUv + px * vec2(-1.0, -1.0)).r;
  s += texture2D(uTrail, vUv + px * vec2( 0.0, -1.0)).r;
  s += texture2D(uTrail, vUv + px * vec2( 1.0, -1.0)).r;
  s += texture2D(uTrail, vUv + px * vec2(-1.0,  0.0)).r;
  s += texture2D(uTrail, vUv + px * vec2( 1.0,  0.0)).r;
  s += texture2D(uTrail, vUv + px * vec2(-1.0,  1.0)).r;
  s += texture2D(uTrail, vUv + px * vec2( 0.0,  1.0)).r;
  s += texture2D(uTrail, vUv + px * vec2( 1.0,  1.0)).r;
  float avg = (c + uDiffuseRate * s / 8.0) / (1.0 + uDiffuseRate);
  float v = avg * uDecayRate;
  gl_FragColor = vec4(v, v, v, 1.0);
}
