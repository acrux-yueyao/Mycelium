// Display pass — maps trail strength through a 3-stop gradient and adds
// grain + vignette. Runs to the default framebuffer.
precision highp float;

varying vec2 vUv;

uniform sampler2D uTrail;
uniform vec3 uGrad0;
uniform vec3 uGrad1;
uniform vec3 uGrad2;
uniform vec3 uBackground;
uniform float uGrain;
uniform float uVignette;
uniform float uTime;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

vec3 gradient3(float t) {
  t = clamp(t, 0.0, 1.0);
  if (t < 0.5) {
    return mix(uGrad0, uGrad1, smoothstep(0.0, 0.5, t));
  }
  return mix(uGrad1, uGrad2, smoothstep(0.5, 1.0, t));
}

void main() {
  float trail = texture2D(uTrail, vUv).r;
  // Gentle gamma shaping so low values have presence without saturating highs.
  float t = pow(clamp(trail * 3.0, 0.0, 1.0), 0.75);
  vec3 col = mix(uBackground, gradient3(t), smoothstep(0.0, 0.02, trail));

  // Vignette
  vec2 d = vUv - 0.5;
  float vig = 1.0 - smoothstep(0.35, 0.95, length(d)) * uVignette;
  col *= vig;

  // Grain (organic texture)
  float g = hash(vUv * vec2(1920.0, 1080.0) + uTime * 13.37) - 0.5;
  col += g * uGrain;

  gl_FragColor = vec4(col, 1.0);
}
