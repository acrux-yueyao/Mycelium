// Deposit fragment — additive write of deposit strength.
precision highp float;

uniform float uDeposit;
uniform float uPulse;

varying float vAlive;

void main() {
  if (vAlive < 0.5) discard;
  // Soft round point — smoother than a hard square sprite.
  vec2 d = gl_PointCoord - 0.5;
  float falloff = smoothstep(0.5, 0.0, length(d));
  float v = uDeposit * (0.75 + 0.5 * uPulse) * falloff;
  gl_FragColor = vec4(v, v, v, 1.0);
}
