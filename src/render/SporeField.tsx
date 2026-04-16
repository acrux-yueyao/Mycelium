import { OrbitControls } from '@react-three/drei';
import { Canvas, useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import type { ResolvedOrganismSpec } from '../core/species';
import { Rng } from '../core/seed';
import { FuzzLayer, type FuzzBody, type FuzzInteractionState, type FuzzParams } from './FuzzLayer';

interface SporeFieldProps {
  spec: ResolvedOrganismSpec;
  seed: number;
}

interface BodyModel {
  coreRadius: number;
  coreColor: THREE.Color;
  colonies: FuzzBody[];
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
        <OrganismBody spec={spec} seed={seed} />
      </Canvas>
    </div>
  );
}

function OrganismBody({ spec, seed }: SporeFieldProps) {
  const groupRef = useRef<THREE.Group>(null);
  const [dragging, setDragging] = useState(false);
  const interactionRef = useRef<FuzzInteractionState>({
    dragging: false,
    impulse: 0,
    wind: new THREE.Vector3(),
    pointer: null,
  });
  const orbitStateRef = useRef({ azimuth: 0, polar: Math.PI / 2 });
  const model = useMemo(() => createBodyModel(spec, seed), [seed, spec]);
  const fuzzParams = useMemo(() => deriveFuzzParams(spec), [spec]);

  useFrame((state, delta) => {
    const dt = Math.min(0.033, delta);
    interactionRef.current.impulse = Math.max(0, interactionRef.current.impulse - dt * 0.85);
    interactionRef.current.wind.multiplyScalar(0.92);
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
          opacity={0.22 + spec.wetness * 0.22}
          roughness={0.22 + spec.grain * 0.56}
          transmission={0.24 + spec.translucency * 0.32}
          thickness={0.6}
          clearcoat={0.38}
          clearcoatRoughness={0.35}
        />
      </mesh>

      {model.colonies.map((c, idx) => (
        <mesh key={idx} position={c.center}>
          <sphereGeometry args={[c.radius * 0.18, 20, 20]} />
          <meshStandardMaterial
            color={c.color}
            emissive={c.color}
            emissiveIntensity={0.08 + spec.glow * 0.22}
            transparent
            opacity={0.16 + spec.translucency * 0.24}
            roughness={0.35}
          />
        </mesh>
      ))}

      <FuzzLayer
        params={fuzzParams}
        bodies={model.colonies}
        seed={seed}
        interactionRef={interactionRef}
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
          interactionRef.current.dragging = true;
          setDragging(true);
        }}
        onChange={(event) => {
          if (!event || !interactionRef.current.dragging) return;
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

          interactionRef.current.wind.x += da * 0.25;
          interactionRef.current.wind.y += dp * -0.2;
          interactionRef.current.wind.z += da * 0.12;
          interactionRef.current.impulse = Math.min(
            1,
            interactionRef.current.impulse + Math.abs(da) * 0.42 + Math.abs(dp) * 0.34
          );
        }}
        onEnd={() => {
          interactionRef.current.dragging = false;
          setDragging(false);
        }}
      />

      <CursorHint dragging={dragging} />
    </group>
  );
}

function createBodyModel(spec: ResolvedOrganismSpec, seed: number): BodyModel {
  const rng = new Rng(seed ^ 0x51f15d9f);
  const colonyCount = Math.max(1, spec.colonyCount);
  const spread = 0.5 + spec.spawnRadius * 2.0;
  const coreRadius = 0.38 + spec.hollowness * 0.32;
  const colonies: FuzzBody[] = [];

  for (let i = 0; i < colonyCount; i++) {
    const angle = (i / colonyCount) * Math.PI * 2 + (rng.next() - 0.5) * spec.asymmetry * 1.2;
    const radial = colonyCount === 1 ? 0 : spread * (0.34 + rng.next() * 0.66);
    const center = new THREE.Vector3(
      Math.cos(angle) * radial,
      (rng.next() - 0.5) * (0.6 + spec.asymmetry * 0.9),
      Math.sin(angle) * radial * 0.84
    );
    const radius = 0.56 + spec.spawnRadius * 0.92 + rng.next() * 0.38;
    colonies.push({
      center,
      radius,
      color: new THREE.Color(spec.palette[i % spec.palette.length] ?? '#d9c7ac'),
    });
  }

  return {
    coreRadius,
    coreColor: new THREE.Color(spec.palette[0] ?? '#d9c7ac'),
    colonies,
  };
}

function deriveFuzzParams(spec: ResolvedOrganismSpec): FuzzParams {
  return {
    enabled: true,
    fiberCount: Math.round(260 + spec.sporeCount * 1.7),
    fiberLength: 0.1 + spec.filamentLength * 0.32,
    fiberLengthJitter: 0.18 + spec.scaleVariance * 0.35,
    fiberWidth: 0.01 + spec.translucency * 0.012,
    shellOffset: 0.01 + spec.hollowness * 0.04,
    swayAmplitude: 0.02 + spec.jitter * 0.08,
    swayFrequency: 0.35 + spec.swirl * 1.05,
    tangentNoise: 0.15 + spec.jitter * 0.35,
    droop: 0.03 + spec.droop * 0.45,
    clumpiness: 0.15 + spec.branching * 0.7,
    translucency: 0.3 + spec.translucency * 0.6,
    opacity: 0.22 + spec.translucency * 0.34,
    brightness: 0.12 + spec.glow * 0.42,
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
