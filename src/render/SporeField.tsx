import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import type { ResolvedOrganismSpec } from '../core/species';
import { Rng } from '../core/seed';

interface SporeFieldProps {
  spec: ResolvedOrganismSpec;
  seed: number;
}

interface Colony {
  center: THREE.Vector3;
  radius: number;
  color: THREE.Color;
}

interface Fluff {
  colony: number;
  baseRest: THREE.Vector3;
  base: THREE.Vector3;
  tipRest: THREE.Vector3;
  tip: THREE.Vector3;
  vel: THREE.Vector3;
  normal: THREE.Vector3;
  bendAxis: THREE.Vector3;
  bendPhase: number;
  size: number;
  color: THREE.Color;
  phase: number;
  birthDelayMs: number;
}

interface Model {
  colonies: Colony[];
  fluffs: Fluff[];
}

interface PointerState {
  pulse: number;
}

interface DragState {
  active: boolean;
  x: number;
  y: number;
}

const HAIR_SEGMENTS = 8;
const Y_AXIS = new THREE.Vector3(0, 1, 0);

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
        <DreamSporeCluster spec={spec} seed={seed} />
      </Canvas>
    </div>
  );
}

function DreamSporeCluster({ spec, seed }: SporeFieldProps) {
  const model = useMemo(() => createModel(spec, seed), [seed, spec]);
  const groupRef = useRef<THREE.Group>(null);
  const tipsRef = useRef<THREE.InstancedMesh>(null);
  const hairRef = useRef<THREE.InstancedMesh>(null);

  const pointerRef = useRef<PointerState>({ pulse: 0 });
  const dragRef = useRef<DragState>({ active: false, x: 0, y: 0 });
  const windRef = useRef(new THREE.Vector3());
  const orbitRef = useRef({ azimuth: 0, polar: Math.PI / 2 });
  const [dragging, setDragging] = useState(false);

  useFrame(({ clock }, delta) => {
    const dt = Math.min(0.033, delta);
    const t = clock.elapsedTime;
    const wind = windRef.current;
    const pointer = pointerRef.current;

    pointer.pulse = Math.max(0, pointer.pulse - dt * 0.9);
    wind.multiplyScalar(0.94);

    const spring = 0.03 + spec.recovery * 0.1;
    const damping = 0.84 + spec.collisionSoftness * 0.12;
    const hairThicknessBase = 0.015 + spec.filamentLength * 0.018;

    const tipMesh = tipsRef.current;
    const hairMesh = hairRef.current;
    const tipDummy = new THREE.Object3D();
    const segDummy = new THREE.Object3D();

    for (let i = 0; i < model.fluffs.length; i++) {
      const fluff = model.fluffs[i];
      if (t * 1000 < fluff.birthDelayMs) continue;

      const breath = Math.sin(t * (0.6 + spec.pulse * 2.2) + fluff.phase) * (0.02 + spec.pulse * 0.08);
      fluff.base.copy(fluff.baseRest).addScaledVector(fluff.normal, breath * 0.2);

      const toRest = fluff.tipRest.clone().sub(fluff.tip).multiplyScalar(spring);
      const drift = new THREE.Vector3(
        Math.sin(t * (0.5 + spec.drift * 1.8) + fluff.phase * 1.9),
        Math.cos(t * (0.65 + spec.swirl * 1.4) + fluff.phase * 0.8),
        Math.sin(t * (0.58 + spec.swirl * 1.7) + fluff.phase * 1.3)
      ).multiplyScalar(0.004 + spec.jitter * 0.024);

      const swirl = fluff.tip
        .clone()
        .sub(fluff.base)
        .cross(new THREE.Vector3(0, 1, 0))
        .multiplyScalar(0.004 + spec.swirl * 0.018);

      const windPush = wind.clone().multiplyScalar(0.45 + spec.filamentLength * 0.9);

      fluff.vel.addScaledVector(toRest, dt * 60);
      fluff.vel.addScaledVector(drift, dt * 60);
      fluff.vel.addScaledVector(swirl, dt * 60);
      fluff.vel.addScaledVector(windPush, dt * 60);
      if (pointer.pulse > 0.01) {
        const pulsePush = fluff.tip
          .clone()
          .sub(fluff.base)
          .normalize()
          .multiplyScalar((0.005 + spec.pointerStrength * 0.02) * pointer.pulse);
        fluff.vel.addScaledVector(pulsePush, dt * 60);
      }
      fluff.vel.multiplyScalar(damping);
      fluff.tip.addScaledVector(fluff.vel, dt * 60);

      const bendAmount =
        (0.08 + spec.filamentLength * 0.38) *
        (1 + Math.min(1.8, fluff.vel.length() * 28)) *
        (0.7 + Math.sin(t * 1.3 + fluff.bendPhase) * 0.25);
      const axis = fluff.bendAxis.clone();
      const rootDir = fluff.tip.clone().sub(fluff.base).normalize();
      const c1 = fluff.base
        .clone()
        .addScaledVector(rootDir, fluff.base.distanceTo(fluff.tip) * 0.34)
        .addScaledVector(axis, bendAmount * 1.35);
      const c2 = fluff.tip
        .clone()
        .addScaledVector(rootDir, -fluff.base.distanceTo(fluff.tip) * 0.2)
        .addScaledVector(axis, bendAmount * 0.62);

      if (hairMesh) {
        for (let seg = 0; seg < HAIR_SEGMENTS; seg++) {
          const t0 = seg / HAIR_SEGMENTS;
          const t1 = (seg + 1) / HAIR_SEGMENTS;
          const a = cubicPoint(fluff.base, c1, c2, fluff.tip, t0);
          const b = cubicPoint(fluff.base, c1, c2, fluff.tip, t1);
          const segmentIndex = i * HAIR_SEGMENTS + seg;
          const thickness = hairThicknessBase * (1 - seg / (HAIR_SEGMENTS + 1));
          setCylinderTransform(segDummy, a, b, thickness);
          hairMesh.setMatrixAt(segmentIndex, segDummy.matrix);
          hairMesh.setColorAt(segmentIndex, fluff.color);
        }
      }

      if (tipMesh) {
        tipDummy.position.copy(fluff.tip);
        const s = fluff.size * (0.7 + spec.translucency * 0.45 + Math.sin(t * 1.3 + fluff.phase) * 0.05);
        tipDummy.scale.setScalar(s);
        tipDummy.rotation.y = t * 0.2 + fluff.phase;
        tipDummy.updateMatrix();
        tipMesh.setMatrixAt(i, tipDummy.matrix);
        tipMesh.setColorAt(i, fluff.color);
      }
    }

    if (hairMesh) {
      hairMesh.instanceMatrix.needsUpdate = true;
      if (hairMesh.instanceColor) hairMesh.instanceColor.needsUpdate = true;
    }
    if (tipMesh) {
      tipMesh.instanceMatrix.needsUpdate = true;
      if (tipMesh.instanceColor) tipMesh.instanceColor.needsUpdate = true;
    }

    if (groupRef.current) {
      groupRef.current.rotation.z = Math.sin(t * 0.18) * (0.03 + spec.asymmetry * 0.05);
    }
  });

  return (
    <group
      ref={groupRef}
      onPointerDown={(e) => {
        e.stopPropagation();
        pointerRef.current.pulse = 1;
      }}
    >
      <mesh>
        <sphereGeometry args={[0.34 + spec.hollowness * 0.28, 28, 28]} />
        <meshPhysicalMaterial
          color={spec.palette[0] ?? '#d9c7ac'}
          transparent
          opacity={0.22 + spec.wetness * 0.22}
          roughness={0.24 + spec.grain * 0.56}
          transmission={0.24 + spec.translucency * 0.32}
          thickness={0.6}
          clearcoat={0.38}
          clearcoatRoughness={0.35}
        />
      </mesh>

      {model.colonies.map((c, idx) => (
        <mesh key={idx} position={c.center}>
          <sphereGeometry args={[0.12 + c.radius * 0.05, 20, 20]} />
          <meshStandardMaterial
            color={spec.palette[idx % spec.palette.length] ?? '#e7d9c6'}
            emissive={spec.palette[idx % spec.palette.length] ?? '#e7d9c6'}
            emissiveIntensity={0.1 + spec.glow * 0.24}
            transparent
            opacity={0.18 + spec.translucency * 0.28}
            roughness={0.35}
          />
        </mesh>
      ))}

      <instancedMesh ref={hairRef} args={[undefined, undefined, model.fluffs.length * HAIR_SEGMENTS]}>
        <cylinderGeometry args={[1, 1, 1, 6]} />
        <meshStandardMaterial
          transparent
          opacity={0.34 + spec.translucency * 0.25}
          roughness={0.34 + spec.grain * 0.42}
          metalness={0.05}
          vertexColors
        />
      </instancedMesh>

      <instancedMesh ref={tipsRef} args={[undefined, undefined, model.fluffs.length]}>
        <sphereGeometry args={[0.05 + spec.scaleVariance * 0.04, 12, 12]} />
        <meshPhysicalMaterial
          transparent
          opacity={0.65 + spec.translucency * 0.28}
          roughness={0.22 + spec.grain * 0.45}
          metalness={0.04}
          transmission={0.2 + spec.translucency * 0.28}
          thickness={0.28}
          clearcoat={0.5}
          emissive={new THREE.Color(spec.palette[2] ?? '#f0e6d8')}
          emissiveIntensity={0.07 + spec.glow * 0.22}
          vertexColors
        />
      </instancedMesh>

      <mesh
        position={[0, 0, -0.8]}
        onPointerDown={() => {
          pointerRef.current.pulse = 1;
        }}
      >
        <planeGeometry args={[24, 16]} />
        <meshBasicMaterial transparent opacity={0} />
      </mesh>

      <CursorHint dragging={dragging} />
      <OrbitControls
        enableZoom={false}
        enablePan={false}
        minPolarAngle={Math.PI * 0.3}
        maxPolarAngle={Math.PI * 0.7}
        rotateSpeed={0.85}
        dampingFactor={0.08}
        enableDamping
        onStart={() => {
          dragRef.current.active = true;
          setDragging(true);
        }}
        onChange={(event) => {
          if (!event) return;
          if (!dragRef.current.active) return;
          const ctrl = event.target as {
            getAzimuthalAngle: () => number;
            getPolarAngle: () => number;
          };
          const az = ctrl.getAzimuthalAngle();
          const pol = ctrl.getPolarAngle();
          const da = az - orbitRef.current.azimuth;
          const dp = pol - orbitRef.current.polar;
          orbitRef.current.azimuth = az;
          orbitRef.current.polar = pol;
          windRef.current.x += da * 0.22;
          windRef.current.y += dp * -0.18;
          windRef.current.z += da * 0.1;
          pointerRef.current.pulse = Math.min(1, pointerRef.current.pulse + Math.abs(da) * 0.4 + Math.abs(dp) * 0.3);
        }}
        onEnd={() => {
          dragRef.current.active = false;
          setDragging(false);
        }}
      />
    </group>
  );
}

function createModel(spec: ResolvedOrganismSpec, seed: number): Model {
  const rng = new Rng(seed ^ 0x7f4a7c15);
  const colonies: Colony[] = [];
  const fluffs: Fluff[] = [];
  const colonyCount = Math.max(1, spec.colonyCount);
  const spread = 0.55 + spec.spawnRadius * 2.15;

  for (let i = 0; i < colonyCount; i++) {
    const angle = (i / colonyCount) * Math.PI * 2 + (rng.next() - 0.5) * spec.asymmetry * 1.1;
    const radial = colonyCount === 1 ? 0 : spread * (0.3 + rng.next() * 0.7);
    const center = new THREE.Vector3(
      Math.cos(angle) * radial,
      (rng.next() - 0.5) * (0.6 + spec.asymmetry * 0.9),
      Math.sin(angle) * radial * 0.85
    );
    const radius = 0.55 + spec.spawnRadius * 0.9 + rng.next() * 0.4;
    colonies.push({
      center,
      radius,
      color: new THREE.Color(spec.palette[i % spec.palette.length] ?? '#d9c7ac'),
    });
  }

  const totalFluffs = Math.max(120, spec.sporeCount);
  const perColony = Math.floor(totalFluffs / colonyCount);
  let order = 0;

  for (let ci = 0; ci < colonies.length; ci++) {
    const colony = colonies[ci];
    for (let i = 0; i < perColony; i++) {
      const theta = rng.next() * Math.PI * 2;
      const phi = Math.acos(1 - 2 * rng.next());
      const n = new THREE.Vector3(
        Math.sin(phi) * Math.cos(theta),
        Math.cos(phi),
        Math.sin(phi) * Math.sin(theta)
      ).normalize();
      const branchWarp = 1 + Math.sin(theta * (2 + spec.branching * 6)) * spec.branching * 0.24;
      const shell = colony.radius * (0.56 + spec.shellOpenness * 0.46) * branchWarp;
      const baseRest = colony.center.clone().addScaledVector(n, shell * 0.7);
      const hairLen = (0.25 + spec.filamentLength * 0.72 + rng.next() * 0.2) * (1 + spec.scaleVariance * 0.4);
      const tipRest = baseRest.clone().addScaledVector(n, hairLen);
      const tip = baseRest.clone().lerp(tipRest, 0.3 + rng.next() * 0.18);
      const color = new THREE.Color(spec.palette[(ci + i) % spec.palette.length] ?? '#d9c7ac');
      const size = 0.07 + rng.next() * (0.08 + spec.scaleVariance * 0.08);
      fluffs.push({
        colony: ci,
        baseRest,
        base: baseRest.clone(),
        tipRest,
        tip,
        vel: new THREE.Vector3((rng.next() - 0.5) * 0.01, (rng.next() - 0.5) * 0.01, (rng.next() - 0.5) * 0.01),
        normal: n,
        bendAxis: new THREE.Vector3(rng.next() - 0.5, rng.next() - 0.5, rng.next() - 0.5).normalize(),
        bendPhase: rng.next() * Math.PI * 2,
        size,
        color,
        phase: rng.next() * Math.PI * 2,
        birthDelayMs: order * (1 + spec.birthStagger * 10) + rng.range(0, 160),
      });
      order += 1;
    }
  }

  return { colonies, fluffs };
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

function setCylinderTransform(
  dummy: THREE.Object3D,
  a: THREE.Vector3,
  b: THREE.Vector3,
  thickness: number
): void {
  const dir = b.clone().sub(a);
  const len = Math.max(0.001, dir.length());
  const mid = a.clone().addScaledVector(dir, 0.5);
  dir.normalize();
  dummy.position.copy(mid);
  dummy.quaternion.setFromUnitVectors(Y_AXIS, dir);
  dummy.scale.set(thickness, len * 0.5, thickness);
  dummy.updateMatrix();
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
