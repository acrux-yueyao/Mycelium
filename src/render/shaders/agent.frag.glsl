// Agent update pass.
// Each texel of the agent texture encodes one agent:
//   rg = position in normalized [0,1] simulation space
//   b  = heading (radians / TAU)
//   a  = lifetime / reserved
//
// Algorithm (Physarum agent model, cf. Jeff Jones 2010):
//   1. sample trail strength at three points ahead (left / center / right)
//   2. steer toward the strongest, with small random jitter
//   3. step forward by stepSize

precision highp float;

varying vec2 vUv;

uniform sampler2D uAgents;    // previous agent state
uniform sampler2D uTrail;     // current deposited trail
uniform vec2  uSimSize;       // trail texture size in pixels
uniform float uTime;
uniform float uDt;

uniform float uSenseAngle;
uniform float uSenseDistance;  // in trail pixels
uniform float uTurnAngle;
uniform float uStepSize;       // in trail pixels
uniform float uPulse;          // 0..1 breathing modulation

const float TAU = 6.28318530718;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float sampleTrail(vec2 p, float heading) {
  // p in [0,1] sim space; convert sense offset from pixels to normalized.
  vec2 d = vec2(cos(heading), sin(heading)) * (uSenseDistance / uSimSize);
  vec2 q = p + d;
  // wrap
  q = fract(q);
  return texture2D(uTrail, q).r;
}

void main() {
  vec4 agent = texture2D(uAgents, vUv);
  vec2 pos = agent.rg;
  float heading = agent.b * TAU;

  float fL = sampleTrail(pos, heading + uSenseAngle);
  float fC = sampleTrail(pos, heading);
  float fR = sampleTrail(pos, heading - uSenseAngle);

  float rnd = hash(vUv + uTime);
  float turn = uTurnAngle * (0.8 + 0.6 * uPulse);

  if (fC > fL && fC > fR) {
    // keep heading
  } else if (fC < fL && fC < fR) {
    // random turn
    heading += (rnd - 0.5) * 2.0 * turn;
  } else if (fR > fL) {
    heading -= turn * (0.6 + 0.4 * rnd);
  } else if (fL > fR) {
    heading += turn * (0.6 + 0.4 * rnd);
  }

  // step forward
  float step = uStepSize * (0.9 + 0.3 * uPulse) / uSimSize.x;
  vec2 newPos = pos + vec2(cos(heading), sin(heading)) * step;
  // wrap torus
  newPos = fract(newPos + 1.0);

  gl_FragColor = vec4(newPos, fract(heading / TAU), agent.a);
}
