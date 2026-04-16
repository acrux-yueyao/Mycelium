// Spore display — procedural rendering per archetype.
// Each archetype draws STRUCTURE not a sphere. Bodies are semi-transparent,
// silhouettes are broken, morphology is asymmetric.
//
// A · Radiolaria     — geometric radial skeleton + latitude grid, spikes past rim
// B · Cribraria      — hollow shell with internal hex/honeycomb lattice
// C · Metatrichia    — dense curly filaments radiating outward, dark core
// D · Colloderma     — gel droplet with internal bubbles + refracted highlights
// E · Thamnidium     — irregular lumpy body with asymmetric budding protrusions

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

const float TAU = 6.2831853;

vec3 archetypeBody(float a, float t) {
  if (a < 0.5) return vec3(0.78, 0.82, 0.88);
  if (a < 1.5) return vec3(0.55, 0.3, 0.1);
  if (a < 2.5) return vec3(0.16, 0.08, 0.04);
  if (a < 3.5) return vec3(0.1, 0.35, 0.42);
  float h = fract(t * 0.08);
  return vec3(
    0.5 + 0.4 * sin(h * TAU),
    0.5 + 0.4 * sin(h * TAU + 2.094),
    0.5 + 0.4 * sin(h * TAU + 4.189)
  );
}

vec3 archetypeRim(float a) {
  if (a < 0.5) return vec3(0.95, 0.97, 1.0);
  if (a < 1.5) return vec3(0.88, 0.5, 0.18);
  if (a < 2.5) return vec3(0.78, 0.35, 0.22);
  if (a < 3.5) return vec3(0.5, 0.95, 0.9);
  return vec3(0.85, 0.6, 0.95);
}

vec3 archetypeGlow(float a) {
  if (a < 0.5) return vec3(0.5, 0.55, 0.65);
  if (a < 1.5) return vec3(0.55, 0.3, 0.1);
  if (a < 2.5) return vec3(0.3, 0.1, 0.05);
  if (a < 3.5) return vec3(0.05, 0.4, 0.4);
  return vec3(0.4, 0.25, 0.55);
}

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float hash11(float p) { return hash21(vec2(p, p * 1.7)); }

float angDist(float a, float b) {
  float d = mod(a - b + 3.14159, TAU) - 3.14159;
  return abs(d);
}

float distortedEdge(float angle, float sporeIdx, float archetype) {
  float salt = sporeIdx * 1.37 + archetype * 0.77;
  float a = 1.0;
  a += sin(angle * 3.0 + salt) * 0.06;
  a += sin(angle * 7.0 + salt * 2.0) * 0.035;
  a += sin(angle * 13.0 + salt * 3.0) * 0.02;
  return a;
}

float stalk(vec2 uv, vec2 center, float radius, float stemLen) {
  if (stemLen < 0.01) return 0.0;
  float maxLen = radius * 3.0;
  float currentLen = maxLen * stemLen;
  vec2 d = uv - center;
  if (d.y > -radius * 0.3) return 0.0;
  float yOff = -radius * 0.3 - d.y;
  if (yOff > currentLen) return 0.0;
  float t = yOff / maxLen;
  float curveX = sin(t * 2.3 + center.x * 10.0) * radius * 0.18;
  float dx = abs(d.x - curveX);
  float w = radius * 0.05 * (1.0 - t * 0.4);
  float inside = smoothstep(w, w * 0.15, dx);
  float shade = 1.0 - (dx / w) * 0.5;
  return inside * shade * (0.2 + 0.5 * t);
}

vec4 renderRadiolaria(vec2 suv, float dist, float ang, vec3 body, vec3 rim,
                     float trailI, float crystal, float sporeIdx) {
  vec3 color = vec3(0.0); float alpha = 0.0;
  float spokeAng = ang * 10.0 / TAU;
  float spokeDev = abs(fract(spokeAng + 0.5) - 0.5) * 2.0;
  float spokeLine = smoothstep(0.12, 0.0, spokeDev);
  float spokeLen = smoothstep(1.35, 0.1, dist) * smoothstep(0.0, 0.05, dist);
  float spoke = spokeLine * spokeLen * crystal;
  color += rim * spoke * 1.1;
  alpha = max(alpha, spoke * 0.9);

  float tipMask = smoothstep(1.35, 1.2, dist) * smoothstep(1.1, 1.25, dist);
  color += vec3(1.0) * spokeLine * tipMask * crystal * 0.8;
  alpha = max(alpha, spokeLine * tipMask * crystal);

  float ring = abs(fract(dist * 5.0) - 0.5);
  float ringMask = smoothstep(0.18, 0.08, ring) * smoothstep(1.0, 0.1, dist) * crystal;
  color += rim * ringMask * 0.35;
  alpha = max(alpha, ringMask * 0.45);

  float inner = smoothstep(1.0, 0.0, dist);
  color += body * inner * 0.12;
  alpha += inner * 0.08;
  color += rim * trailI * inner * 0.25;

  for (int k = 0; k < 3; k++) {
    float kf = float(k);
    float spAng = hash21(vec2(sporeIdx + 11.0, kf)) * TAU;
    float spAD = angDist(ang, spAng);
    float spM = smoothstep(0.04, 0.0, spAD);
    float spL = smoothstep(1.5, 0.1, dist) * smoothstep(0.0, 0.05, dist);
    color += vec3(1.0) * spM * spL * crystal * 0.8;
    alpha = max(alpha, spM * spL * crystal * 0.85);
  }
  return vec4(color, min(alpha, 1.0));
}

vec4 renderCribraria(vec2 suv, float dist, float ang, vec3 body, vec3 rim,
                    float trailI, float crystal, float sporeIdx) {
  vec3 color = vec3(0.0); float alpha = 0.0;
  float edgeR = distortedEdge(ang, sporeIdx, 1.0) * 0.98;

  float shell = smoothstep(0.08, 0.01, abs(dist - edgeR)) * crystal;
  color += rim * shell * 1.1;
  alpha = max(alpha, shell * 0.9);

  vec2 hexUv = suv * 5.5;
  vec2 h1 = fract(hexUv) - 0.5;
  vec2 h2 = fract(hexUv + vec2(0.5, 0.5)) - 0.5;
  float cellEdge1 = 0.5 - max(abs(h1.x), abs(h1.y));
  float cellEdge2 = 0.5 - max(abs(h2.x), abs(h2.y));
  float cellEdge = min(cellEdge1, cellEdge2);
  float lattice = smoothstep(0.08, 0.02, cellEdge);

  float interiorMask = smoothstep(edgeR, edgeR * 0.25, dist);
  float latticeVis = lattice * interiorMask * crystal;
  color += body * latticeVis * 0.9;
  color += rim * latticeVis * 0.35;
  alpha = max(alpha, latticeVis * 0.7);

  vec2 cellId = floor(hexUv);
  float beadHash = hash21(cellId);
  vec2 cellCenter = (cellId + 0.5) / 5.5;
  float beadDist = length(suv - cellCenter);
  float bead = smoothstep(0.04, 0.0, beadDist) * step(0.7, beadHash);
  color += vec3(1.0) * bead * interiorMask * crystal * 0.9;
  alpha = max(alpha, bead * interiorMask * crystal);

  color += body * interiorMask * 0.08;
  alpha += interiorMask * 0.1;
  color += rim * trailI * interiorMask * 0.3;
  return vec4(color, min(alpha, 1.0));
}

vec4 renderMetatrichia(vec2 suv, float dist, float ang, vec3 body, vec3 rim,
                      float trailI, float crystal, float sporeIdx, float t) {
  vec3 color = vec3(0.0); float alpha = 0.0;
  float edgeR = distortedEdge(ang, sporeIdx, 2.0) * 0.6;
  float coreMask = smoothstep(edgeR, edgeR * 0.3, dist);
  color += body * coreMask * 0.75;
  alpha = max(alpha, coreMask * 0.9);

  float nHairs = 140.0;
  float hairSeg = ang * nHairs / TAU;
  vec2 hairCell = vec2(floor(hairSeg), 0.0);
  float hairPhase = hash21(hairCell) * TAU;
  float hairCurl = sin(dist * 14.0 + hairPhase + t * 0.35);
  float hairCurlOff = hairCurl * 0.08;
  float hairCenterAng = (floor(hairSeg) + 0.5) / nHairs * TAU;
  float hairAngDev = angDist(ang, hairCenterAng + hairCurlOff);
  float hairThin = smoothstep(0.025, 0.0, hairAngDev);
  float hairStart = edgeR * 0.9;
  float hairEnd = edgeR + 0.6 + hash21(hairCell) * 0.3;
  float hairRange = smoothstep(hairStart, hairStart + 0.04, dist)
                  * smoothstep(hairEnd, hairEnd - 0.08, dist);
  float hairTaper = 1.0 - smoothstep(hairStart, hairEnd, dist) * 0.6;
  float hair = hairThin * hairRange * hairTaper * crystal;
  color += rim * hair * (0.55 + 0.45 * hash21(hairCell)) * 1.1;
  alpha = max(alpha, hair * 0.8);

  for (int k = 0; k < 3; k++) {
    float kf = float(k);
    float spAng = hash21(vec2(sporeIdx + 31.0, kf)) * TAU;
    float spAD = angDist(ang, spAng);
    float spM = smoothstep(0.08, 0.0, spAD);
    float spL = smoothstep(1.4, 0.2, dist) * smoothstep(edgeR * 0.5, edgeR, dist);
    color += rim * spM * spL * crystal * 0.75;
    alpha = max(alpha, spM * spL * crystal * 0.65);
  }

  color += rim * trailI * coreMask * 0.4;
  return vec4(color, min(alpha, 1.0));
}

vec4 renderColloderma(vec2 suv, float dist, float ang, vec3 body, vec3 rim,
                     float trailI, float sporeIdx, float t) {
  vec3 color = vec3(0.0); float alpha = 0.0;
  float teardrop = 1.0 + 0.12 * smoothstep(0.0, 1.0, -sin(ang));
  float edgeR = distortedEdge(ang, sporeIdx, 3.0) * 0.96 * teardrop;

  float bodyMask = smoothstep(edgeR, edgeR * 0.3, dist);
  color += body * bodyMask * 0.42;
  alpha = max(alpha, bodyMask * 0.55);

  float centerMask = smoothstep(0.45, 0.0, dist);
  color += rim * centerMask * 0.3;

  for (int b = 0; b < 6; b++) {
    float bf = float(b);
    float bAng = hash21(vec2(sporeIdx + 41.0, bf)) * TAU
               + t * 0.1 * (0.5 + hash11(bf));
    float bDistC = 0.25 + 0.35 * hash21(vec2(sporeIdx + 42.0, bf));
    bDistC += sin(t * 0.2 + bf * 1.3) * 0.04;
    vec2 bC = vec2(cos(bAng), sin(bAng)) * bDistC;
    float bR = 0.07 + 0.08 * hash21(vec2(sporeIdx + 43.0, bf));
    float bD = length(suv - bC);
    float bRing = smoothstep(bR, bR * 0.9, bD) - smoothstep(bR * 0.88, bR * 0.55, bD);
    color += vec3(0.9, 0.98, 1.0) * bRing * 0.5;
    alpha = max(alpha, bRing * 0.45);
    float bIn = smoothstep(bR * 0.55, 0.0, bD);
    color += body * bIn * 0.2;
  }

  float rimMask = smoothstep(0.06, 0.0, abs(dist - edgeR));
  color += rim * rimMask * 0.7;
  alpha = max(alpha, rimMask * 0.75);

  vec2 glintDir = normalize(vec2(-0.5, 0.6));
  float glintDot = dot(suv / max(dist, 0.01), glintDir);
  float glint = pow(max(glintDot, 0.0), 12.0) * smoothstep(edgeR, edgeR * 0.5, dist);
  color += vec3(1.0) * glint * 0.5;
  color += rim * trailI * bodyMask * 0.25;
  return vec4(color, min(alpha, 1.0));
}

vec4 renderThamnidium(vec2 suv, float dist, float ang, vec3 body, vec3 rim,
                    float trailI, float crystal, float sporeIdx, float t) {
  vec3 color = vec3(0.0); float alpha = 0.0;
  float lumpy = 1.0
    + sin(ang * 5.0 + sporeIdx) * 0.18
    + sin(ang * 9.0 + sporeIdx * 2.0) * 0.1
    + sin(ang * 17.0 + sporeIdx * 3.0) * 0.05;
  float edgeR = lumpy * 0.9;
  float bodyMask = smoothstep(edgeR, edgeR * 0.4, dist);
  color += body * bodyMask * 0.5;
  alpha = max(alpha, bodyMask * 0.75);

  for (int b = 0; b < 4; b++) {
    float bf = float(b);
    float bAng = hash21(vec2(sporeIdx + 61.0, bf)) * TAU + sin(t * 0.25 + bf) * 0.03;
    float bD = 0.85 + 0.35 * hash21(vec2(sporeIdx + 62.0, bf));
    vec2 budC = vec2(cos(bAng), sin(bAng)) * bD;
    float bR = 0.16 + 0.12 * hash21(vec2(sporeIdx + 63.0, bf));
    float d = length(suv - budC);
    float bud = smoothstep(bR, bR * 0.3, d);
    color += body * bud * 0.55;
    color += rim * bud * bud * 0.35;
    alpha = max(alpha, bud * 0.8);

    vec2 stemDir = normalize(budC);
    float alongStem = dot(suv, stemDir);
    vec2 perp = suv - stemDir * alongStem;
    float perpDist = length(perp);
    float stemMask = step(edgeR * 0.6, alongStem) * step(alongStem, bD + bR * 0.3)
                   * smoothstep(0.06, 0.01, perpDist);
    color += body * stemMask * 0.45;
    alpha = max(alpha, stemMask * 0.7);
  }

  color += rim * trailI * bodyMask * 0.4;
  vec2 g = floor(suv * 24.0);
  float speckle = step(0.9, hash21(g)) * bodyMask * crystal * 0.6;
  color += vec3(1.0) * speckle;
  return vec4(color, min(alpha, 1.0));
}

void main() {
  vec2 uv = vUv;
  uv.x *= uAspect;
  vec3 color = vec3(0.0);

  for (int i = 0; i < MAX_SPORES; i++) {
    if (i >= uSporeCount) break;
    float growth = uSporeGrowth[i];
    if (growth < 0.02) continue;
    vec2 c = uSporePos[i];
    float bR = uSporeRadius[i] * growth;
    float a = uSporeArchetype[i];
    float d = length(uv - c);
    float gR = bR * 4.0;
    float g = smoothstep(gR, bR * 0.3, d);
    color += archetypeGlow(a) * g * 0.15;
  }

  for (int i = 0; i < MAX_SPORES; i++) {
    if (i >= uSporeCount) break;
    vec2 c = uSporePos[i];
    float bR = uSporeRadius[i];
    float a = uSporeArchetype[i];
    float sL = uSporeStem[i];
    float s = stalk(uv, c, bR, sL);
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

    vec2 delta = uv - center;
    float envelope = baseR * growth * 1.55;
    if (length(delta) > envelope) continue;

    vec2 suv = delta / (baseR * growth);
    suv.x /= max(scale.x, 0.4);
    suv.y /= max(scale.y, 0.4);
    float dist = length(suv);
    if (dist > 1.5) continue;

    float ang = atan(suv.y, suv.x);

    vec2 trailUv = trailOff + suv * 0.12;
    trailUv = fract(trailUv);
    float trail = texture2D(uTrail, trailUv).r;
    float trailI = pow(clamp(trail * 3.5, 0.0, 1.0), 0.65);

    vec3 body = archetypeBody(a, uTime + float(i));
    vec3 rim = archetypeRim(a);

    vec4 spore;
    if (a < 0.5) {
      spore = renderRadiolaria(suv, dist, ang, body, rim, trailI, crystal, float(i));
    } else if (a < 1.5) {
      spore = renderCribraria(suv, dist, ang, body, rim, trailI, crystal, float(i));
    } else if (a < 2.5) {
      spore = renderMetatrichia(suv, dist, ang, body, rim, trailI, crystal, float(i), uTime);
    } else if (a < 3.5) {
      spore = renderColloderma(suv, dist, ang, body, rim, trailI, float(i), uTime);
    } else {
      spore = renderThamnidium(suv, dist, ang, body, rim, trailI, crystal, float(i), uTime);
    }

    color = mix(color, spore.rgb, spore.a);
  }

  float grain = (hash21(vUv * vec2(1920.0, 1080.0) + uTime * 11.3) - 0.5) * uGrain;
  color += grain;
  gl_FragColor = vec4(max(color, 0.0), 1.0);
}
