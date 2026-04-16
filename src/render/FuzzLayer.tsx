import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { Rng } from '../core/seed';

export interface FuzzParams {
  enabled: boolean;
  fiberCount: number;
  fiberLength: number;
  fiberLengthJitter: number;
  fiberWidth: number;
  shellOffset: number;
  swayAmplitude: number;
  swayFrequency: number;
  tangentNoise: number;
  droop: number;
  clumpiness: number;
  translucency: number;
  opacity: number;
  brightness: number;
}

export interface FuzzBody {
  center: THREE.Vector3;
  radius: number;
  color: THREE.Color;
}

export interface FuzzInteractionState {
  dragging: boolean;
  impulse: number;
  wind: THREE.Vector3;
  pointer?: THREE.Vector3 | null;
}

interface Fiber {
  bodyIndex: number;
  root: THREE.Vector3;
  normal: THREE.Vector3;
  tangent: THREE.Vector3;
  bitangent: THREE.Vector3;
  length: number;
  width: number;
  phase: number;
  freqScale: number;
  swayScale: number;
  tip: THREE.Vector3;
  velocity: THREE.Vector3;
}

interface FuzzLayerProps {
  params: FuzzParams;
  bodies: FuzzBody[];
  seed: number;
  interactionRef: React.MutableRefObject<FuzzInteractionState>;
}

const SEGMENTS_PER_FIBER = 6;
const Y_AXIS = new THREE.Vector3(0, 1, 0);

export function FuzzLayer({ params, bodies, seed, interactionRef }: FuzzLayerProps) {
  const hairRef = useRef<THREE.InstancedMesh>(null);
  const fibers = useMemo(() => buildFibers(params, bodies, seed), [params, bodies, seed]);
  const instanceCount = fibers.length * SEGMENTS_PER_FIBER;

  useEffect(() => {
    const mesh = hairRef.current;
    if (!mesh) return;
    let idx = 0;
    for (let i = 0; i < fibers.length; i++) {
      const body = bodies[fibers[i].bodyIndex];
      const color = body?.color ?? new THREE.Color('#d9c7ac');
      for (let s = 0; s < SEGMENTS_PER_FIBER; s++) {
        mesh.setColorAt(idx, color);
        idx += 1;
      }
    }
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [bodies, fibers]);

  useFrame(({ clock }, delta) => {
    if (!params.enabled) return;
    const mesh = hairRef.current;
    if (!mesh) return;
    const dt = Math.min(0.033, delta);
    const t = clock.elapsedTime;
    const interaction = interactionRef.current;
    const wind = interaction.wind;
    const impulse = interaction.impulse;
    const dummy = new THREE.Object3D();
    let index = 0;

    for (let i = 0; i < fibers.length; i++) {
      const fiber = fibers[i];
      const swayX =
        Math.sin(t * params.swayFrequency * fiber.freqScale + fiber.phase) *
        params.swayAmplitude *
        fiber.swayScale;
      const swayY =
        Math.cos(t * params.swayFrequency * 0.83 * fiber.freqScale + fiber.phase * 0.72) *
        params.swayAmplitude *
        0.75 *
        fiber.swayScale;
      const droopAmount = params.droop * fiber.length;

      const targetTip = fiber.root
        .clone()
        .addScaledVector(fiber.normal, fiber.length - droopAmount)
        .addScaledVector(fiber.tangent, swayX)
        .addScaledVector(fiber.bitangent, swayY);

      const pointer = interaction.pointer;
      if (interaction.dragging && pointer) {
        const toRoot = fiber.root.clone().sub(pointer);
        const dist = toRoot.length();
        if (dist < 3.2) {
          const away = toRoot.normalize();
          const tangentAway = away.sub(fiber.normal.clone().multiplyScalar(away.dot(fiber.normal)));
          if (tangentAway.lengthSq() > 0.0001) {
            tangentAway.normalize();
            const falloff = 1 - dist / 3.2;
            targetTip.addScaledVector(tangentAway, falloff * 0.08 * (0.4 + impulse));
          }
        }
      }

      targetTip.addScaledVector(wind, (0.22 + fiber.swayScale * 0.35) * (0.3 + impulse));

      fiber.velocity.addScaledVector(targetTip.clone().sub(fiber.tip), dt * 34);
      fiber.velocity.multiplyScalar(0.86);
      fiber.tip.addScaledVector(fiber.velocity, dt * 42);

      const control1 = fiber.root
        .clone()
        .addScaledVector(fiber.normal, fiber.length * 0.34)
        .addScaledVector(fiber.tangent, swayX * 0.85)
        .addScaledVector(fiber.bitangent, swayY * 0.85);
      const control2 = fiber.root
        .clone()
        .addScaledVector(fiber.normal, fiber.length * 0.76 - droopAmount * 0.42)
        .addScaledVector(fiber.tangent, swayX * 1.15 + wind.x * 0.08)
        .addScaledVector(fiber.bitangent, swayY * 1.15 + wind.y * 0.08);

      for (let seg = 0; seg < SEGMENTS_PER_FIBER; seg++) {
        const t0 = seg / SEGMENTS_PER_FIBER;
        const t1 = (seg + 1) / SEGMENTS_PER_FIBER;
        const p0 = cubicPoint(fiber.root, control1, control2, fiber.tip, t0);
        const p1 = cubicPoint(fiber.root, control1, control2, fiber.tip, t1);
        const thickness = fiber.width * (1 - seg / (SEGMENTS_PER_FIBER + 1));
        setCylinderTransform(dummy, p0, p1, thickness);
        mesh.setMatrixAt(index, dummy.matrix);
        index += 1;
      }
    }
    mesh.instanceMatrix.needsUpdate = true;
  });

  if (!params.enabled || instanceCount <= 0) return null;

  return (
    <instancedMesh ref={hairRef} args={[undefined, undefined, instanceCount]}>
      <cylinderGeometry args={[1, 1, 1, 6]} />
      <meshPhysicalMaterial
        transparent
        opacity={params.opacity}
        roughness={0.34 + (1 - params.translucency) * 0.5}
        transmission={0.14 + params.translucency * 0.38}
        thickness={0.12}
        clearcoat={0.42}
        clearcoatRoughness={0.3}
        emissive={new THREE.Color(params.brightness, params.brightness, params.brightness)}
        emissiveIntensity={0.06 + params.brightness * 0.18}
        vertexColors
      />
    </instancedMesh>
  );
}

function buildFibers(params: FuzzParams, bodies: FuzzBody[], seed: number): Fiber[] {
  if (!params.enabled || bodies.length === 0) return [];
  const rng = new Rng(seed ^ 0x44a39b91);
  const total = Math.max(0, Math.floor(params.fiberCount));
  const clumpDirs = bodies.map(() => buildClumpDirections(rng));
  const bodyWeights = bodies.map((b) => Math.max(0.0001, b.radius * b.radius));
  const weightSum = bodyWeights.reduce((a, b) => a + b, 0);
  const fibers: Fiber[] = [];

  for (let i = 0; i < total; i++) {
    const bodyIndex = pickWeighted(rng, bodyWeights, weightSum);
    const body = bodies[bodyIndex];
    const dir = sampleSphereDirection(rng);
    const clumpedDir = applyClump(dir, clumpDirs[bodyIndex], params.clumpiness);
    const normal = clumpedDir.normalize();
    const root = body.center.clone().addScaledVector(normal, body.radius + params.shellOffset);

    // Build a stable tangent basis from the root normal.
    const refAxis = Math.abs(normal.y) > 0.85 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
    const tangent = refAxis.clone().cross(normal).normalize();
    const tangentTwist = (rng.next() * 2 - 1) * params.tangentNoise * Math.PI;
    tangent.applyAxisAngle(normal, tangentTwist);
    const bitangent = normal.clone().cross(tangent).normalize();

    const lengthJitter = (rng.next() * 2 - 1) * params.fiberLengthJitter;
    const length = Math.max(0.001, params.fiberLength * (1 + lengthJitter));
    const width = Math.max(0.001, params.fiberWidth * (0.8 + rng.next() * 0.5));
    const phase = rng.next() * Math.PI * 2;
    const freqScale = 0.75 + rng.next() * 0.5;
    const swayScale = 0.75 + rng.next() * 0.45;

    const tip = root.clone().addScaledVector(normal, length);
    fibers.push({
      bodyIndex,
      root,
      normal,
      tangent,
      bitangent,
      length,
      width,
      phase,
      freqScale,
      swayScale,
      tip,
      velocity: new THREE.Vector3(),
    });
  }

  return fibers;
}

function buildClumpDirections(rng: Rng): THREE.Vector3[] {
  const count = 10;
  const dirs: THREE.Vector3[] = [];
  for (let i = 0; i < count; i++) {
    dirs.push(sampleSphereDirection(rng));
  }
  return dirs;
}

function applyClump(dir: THREE.Vector3, clumps: THREE.Vector3[], clumpiness: number): THREE.Vector3 {
  if (clumps.length === 0 || clumpiness <= 0.001) return dir.clone();
  let best = clumps[0];
  let bestDot = -Infinity;
  for (let i = 0; i < clumps.length; i++) {
    const d = dir.dot(clumps[i]);
    if (d > bestDot) {
      bestDot = d;
      best = clumps[i];
    }
  }
  return dir.clone().lerp(best, Math.min(0.85, clumpiness * 0.65));
}

function sampleSphereDirection(rng: Rng): THREE.Vector3 {
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

function cubicPoint(
  p0: THREE.Vector3,
  p1: THREE.Vector3,
  p2: THREE.Vector3,
  p3: THREE.Vector3,
  t: number
): THREE.Vector3 {
  const mt = 1 - t;
  const mt2 = mt * mt;
  const t2 = t * t;
  const p = new THREE.Vector3();
  p.addScaledVector(p0, mt2 * mt);
  p.addScaledVector(p1, 3 * mt2 * t);
  p.addScaledVector(p2, 3 * mt * t2);
  p.addScaledVector(p3, t2 * t);
  return p;
}

function setCylinderTransform(dummy: THREE.Object3D, a: THREE.Vector3, b: THREE.Vector3, width: number): void {
  const dir = b.clone().sub(a);
  const len = Math.max(0.0001, dir.length());
  const mid = a.clone().addScaledVector(dir, 0.5);
  dir.normalize();
  dummy.position.copy(mid);
  dummy.quaternion.setFromUnitVectors(Y_AXIS, dir);
  dummy.scale.set(width, len * 0.5, width);
  dummy.updateMatrix();
}
