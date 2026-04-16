import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { sampleHairCurves } from './hairCurveSampling';
import type { HairCurveParams, HairRoot, MotionState, SurfaceBody } from './renderTypes';

interface HairCurveLayerProps {
  params: HairCurveParams;
  bodies: SurfaceBody[];
  seed: number;
  motionRef: React.MutableRefObject<MotionState>;
  onSampled?: (roots: HairRoot[], tips: THREE.Vector3[]) => void;
}

const Y_AXIS = new THREE.Vector3(0, 1, 0);

export function HairCurveLayer({ params, bodies, seed, motionRef, onSampled }: HairCurveLayerProps) {
  const hairRef = useRef<THREE.InstancedMesh>(null);
  const tipRef = useRef<THREE.InstancedMesh>(null);
  const sampled = useMemo(() => sampleHairCurves(bodies, params, seed), [bodies, params, seed]);
  const dashes = useMemo(() => sampled.guides.flatMap((g) => g.dashes), [sampled.guides]);
  const tipCount = useMemo(
    () => sampled.guides.filter((_, i) => ((i * 9301 + 49297 + Math.floor(seed)) % 1000) / 1000 < params.tipDotProbability).length,
    [params.tipDotProbability, sampled.guides, seed]
  );

  useEffect(() => {
    onSampled?.(sampled.roots, sampled.tips);
  }, [onSampled, sampled.roots, sampled.tips]);

  useEffect(() => {
    const mesh = hairRef.current;
    if (!mesh) return;
    const tint = new THREE.Color(params.color);
    for (let i = 0; i < dashes.length; i++) {
      mesh.setColorAt(i, tint);
    }
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [dashes.length, params.color]);

  useFrame(({ clock }, delta) => {
    const mesh = hairRef.current;
    if (!mesh || !params.enabled) return;
    const dt = Math.min(0.033, delta);
    const t = clock.elapsedTime;
    const motion = motionRef.current;
    const dummy = new THREE.Object3D();

    for (let i = 0; i < dashes.length; i++) {
      const dash = dashes[i];
      const root = sampled.roots[dash.rootIndex];
      const start = dash.start.clone();
      const end = dash.end.clone();
      const w = motion.wind;
      const flow = (0.04 + motion.impulse * 0.35) * (dash.branch ? 1.2 : 1);
      const sway =
        Math.sin(t * params.swayFrequency * 0.9 + dash.phase) * params.noiseStrength +
        Math.cos(t * params.swayFrequency * 0.61 + dash.phase * 0.77) * params.curlStrength * 0.6;

      const tangentShift = root.tangent.clone().multiplyScalar(sway * 0.05 + w.x * flow * 0.03);
      const bitangentShift = root.bitangent.clone().multiplyScalar(sway * 0.04 + w.y * flow * 0.03);
      const outwardShift = root.normal.clone().multiplyScalar(w.z * flow * 0.02);

      // Roots remain attached: attenuate motion near the base and allow more near tips.
      const tipBias = Math.min(1, dash.width / Math.max(0.001, params.dashWidth));
      const move = tangentShift.add(bitangentShift).add(outwardShift).multiplyScalar(1 - tipBias + 0.12);

      start.addScaledVector(move, 0.45);
      end.add(move);
      setCapsuleTransform(dummy, start, end, dash.width);
      mesh.setMatrixAt(i, dummy.matrix);
    }

    mesh.instanceMatrix.needsUpdate = true;
    motion.impulse = Math.max(0, motion.impulse - dt * 0.74);
  });

  if (!params.enabled || dashes.length === 0) return null;

  return (
    <group>
      <instancedMesh ref={hairRef} args={[undefined, undefined, dashes.length]}>
        <cylinderGeometry args={[1, 1, 1, 6]} />
        <meshPhysicalMaterial
          transparent
          opacity={params.opacity}
          roughness={0.34}
          transmission={0.24}
          thickness={0.08}
          clearcoat={0.18}
          clearcoatRoughness={0.38}
          emissive={new THREE.Color(params.color)}
          emissiveIntensity={0.04}
          vertexColors
        />
      </instancedMesh>
      <HairTipDots
        refObj={tipRef}
        guides={sampled.guides}
        color={params.color}
        count={tipCount}
        probability={params.tipDotProbability}
      />
    </group>
  );
}

function HairTipDots({
  refObj,
  guides,
  color,
  count,
  probability,
}: {
  refObj: React.RefObject<THREE.InstancedMesh>;
  guides: Array<{ tip: THREE.Vector3 }>;
  color: string;
  count: number;
  probability: number;
}) {
  useEffect(() => {
    const mesh = refObj.current;
    if (!mesh) return;
    const tint = new THREE.Color(color);
    const dummy = new THREE.Object3D();
    let idx = 0;
    for (let i = 0; i < guides.length; i++) {
      const pick = ((i * 9301 + 49297) % 1000) / 1000;
      if (pick >= probability) continue;
      dummy.position.copy(guides[i].tip);
      dummy.scale.setScalar(0.011 + ((i * 17) % 7) * 0.0015);
      dummy.updateMatrix();
      mesh.setMatrixAt(idx, dummy.matrix);
      mesh.setColorAt(idx, tint);
      idx += 1;
      if (idx >= count) break;
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [color, count, guides, probability, refObj]);

  if (count <= 0) return null;

  return (
    <instancedMesh ref={refObj} args={[undefined, undefined, count]}>
      <sphereGeometry args={[1, 8, 8]} />
      <meshStandardMaterial transparent opacity={0.5} emissive={new THREE.Color(color)} emissiveIntensity={0.18} vertexColors />
    </instancedMesh>
  );
}

function setCapsuleTransform(dummy: THREE.Object3D, a: THREE.Vector3, b: THREE.Vector3, width: number): void {
  const dir = b.clone().sub(a);
  const len = Math.max(0.0001, dir.length());
  const mid = a.clone().addScaledVector(dir, 0.5);
  dir.normalize();
  dummy.position.copy(mid);
  dummy.quaternion.setFromUnitVectors(Y_AXIS, dir);
  dummy.scale.set(width, len * 0.5, width);
  dummy.updateMatrix();
}
