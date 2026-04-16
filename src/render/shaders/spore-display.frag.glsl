// Spore display — renders multiple volumetric spore entities.
// Each spore's interior is textured by the living Physarum trail.
// Exterior has 3D sphere shading, surface lattice, membrane rim, glow halo, and stalk.

precision highp float;

varying vec2 vUv;

// Trail from Physarum sim
uniform sampler2D uTrail;

// Time + aspect
uniform float uTime;
uniform float uAspect; // width / height

// Spore data (max 12)
const int MAX_SPORES = 12;
uniform int   uSporeCount;
uniform vec2  uSporePos[MAX_SPORES];     // aspect-corrected coords
uniform float uSporeRadius[MAX_SPORES];  // in aspect-corrected space
uniform float uSporeArchetype[MAX_SPORES]; // 0..4
uniform vec2  uSporeTrailOff[MAX_SPORES]; // UV offset into trail texture

// Grain
uniform float uGrain;

// ---- Archetype palettes (hardcoded) ----
// A: translucent grey-white crystalline
// B: warm copper-orange rust
// C: iridescent holographic
// D: electric cyan/turquoise
// E: dark silhouette bioluminescent

vec3 archetypeBody(float a, float t) {
  if (a < 0.5) return vec3(0.72, 0.7, 0.68);       // A
  if (a < 1.5) return vec3(0.65, 0.35, 0.12);       // B
  if (a < 2.5) {                                      // C: iridescent
    float h = fract(t * 0.15);
    float r = 0.55 + 0.45 * sin(h * 6.2832);
    float g = 0.55 + 0.45 * sin(h * 6.2832 + 2.094);
    float b = 0.55 + 0.45 * sin(h * 6.2832 + 4.189);
    return vec3(r, g, b);
  }
  if (a < 3.5) return vec3(0.08, 0.72, 0.68);       // D
  return vec3(0.06, 0.06, 0.09);                      // E
}

vec3 archetypeHighlight(float a) {
  if (a < 0.5) return vec3(0.92, 0.92, 0.96);
  if (a < 1.5) return vec3(0.92, 0.58, 0.28);
  if (a < 2.5) return vec3(1.0, 1.0, 1.0);
  if (a < 3.5) return vec3(0.3, 0.96, 0.92);
  return vec3(0.35, 0.55, 0.45);
}

vec3 archetypeRim(float a) {
  if (a < 0.5) return vec3(0.82, 0.82, 0.88);
  if (a < 1.5) return vec3(0.52, 0.22, 0.08);
  if (a < 2.5) return vec3(0.55, 0.35, 0.85);
  if (a < 3.5) return vec3(0.04, 0.48, 0.42);
  return vec3(0.18, 0.38, 0.28);
}

vec3 archetypeGlow(float a) {
  if (a < 0.5) return vec3(0.6, 0.6, 0.65);
  if (a < 1.5) return vec3(0.55, 0.3, 0.1);
  if (a < 2.5) return vec3(0.5, 0.4, 0.7);
  if (a < 3.5) return vec3(0.05, 0.55, 0.5);
  return vec3(0.15, 0.35, 0.25);
}

// ---- Surface pattern (lattice / net / granular) ----
float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float surfacePattern(vec2 suv, float archetype) {
  // suv is in sphere-space [-1, 1]
  if (archetype < 0.5) {
    // A: fine crystalline dots
    vec2 g = floor(suv * 18.0);
    return step(0.65, hash21(g));
  }
  if (archetype < 1.5) {
    // B: copper filament mesh
    vec2 g = fract(suv * 12.0) - 0.5;
    float d = min(abs(g.x), abs(g.y));
    return smoothstep(0.04, 0.0, d) * 0.7;
  }
  if (archetype < 2.5) {
    // C: holographic micro-sparkles
    float h = hash21(floor(suv * 24.0));
    return step(0.8, h) * (0.5 + 0.5 * sin(h * 50.0 + suv.x * 30.0));
  }
  if (archetype < 3.5) {
    // D: coarse granular bumps
    vec2 g = floor(suv * 10.0);
    float h = hash21(g);
    return h * 0.4;
  }
  // E: barely visible fine noise
  return hash21(suv * 20.0) * 0.15;
}

// ---- Stalk rendering ----
float stalk(vec2 uv, vec2 center, float radius) {
  // Stalk extends below the spore
  float stalkWidth = radius * 0.08;
  float stalkLen = radius * 2.2;
  vec2 d = uv - center;

  // Only below the spore
  if (d.y > radius * 0.2) return 0.0;
  if (d.y < -(stalkLen)) return 0.0;

  // Slight curve
  float t = (center.y - uv.y) / stalkLen;
  float curveX = sin(t * 1.8) * radius * 0.15;
  float dx = abs(d.x - curveX);

  // Cylindrical shading: bright center, dark edges
  float inside = smoothstep(stalkWidth, stalkWidth * 0.3, dx);
  float shade = 1.0 - (dx / stalkWidth) * 0.6;
  return inside * shade * (0.3 + 0.4 * t);
}

void main() {
  // Aspect-corrected coords
  vec2 uv = vUv;
  uv.x *= uAspect;

  vec3 color = vec3(0.0); // pure black background

  // === Pass 1: Glow halos (behind everything) ===
  for (int i = 0; i < MAX_SPORES; i++) {
    if (i >= uSporeCount) break;
    vec2 center = uSporePos[i];
    float r = uSporeRadius[i];
    float a = uSporeArchetype[i];
    float dist = length(uv - center);
    float glowR = r * 3.5;
    float glow = smoothstep(glowR, r * 0.5, dist);
    color += archetypeGlow(a) * glow * 0.15;
  }

  // === Pass 2: Stalks ===
  for (int i = 0; i < MAX_SPORES; i++) {
    if (i >= uSporeCount) break;
    vec2 center = uSporePos[i];
    float r = uSporeRadius[i];
    float a = uSporeArchetype[i];
    float s = stalk(uv, center, r);
    vec3 stalkCol = archetypeBody(a, uTime) * 0.35;
    color += stalkCol * s;
  }

  // === Pass 3: Spore bodies (front to back by index) ===
  for (int i = 0; i < MAX_SPORES; i++) {
    if (i >= uSporeCount) break;
    vec2 center = uSporePos[i];
    float r = uSporeRadius[i];
    float a = uSporeArchetype[i];
    vec2 trailOff = uSporeTrailOff[i];
    vec2 delta = uv - center;
    float dist = length(delta);

    if (dist > r) continue;

    // Sphere-space UV
    vec2 suv = delta / r; // -1..1
    float sDist = length(suv);

    // 3D sphere normal
    float z = sqrt(max(0.0, 1.0 - sDist * sDist));
    vec3 normal = vec3(suv, z);

    // Lighting
    vec3 lightDir = normalize(vec3(-0.5, 0.6, 0.8));
    float diff = max(dot(normal, lightDir), 0.0);
    float spec = pow(max(dot(reflect(-lightDir, normal), vec3(0, 0, 1)), 0.0), 48.0);

    // Sample Physarum trail for organic internal texture
    vec2 trailUv = trailOff + suv * 0.12;
    trailUv = fract(trailUv);
    float trail = texture2D(uTrail, trailUv).r;
    float trailIntensity = pow(clamp(trail * 3.5, 0.0, 1.0), 0.7);

    // Base body color
    vec3 body = archetypeBody(a, uTime + float(i));
    vec3 highlight = archetypeHighlight(a);
    vec3 rimCol = archetypeRim(a);

    // Compose color
    vec3 sporeCol = body * (0.3 + 0.5 * diff);
    // Trail modulates brightness
    sporeCol += highlight * trailIntensity * 0.35;
    // Specular
    sporeCol += spec * vec3(1.0, 0.98, 0.95) * 0.6;
    // Surface texture
    float pattern = surfacePattern(suv, a);
    sporeCol *= (0.85 + 0.2 * pattern);
    // Membrane rim (translucent edge)
    float rim = 1.0 - z;
    sporeCol += rimCol * rim * rim * 0.45;

    // Sphere edge alpha
    float alpha = smoothstep(1.0, 0.88, sDist);

    color = mix(color, sporeCol, alpha);
  }

  // === Grain ===
  float grain = (hash21(vUv * vec2(1920.0, 1080.0) + uTime * 11.3) - 0.5) * uGrain;
  color += grain;

  gl_FragColor = vec4(max(color, 0.0), 1.0);
}
