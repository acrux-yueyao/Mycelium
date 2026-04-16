import * as THREE from 'three';
import type { SurfaceBody, VectorParticleParams } from './renderTypes';

interface FieldSampleInput {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  time: number;
  body: SurfaceBody;
  params: VectorParticleParams;
  tangentHint: THREE.Vector3;
}

export function sampleVectorField(input: FieldSampleInput): THREE.Vector3 {
  const { position, velocity, time, body, params, tangentHint } = input;
  const toCenter = body.center.clone().sub(position);
  const dist = Math.max(0.0001, toCenter.length());
  const radial = position.clone().sub(body.center).normalize();
  const radialDist = dist - body.radius;

  // Pull particles toward the target shell distance near the organism surface.
  const shellMid = (params.spawnShellInner + params.spawnShellOuter) * 0.5;
  const shellError = radialDist - shellMid;
  const surfaceAttract = radial.clone().multiplyScalar(-shellError * params.surfaceAttraction);
  const inwardRecovery = toCenter.normalize().multiplyScalar(params.inwardRecovery * Math.max(0, radialDist));
  const outwardDrift = radial.clone().multiplyScalar(params.outwardDrift);

  // Approximate local curl/noise by mixing slow trigonometric bands in body-local coords.
  const lx = (position.x - body.center.x) * params.noiseScale;
  const ly = (position.y - body.center.y) * params.noiseScale;
  const lz = (position.z - body.center.z) * params.noiseScale;
  const nx = Math.sin(ly + time * 0.23) - Math.cos(lz * 0.7 - time * 0.19);
  const ny = Math.sin(lz + time * 0.21) - Math.cos(lx * 0.68 - time * 0.17);
  const nz = Math.sin(lx + time * 0.25) - Math.cos(ly * 0.73 - time * 0.2);
  const curlLike = new THREE.Vector3(nx, ny, nz).normalize().multiplyScalar(params.curlStrength);

  const tangent = tangentHint.lengthSq() > 0.0001
    ? tangentHint.clone().normalize()
    : new THREE.Vector3(-radial.z, 0, radial.x).normalize();
  const swirl = tangent.clone().multiplyScalar(params.swirlStrength);

  const damping = velocity.clone().multiplyScalar(-params.damping);

  return surfaceAttract
    .add(inwardRecovery)
    .add(outwardDrift)
    .add(curlLike)
    .add(swirl)
    .add(damping);
}
