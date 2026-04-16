import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { Rng } from '../core/seed';
import { sampleVectorField } from './vectorField';
import type { HairRoot, MotionState, SurfaceBody, VectorParticleParams } from './renderTypes';

interface VectorParticleLayerProps {
  params: VectorParticleParams;
  bodies: SurfaceBody[];
  hairRoots: HairRoot[];
  hairTips: THREE.Vector3[];
  seed: number;
  motionRef: React.MutableRefObject<MotionState>;
}

interface Particle {
  bodyIndex: number;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  life: number;
  ttl: number;
  tangentHint: THREE.Vector3;
  rootBias: number;
}

export function VectorParticleLayer({
  params,
  bodies,
  hairRoots,
  hairTips,
  seed,
  motionRef,
}: VectorParticleLayerProps) {
  const pointsRef = useRef<THREE.Points>(null);
  const cloud = useMemo(() => buildParticleCloud(params, bodies, hairRoots, hairTips, seed), [
    params,
    bodies,
    hairRoots,
    hairTips,
    seed,
  ]);

  useFrame(({ clock }, delta) => {
    if (!params.enabled || bodies.length === 0) return;
    const dt = Math.min(0.033, delta);
    const t = clock.elapsedTime;
    const wind = motionRef.current.wind;

    for (let i = 0; i < cloud.particles.length; i++) {
      const p = cloud.particles[i];
      const body = bodies[p.bodyIndex];
      const force = sampleVectorField({
        position: p.pos,
        velocity: p.vel,
        time: t + p.rootBias * 1.7,
        body,
        params,
        tangentHint: p.tangentHint,
      })
        .multiplyScalar(params.velocityScale)
        .addScaledVector(wind, 0.08 + p.rootBias * 0.12);

      p.vel.addScaledVector(force, dt * 60);
      p.vel.multiplyScalar(1 - Math.min(0.85, params.damping * dt * 40));
      p.pos.addScaledVector(p.vel, dt * 60);

      p.life += dt;
      const radial = p.pos.clone().sub(body.center);
      const r = radial.length();
      const shellMin = body.radius + params.spawnShellInner;
      const shellMax = body.radius + params.spawnShellOuter;
      if (r < shellMin * 0.8 || r > shellMax * 1.35 || p.life > p.ttl) {
        if (params.respawn) {
          respawnParticle(p, body, params, i + seed * 0.001);
        }
      }

      const idx = i * 3;
      cloud.positions[idx] = p.pos.x;
      cloud.positions[idx + 1] = p.pos.y;
      cloud.positions[idx + 2] = p.pos.z;
      const fade = Math.max(0.08, 1 - p.life / p.ttl);
      cloud.colors[idx] = cloud.baseColors[idx] * fade;
      cloud.colors[idx + 1] = cloud.baseColors[idx + 1] * fade;
      cloud.colors[idx + 2] = cloud.baseColors[idx + 2] * fade;
    }

    const geom = pointsRef.current?.geometry;
    if (!geom) return;
    const pos = geom.getAttribute('position') as THREE.BufferAttribute;
    const col = geom.getAttribute('color') as THREE.BufferAttribute;
    pos.needsUpdate = true;
    col.needsUpdate = true;
  });

  if (!params.enabled || cloud.particles.length === 0) return null;

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[cloud.positions, 3]} />
        <bufferAttribute attach="attributes-color" args={[cloud.colors, 3]} />
      </bufferGeometry>
      <pointsMaterial
        size={params.particleSize}
        sizeAttenuation
        transparent
        opacity={params.opacity}
        depthWrite={false}
        vertexColors
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}

function buildParticleCloud(
  params: VectorParticleParams,
  bodies: SurfaceBody[],
  hairRoots: HairRoot[],
  hairTips: THREE.Vector3[],
  seed: number
): {
  particles: Particle[];
  positions: Float32Array;
  colors: Float32Array;
  baseColors: Float32Array;
} {
  if (!params.enabled || bodies.length === 0 || params.particleCount <= 0) {
    return {
      particles: [],
      positions: new Float32Array(),
      colors: new Float32Array(),
      baseColors: new Float32Array(),
    };
  }

  const rng = new Rng(seed ^ 0x77d913f1);
  const particles: Particle[] = [];
  const weights = bodies.map((b) => Math.max(0.001, b.radius * b.radius));
  const sumWeight = weights.reduce((a, b) => a + b, 0);
  const tint = new THREE.Color(params.color);

  for (let i = 0; i < params.particleCount; i++) {
    const bodyIndex = pickWeighted(rng, weights, sumWeight);
    const body = bodies[bodyIndex];
    const p = spawnParticle(rng, body, params, hairRoots, hairTips);
    particles.push({
      ...p,
      bodyIndex,
    });
  }

  const positions = new Float32Array(particles.length * 3);
  const colors = new Float32Array(particles.length * 3);
  const baseColors = new Float32Array(particles.length * 3);
  for (let i = 0; i < particles.length; i++) {
    const p = particles[i];
    const idx = i * 3;
    positions[idx] = p.pos.x;
    positions[idx + 1] = p.pos.y;
    positions[idx + 2] = p.pos.z;
    const bodyCol = bodies[p.bodyIndex].color;
    const c = bodyCol.clone().lerp(tint, 0.45 + p.rootBias * 0.35);
    baseColors[idx] = c.r * (0.65 + params.bloomFactor * 0.28);
    baseColors[idx + 1] = c.g * (0.65 + params.bloomFactor * 0.28);
    baseColors[idx + 2] = c.b * (0.65 + params.bloomFactor * 0.28);
    colors[idx] = baseColors[idx];
    colors[idx + 1] = baseColors[idx + 1];
    colors[idx + 2] = baseColors[idx + 2];
  }

  return { particles, positions, colors, baseColors };
}

function spawnParticle(
  rng: Rng,
  body: SurfaceBody,
  params: VectorParticleParams,
  hairRoots: HairRoot[],
  hairTips: THREE.Vector3[]
): Omit<Particle, 'bodyIndex'> {
  const useHairBias = hairRoots.length > 0 && rng.next() < 0.42;
  let radialDir: THREE.Vector3;
  let tangentHint: THREE.Vector3;
  let rootBias = 0;
  if (useHairBias) {
    const hi = Math.floor(rng.next() * hairRoots.length) % hairRoots.length;
    const hr = hairRoots[hi];
    radialDir = hr.normal.clone();
    tangentHint = hr.tangent.clone();
    rootBias = 0.8;
  } else {
    radialDir = sampleUnitSphere(rng);
    tangentHint = new THREE.Vector3(-radialDir.z, 0, radialDir.x).normalize();
    rootBias = 0.2;
  }

  const shell = body.radius + rng.range(params.spawnShellInner, params.spawnShellOuter);
  const pos = body.center.clone().addScaledVector(radialDir, shell);
  if (hairTips.length > 0 && rng.next() < 0.22) {
    const ti = Math.floor(rng.next() * hairTips.length) % hairTips.length;
    pos.lerp(hairTips[ti], 0.34);
    rootBias = 1;
  }

  const vel = tangentHint.clone().multiplyScalar((rng.next() * 2 - 1) * params.velocityScale * 0.03);
  return {
    pos,
    vel,
    life: rng.range(0, params.lifetimeMax * 0.35),
    ttl: rng.range(params.lifetimeMin, params.lifetimeMax),
    tangentHint,
    rootBias,
  };
}

function respawnParticle(
  p: Particle,
  body: SurfaceBody,
  params: VectorParticleParams,
  seedJitter: number
) {
  const rng = new Rng(((seedJitter * 9973) | 0) ^ 0x12af07d3);
  const dir = sampleUnitSphere(rng);
  const shell = body.radius + rng.range(params.spawnShellInner, params.spawnShellOuter);
  p.pos.copy(body.center).addScaledVector(dir, shell);
  p.vel.set((rng.next() * 2 - 1) * 0.004, (rng.next() * 2 - 1) * 0.004, (rng.next() * 2 - 1) * 0.004);
  p.life = 0;
  p.ttl = rng.range(params.lifetimeMin, params.lifetimeMax);
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
