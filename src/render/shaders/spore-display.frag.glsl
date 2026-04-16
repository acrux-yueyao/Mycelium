// Spore display — volumetric, macro-photography grade.
// Layer stack (inside-out):
//   core gel (translucent, wet, bright)  ── growth
//   trail pulse modulation
//   transition
//   mineralized shell (fiber-net + micro-crystals)  ── crystal
//   velvet fluff rim                                ── crystal
//   specular dew
//   cool rim light / sub-surface back-lit

precision highp float;

varying vec2 vUv;

uniform sampler2D uTrail;
uniform float uTime;
uniform float uAspect;

const int MAX_SPORES = 12;
uniform int   uSporeCount;
uniform vec2  uSporePos[MAX_SPORES];
uniform float uSporeRadius[MAX_SPORES];
uniform vec2  uSporeScale[MAX_SPORES];
uniform float uSporeGrowth[MAX_SPORES];
uniform float uSporeCrystal[MAX_SPORES];
uniform float uSporeStem[MAX_SPORES];
uniform float uSporeArchetype[MAX_SPORES];
uniform vec2  uSporeTrailOff[MAX_SPORES];

uniform float uGrain;

vec3 archetypeBody(float a, float t) {
  if (a < 0.5) return vec3(0.72, 0.72, 0.74);
  if (a < 1.5) return vec3(0.55, 0.3, 0.1);
  if (a < 2.5) {
    float h = fract(t * 0.12);
    float r = 0.55 + 0.42 * sin(h * 6.2832);
    float g = 0.55 + 0.42 * sin(h * 6.2832 + 2.094);
    float b = 0.55 + 0.42 * sin(h * 6.2832 + 4.189);
    return vec3(r, g, b);
  }
  if (a < 3.5) return vec3(0.08, 0.68, 0.66);
  return vec3(0.05, 0.05, 0.08);
}

vec3 archetypeHighlight(float a) {
  if (a < 0.5) return vec3(0.95, 0.96, 1.0);
  if (a < 1.5) return vec3(0.95, 0.62, 0.25);
  if (a < 2.5) return vec3(1.0, 1.0, 1.0);
  if (a < 3.5) return vec3(0.5, 1.0, 0.95);
  return vec3(0.45, 0.7, 0.6);
}

vec3 archetypeRim(float a) {
  if (a < 0.5) return vec3(0.85, 0.88, 0.95);
  if (a < 1.5) return vec3(0.58, 0.3, 0.1);
  if (a < 2.5) return vec3(0.6, 0.4, 0.9);
  if (a < 3.5) return vec3(0.08, 0.55, 0.5);
  return vec3(0.2, 0.45, 0.35);
}

vec3 archetypeGlow(float a) {
  if (a < 0.5) return vec3(0.55, 0.6, 0.7);
  if (a < 1.5) return vec3(0.55, 0.3, 0.1);
  if (a < 2.5) return vec3(0.45, 0.35, 0.7);
  if (a < 3.5) return vec3(0.05, 0.5, 0.48);
  return vec3(0.15, 0.35, 0.25);
}

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float fiberNet(vec2 suv, float a) {
  float salt = a * 1.7;
  vec2 warped = suv + vec2(
    sin(suv.y * 7.0 + salt) + sin(suv.x * 13.0) * 0.5,
    cos(suv.x * 7.0 + salt * 1.3) + cos(suv.y * 13.0) * 0.5
  ) * 0.035;
  vec2 g = fract(warped * 16.0) - 0.5;
  float dx = abs(g.x), dy = abs(g.y);
  float lineThickness = 0.07 + 0.03 * hash21(floor(warped * 16.0));
  float net = smoothstep(lineThickness, 0.0, dx) + smoothstep(lineThickness, 0.0, dy);
  return clamp(net, 0.0, 1.0);
}

float microCrystal(vec2 suv, float sDist) {
  vec2 g = floor(suv * 38.0);
  float h = hash21(g);
  float threshold = 0.92 - sDist * 0.12;
  float c = step(threshold, h);
  vec2 local = fract(suv * 38.0) - 0.5;
  float d = length(local);
  float dot = smoothstep(0.25, 0.05, d);
  return c * dot;
}

float velvet(vec2 suv, float t) {
  float angle = atan(suv.y, suv.x);
  float r = length(suv);
  float strand = sin(angle * 42.0 + r * 40.0 + t * 0.5);
  float n = hash21(vec2(angle * 6.0, r * 20.0));
  return smoothstep(0.0, 1.0, strand * 0.5 + 0.5) * n * 0.8;
}

float stalk(vec2 uv, vec2 center, float radius, float stemLen) {
  if (stemLen < 0.01) return 0.0;
  float stalkWidth = radius * 0.07;
  float maxLen = radius * 2.8;
  float currentLen = maxLen * stemLen;

  vec2 d = uv - center;
  if (d.y > -radius * 0.2) return 0.0;
  float yOff = -radius * 0.2 - d.y;
  if (yOff > currentLen) return 0.0;

  float t = yOff / maxLen;
  float curveX = sin(t * 2.3 + center.x * 10.0) * radius * 0.14;
  float dx = abs(d.x - curveX);

  float w = stalkWidth * (1.0 - t * 0.3);
  float inside = smoothstep(w, w * 0.2, dx);
  float shade = 1.0 - (dx / w) * 0.55;
  return inside * shade * (0.25 + 0.55 * t);
}

void main() {
  vec2 uv = vUv;
  uv.x *= uAspect;

  vec3 color = vec3(0.0);

  for (int i = 0; i < MAX_SPORES; i++) {
    if (i >= uSporeCount) break;
    float growth = uSporeGrowth[i];
    if (growth < 0.02) continue;
    vec2 center = uSporePos[i];
    float baseR = uSporeRadius[i] * growth;
    float a = uSporeArchetype[i];
    float dist = length(uv - center);
    float glowR = baseR * 4.0;
    float g = smoothstep(glowR, baseR * 0.3, dist);
    color += archetypeGlow(a) * g * 0.18;
  }

  for (int i = 0; i < MAX_SPORES; i++) {
    if (i >= uSporeCount) break;
    vec2 center = uSporePos[i];
    float baseR = uSporeRadius[i];
    float a = uSporeArchetype[i];
    float stemLen = uSporeStem[i];
    float s = stalk(uv, center, baseR, stemLen);
    vec3 stalkCol = archetypeBody(a, uTime) * 0.45;
    color += stalkCol * s;
  }

  for (int i = 0; i < MAX_SPORES; i++) {
    if (i >= uSporeCount) break;
    float growth = uSporeGrowth[i];
    if (growth < 0.02) continue;

    vec2 center = uSporePos[i];
    float baseR = uSporeRadius[i];
    vec2 scale = uSporeScale[i];
    float crystal = uSporeCrystal[i];
    float a = uSporeArchetype[i];
    vec2 trailOff = uSporeTrailOff[i];

    float r = baseR * growth;
    vec2 delta = uv - center;
    vec2 suv = delta / r;
    suv.x /= max(scale.x, 0.4);
    suv.y /= max(scale.y, 0.4);
    float sDist = length(suv);

    if (sDist > 1.08) continue;

    float z = sqrt(max(0.0, 1.0 - sDist * sDist));
    vec3 normal = vec3(suv, z);

    vec3 lightDir = normalize(vec3(-0.4, 0.55, 0.9));
    float diff = max(dot(normal, lightDir), 0.0);
    vec3 halfway = normalize(lightDir + vec3(0.0, 0.0, 1.0));
    float spec = pow(max(dot(normal, halfway), 0.0), 90.0);
    float specBroad = pow(max(dot(normal, halfway), 0.0), 14.0);

    vec2 trailUv = trailOff + suv * 0.14;
    trailUv = fract(trailUv);
    float trail = texture2D(uTrail, trailUv).r;
    float trailI = pow(clamp(trail * 3.5, 0.0, 1.0), 0.65);

    vec3 body = archetypeBody(a, uTime + float(i));
    vec3 highlight = archetypeHighlight(a);
    vec3 rimCol = archetypeRim(a);

    float coreMask = smoothstep(0.7, 0.0, sDist);
    vec3 gel = body * 1.25 + highlight * 0.35;
    vec3 sporeCol = body * (0.18 + 0.42 * diff);
    sporeCol = mix(sporeCol, gel, coreMask * 0.6);

    sporeCol += highlight * trailI * 0.32 * (1.0 - sDist * 0.6);

    float shellMask = smoothstep(0.5, 0.95, sDist) * crystal;
    float net = fiberNet(suv, a);
    float crystals = microCrystal(suv, sDist);
    sporeCol *= 1.0 - net * shellMask * 0.18;
    sporeCol += rimCol * net * shellMask * 0.55;
    sporeCol += vec3(0.82, 0.9, 1.0) * crystals * shellMask * 0.65;

    float velvetMask = smoothstep(0.82, 1.05, sDist) * crystal;
    float vel = velvet(suv, uTime + float(i));
    sporeCol += body * vel * velvetMask * 0.28;

    sporeCol += spec * vec3(1.0, 1.0, 0.98) * 0.9;
    sporeCol += specBroad * vec3(1.0, 1.0, 0.98) * 0.12;

    float rim = 1.0 - z;
    vec3 coolRim = vec3(0.6, 0.78, 1.0);
    sporeCol += coolRim * rim * rim * 0.4;
    sporeCol += rimCol * rim * 0.18;
    float backLight = smoothstep(0.3, 0.95, z) * coreMask;
    sporeCol += body * backLight * 0.1;

    float alpha = smoothstep(1.05, 0.88, sDist);
    color = mix(color, sporeCol, alpha);
  }

  float grain = (hash21(vUv * vec2(1920.0, 1080.0) + uTime * 11.3) - 0.5) * uGrain;
  color += grain;

  gl_FragColor = vec4(max(color, 0.0), 1.0);
}
