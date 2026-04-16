// Particle fragment — soft round dot that fades out.
precision highp float;

varying float vLife;

uniform vec3 uParticleColor;

void main() {
  vec2 d = gl_PointCoord - 0.5;
  float r = length(d);
  float alpha = smoothstep(0.5, 0.1, r) * vLife * 0.7;
  gl_FragColor = vec4(uParticleColor, alpha);
}
