import { OrbitControls } from '@react-three/drei';
import { Canvas, useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import type { ResolvedOrganismSpec } from '../core/species';
import { Rng } from '../core/seed';
import { HairCurveLayer } from './HairCurveLayer';
import { VectorParticleLayer } from './VectorParticleLayer';
import type {
  HairCurveParams,
  HairRoot,
  MotionState,
  SurfaceBody,
  VectorParticleParams,
} from './renderTypes';

interface SporeFieldProps {
  spec: ResolvedOrganismSpec;
  seed: number;
}

interface BodyModel {
  coreRadius: number;
  coreColor: THREE.Color;
  bodies: SurfaceBody[];
}

export function SporeField({ spec, seed }: SporeFieldProps) {
  return (
    <div className="spore-field">
      <Canvas camera={{ position: [0, 0.5, 8.8], fov: 44 }} dpr={[1, 2]} gl={{ antialias: true, alpha: true }}>
        <color attach="background" args={['#f4ede0']} />
        <fog attach="fog" args={['#f4ede0', 8, 16]} />
        <ambientLight intensity={0.36} />
        <directionalLight position={[2.5, 3.2, 4]} intensity={0.82} color="#fff3e3" />
        <pointLight position={[-3, 2, 2]} intensity={0.52} color="#d6f0ee" />
        <pointLight position={[3, -1.6, 2]} intensity={0.48} color="#f3ddd0" />
        <OrganismSurface spec={spec} seed={seed} />
      </Canvas>
    </div>
  );
}

function OrganismSurface({ spec, seed }: SporeFieldProps) {
  const groupRef = useRef<THREE.Group>(null);
  const [dragging, setDragging] = useState(false);
  const [hairRoots, setHairRoots] = useState<HairRoot[]>([]);
  const [hairTips, setHairTips] = useState<THREE.Vector3[]>([]);
  const orbitStateRef = useRef({ azimuth: 0, polar: Math.PI / 2 });
  const motionRef = useRef<MotionState>({
    dragging: false,
    impulse: 0,
    wind: new THREE.Vector3(),
  });
  const model = useMemo(() => createBodyModel(spec, seed), [seed, spec]);
  const hairParams = useMemo(() => deriveHairParams(spec), [spec]);
  const vectorParams = useMemo(() => deriveVectorParams(spec), [spec]);

  useFrame((state, delta) => {
    const dt = Math.min(0.033, delta);
    motionRef.current.impulse = Math.max(0, motionRef.current.impulse - dt * 0.8);
    motionRef.current.wind.multiplyScalar(0.92);
    if (groupRef.current) {
      groupRef.current.rotation.z = Math.sin(state.clock.elapsedTime * 0.18) * (0.02 + spec.asymmetry * 0.04);
    }
  });

  return (
    <group ref={groupRef}>
      <mesh>
        <sphereGeometry args={[model.coreRadius, 32, 32]} />
        <meshPhysicalMaterial
          color={model.coreColor}
          transparent
          opacity={0.2 + spec.wetness * 0.24}
          roughness={0.22 + spec.grain * 0.56}
          transmission={0.24 + spec.translucency * 0.32}
          thickness={0.6}
          clearcoat={0.38}
          clearcoatRoughness={0.35}
        />
      </mesh>

      {model.bodies.map((body, idx) => (
        <mesh key={idx} position={body.center}>
          <sphereGeometry args={[body.radius * 0.18, 20, 20]} />
          <meshStandardMaterial
            color={body.color}
            emissive={body.color}
            emissiveIntensity={0.08 + spec.glow * 0.22}
            transparent
            opacity={0.14 + spec.translucency * 0.22}
            roughness={0.35}
          />
        </mesh>
      ))}

      <HairCurveLayer
        params={hairParams}
        bodies={model.bodies}
        seed={seed}
        motionRef={motionRef}
        onSampled={(roots, tips) => {
          setHairRoots(roots);
          setHairTips(tips);
        }}
      />

      <VectorParticleLayer
        params={vectorParams}
        bodies={model.bodies}
        hairRoots={hairRoots}
        hairTips={hairTips}
        seed={seed ^ 0x0ab15f3d}
        motionRef={motionRef}
      />

      <OrbitControls
        enableZoom={false}
        enablePan={false}
        minPolarAngle={Math.PI * 0.3}
        maxPolarAngle={Math.PI * 0.72}
        rotateSpeed={0.9}
        dampingFactor={0.08}
        enableDamping
        onStart={() => {
          motionRef.current.dragging = true;
          setDragging(true);
        }}
        onChange={(event) => {
          if (!event || !motionRef.current.dragging) return;
          const ctrl = event.target as {
            getAzimuthalAngle: () => number;
            getPolarAngle: () => number;
          };
          const az = ctrl.getAzimuthalAngle();
          const pol = ctrl.getPolarAngle();
          const da = az - orbitStateRef.current.azimuth;
          const dp = pol - orbitStateRef.current.polar;
          orbitStateRef.current.azimuth = az;
          orbitStateRef.current.polar = pol;
          motionRef.current.wind.x += da * 0.25;
          motionRef.current.wind.y += dp * -0.2;
          motionRef.current.wind.z += da * 0.12;
          motionRef.current.impulse = Math.min(
            1,
            motionRef.current.impulse + Math.abs(da) * 0.42 + Math.abs(dp) * 0.34
          );
        }}
        onEnd={() => {
          motionRef.current.dragging = false;
          setDragging(false);
        }}
      />

      <CursorHint dragging={dragging} />
    </group>
  );
}

function createBodyModel(spec: ResolvedOrganismSpec, seed: number): BodyModel {
  const rng = new Rng(seed ^ 0x51f15d9f);
  const count = Math.max(1, spec.colonyCount);
  const spread = 0.5 + spec.spawnRadius * 2.0;
  const coreRadius = 0.38 + spec.hollowness * 0.32;
  const bodies: SurfaceBody[] = [];

  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2 + (rng.next() - 0.5) * spec.asymmetry * 1.2;
    const radial = count === 1 ? 0 : spread * (0.34 + rng.next() * 0.66);
    const center = new THREE.Vector3(
      Math.cos(angle) * radial,
      (rng.next() - 0.5) * (0.6 + spec.asymmetry * 0.9),
      Math.sin(angle) * radial * 0.84
    );
    const radius = 0.56 + spec.spawnRadius * 0.92 + rng.next() * 0.38;
    bodies.push({
      center,
      radius,
      color: new THREE.Color(spec.palette[i % spec.palette.length] ?? '#d9c7ac'),
    });
  }

  return {
    coreRadius,
    coreColor: new THREE.Color(spec.palette[0] ?? '#d9c7ac'),
    bodies,
  };
}

function deriveHairParams(spec: ResolvedOrganismSpec): HairCurveParams {
  return {
    enabled: true,
    rootCount: Math.round(120 + spec.sporeCount * 0.85),
    segmentsPerHair: Math.round(7 + spec.branching * 7),
    stepLength: 0.042 + spec.filamentLength * 0.06,
    swayFrequency: 0.32 + spec.swirl * 1.05,
    dashLength: 0.028 + spec.filamentLength * 0.035,
    dashWidth: 0.009 + spec.translucency * 0.007,
    hairLengthJitter: 0.22 + spec.scaleVariance * 0.48,
    curlStrength: 0.14 + spec.swirl * 0.56,
    outwardBias: 0.22 + spec.shellOpenness * 0.62,
    noiseStrength: 0.06 + spec.jitter * 0.34,
    branchProbability: 0.03 + spec.branching * 0.2,
    branchLengthScale: 0.35 + spec.branching * 0.28,
    taperPower: 1.25 + spec.scaleVariance * 0.9,
    tipDotProbability: 0.1 + spec.glow * 0.16,
    opacity: 0.16 + spec.translucency * 0.34,
    color: spec.palette[1] ?? '#c9baa4',
  };
}

function deriveVectorParams(spec: ResolvedOrganismSpec): VectorParticleParams {
  return {
    enabled: true,
    particleCount: Math.round(220 + spec.sporeCount * 0.55),
    spawnShellInner: 0.05 + spec.hollowness * 0.18,
    spawnShellOuter: 0.38 + spec.spawnRadius * 0.34,
    particleSize: 0.02 + spec.scaleVariance * 0.02,
    particleSizeJitter: 0.32 + spec.scaleVariance * 0.3,
    opacity: 0.14 + spec.translucency * 0.28,
    velocityScale: 0.0035 + spec.drift * 0.006,
    damping: 0.08 + (1 - spec.collisionSoftness) * 0.16,
    noiseScale: 0.8 + spec.latticeDensity * 1.8,
    curlStrength: 0.02 + spec.swirl * 0.08,
    outwardDrift: 0.0005 + spec.drift * 0.0012,
    inwardRecovery: 0.0014 + spec.recovery * 0.0032,
    surfaceAttraction: 0.003 + spec.cohesion * 0.009,
    swirlStrength: 0.001 + spec.swirl * 0.004,
    lifetimeMin: 5 + spec.birthStagger * 4,
    lifetimeMax: 10 + spec.birthStagger * 8,
    respawn: true,
    color: spec.palette[2] ?? '#ece2d0',
    bloomFactor: 0.15 + spec.glow * 0.4,
  };
}

function CursorHint({ dragging }: { dragging: boolean }) {
  useEffect(() => {
    document.body.style.cursor = dragging ? 'grabbing' : 'grab';
    return () => {
      document.body.style.cursor = '';
    };
  }, [dragging]);
  return null;
}
