import * as THREE from 'three';
import { Rng } from '../core/seed';
import type { HairCurveParams, HairCurveResult, HairDash, HairGuide, HairRoot, SurfaceBody } from './renderTypes';

export function sampleHairCurves(
  bodies: SurfaceBody[],
  params: HairCurveParams,
  seed: number
): HairCurveResult {
  if (!params.enabled || bodies.length === 0 || params.rootCount <= 0) {
    return { guides: [], roots: [], tips: [] };
  }

  const rng = new Rng(seed ^ 0x2f6e2b1d);
  const weights = bodies.map((b) => Math.max(0.001, b.radius * b.radius));
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  const guides: HairGuide[] = [];
  const roots: HairRoot[] = [];
  const tips: THREE.Vector3[] = [];

  for (let i = 0; i < params.rootCount; i++) {
    const bodyIndex = pickWeighted(rng, weights, totalWeight);
    const body = bodies[bodyIndex];
    const root = sampleRoot(rng, body, params);
    const guide = growGuideCurve(rng, root, params, i);
    guides.push(guide);
    roots.push(root);
    tips.push(guide.tip.clone());
  }

  return { guides, roots, tips };
}

function sampleRoot(rng: Rng, body: SurfaceBody, params: HairCurveParams): HairRoot {
  const dir = sampleUnitSphere(rng);
  const pos = body.center.clone().addScaledVector(dir, body.radius);

  // Stable tangent basis from a normal avoids frame-to-frame basis jitter.
  const ref = Math.abs(dir.y) > 0.86 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
  const tangent = ref.clone().cross(dir).normalize();
  const bitangent = dir.clone().cross(tangent).normalize();

  return {
    position: pos,
    normal: dir.clone(),
    tangent,
    bitangent,
    seed: rng.next(),
    length: (1 + (rng.next() * 2 - 1) * params.hairLengthJitter) * params.stepLength * params.segmentsPerHair,
    curl: 0.65 + rng.next() * 0.7,
    stiffness: 0.72 + rng.next() * 0.26,
  };
}

function growGuideCurve(rng: Rng, root: HairRoot, params: HairCurveParams, rootIndex: number): HairGuide {
  const dashes: HairDash[] = [];
  let p = root.position.clone();
  let d = root.normal.clone();
  const segmentCount = Math.max(3, params.segmentsPerHair);
  const branchAt = rng.next() < params.branchProbability
    ? Math.floor((0.35 + rng.next() * 0.45) * segmentCount)
    : -1;

  for (let i = 0; i < segmentCount; i++) {
    const t = i / Math.max(1, segmentCount - 1);
    const curlPhase = root.seed * 12.7 + i * 0.38;
    const curlDir = root.tangent
      .clone()
      .multiplyScalar(Math.sin(curlPhase))
      .addScaledVector(root.bitangent, Math.cos(curlPhase))
      .normalize();

    const noiseDir = lowFreqNoiseDir(root, i, root.seed).multiplyScalar(params.noiseStrength);
    const outward = root.normal.clone().multiplyScalar(params.outwardBias);

    // Growth direction is inertia + outward growth + local curl + low-frequency noise.
    const nextDir = d
      .clone()
      .multiplyScalar(root.stiffness)
      .add(outward)
      .addScaledVector(curlDir, params.curlStrength * root.curl)
      .add(noiseDir);
    nextDir.normalize();

    const step = params.stepLength * (0.9 + 0.2 * rng.next());
    const pn = p.clone().addScaledVector(nextDir, step);
    const dashLen = params.dashLength * (0.88 + rng.next() * 0.35);
    const center = p.clone().lerp(pn, 0.5);
    const halfDir = pn.clone().sub(p).normalize().multiplyScalar(dashLen * 0.5);
    const dashStart = center.clone().sub(halfDir);
    const dashEnd = center.clone().add(halfDir);
    const width = params.dashWidth * Math.pow(1 - t, params.taperPower);

    dashes.push({
      start: dashStart,
      end: dashEnd,
      width: Math.max(0.0012, width),
      rootIndex,
      phase: root.seed * Math.PI * 2 + i * 0.22,
      branch: false,
    });

    if (i === branchAt) {
      const branchSegments = Math.max(2, Math.floor(segmentCount * params.branchLengthScale));
      const branchAxis = root.bitangent.clone().multiplyScalar(rng.next() > 0.5 ? 1 : -1);
      let bp = pn.clone();
      let bd = nextDir.clone().addScaledVector(branchAxis, 0.45).normalize();
      for (let bi = 0; bi < branchSegments; bi++) {
        const bt = bi / Math.max(1, branchSegments - 1);
        bd = bd
          .clone()
          .addScaledVector(root.normal, params.outwardBias * 0.4)
          .addScaledVector(branchAxis, params.curlStrength * 0.4)
          .normalize();
        const bpn = bp.clone().addScaledVector(bd, step * 0.8);
        const bw = params.dashWidth * 0.72 * Math.pow(1 - bt, params.taperPower + 0.2);
        dashes.push({
          start: bp.clone(),
          end: bpn.clone(),
          width: Math.max(0.001, bw),
          rootIndex,
          phase: root.seed * Math.PI * 2 + bi * 0.4 + 0.9,
          branch: true,
        });
        bp = bpn;
      }
    }

    p = pn;
    d = nextDir;
  }

  return {
    root,
    dashes,
    tip: p,
  };
}

function lowFreqNoiseDir(root: HairRoot, step: number, phaseSeed: number): THREE.Vector3 {
  const a = phaseSeed * 17.3 + step * 0.17;
  const b = phaseSeed * 9.1 + step * 0.19;
  const x = Math.sin(a) * 0.55 + Math.sin(a * 0.47) * 0.45;
  const y = Math.cos(b) * 0.6 + Math.cos(b * 0.41) * 0.4;
  return root.tangent.clone().multiplyScalar(x).addScaledVector(root.bitangent, y).normalize();
}

function sampleUnitSphere(rng: Rng): THREE.Vector3 {
  const z = rng.range(-1, 1);
  const theta = rng.range(0, Math.PI * 2);
  const r = Math.sqrt(Math.max(0, 1 - z * z));
  return new THREE.Vector3(r * Math.cos(theta), z, r * Math.sin(theta));
}

function pickWeighted(rng: Rng, weights: number[], totalWeight: number): number {
  let x = rng.next() * totalWeight;
  for (let i = 0; i < weights.length; i++) {
    x -= weights[i];
    if (x <= 0) return i;
  }
  return weights.length - 1;
}
