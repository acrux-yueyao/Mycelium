import type * as THREE from 'three';

export type HairCurveParams = {
  enabled: boolean;
  rootCount: number;
  segmentsPerHair: number;
  stepLength: number;
  swayFrequency: number;
  dashLength: number;
  dashWidth: number;
  hairLengthJitter: number;
  curlStrength: number;
  outwardBias: number;
  noiseStrength: number;
  branchProbability: number;
  branchLengthScale: number;
  taperPower: number;
  tipDotProbability: number;
  opacity: number;
  color: string;
};

export type HairRoot = {
  position: THREE.Vector3;
  normal: THREE.Vector3;
  tangent: THREE.Vector3;
  bitangent: THREE.Vector3;
  seed: number;
  length: number;
  curl: number;
  stiffness: number;
};

export type HairDash = {
  start: THREE.Vector3;
  end: THREE.Vector3;
  width: number;
  rootIndex: number;
  phase: number;
  branch: boolean;
};

export type HairGuide = {
  root: HairRoot;
  dashes: HairDash[];
  tip: THREE.Vector3;
};

export type HairCurveResult = {
  guides: HairGuide[];
  roots: HairRoot[];
  tips: THREE.Vector3[];
};

export type VectorParticleParams = {
  enabled: boolean;
  particleCount: number;
  spawnShellInner: number;
  spawnShellOuter: number;
  particleSize: number;
  particleSizeJitter: number;
  opacity: number;
  velocityScale: number;
  damping: number;
  noiseScale: number;
  curlStrength: number;
  outwardDrift: number;
  inwardRecovery: number;
  surfaceAttraction: number;
  swirlStrength: number;
  lifetimeMin: number;
  lifetimeMax: number;
  respawn: boolean;
  color: string;
  bloomFactor: number;
};

export type SurfaceBody = {
  center: THREE.Vector3;
  radius: number;
  color: THREE.Color;
};

export type MotionState = {
  dragging: boolean;
  impulse: number;
  wind: THREE.Vector3;
};
