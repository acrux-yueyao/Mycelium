import { Canvas, useFrame } from '@react-three/fiber';
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
  size: number;
  color: THREE.Color;
  phase: number;
  birthDelayMs: number;
}

interface Model {
  colonies: Colony[];
  fluffs: Fluff[];
  linePositions: Float32Array;
}

interface PointerState {
  active: boolean;
  world: THREE.Vector3;
  pulse: number;
}

interface DragState {
  active: boolean;
  x: number;
  y: number;
}

export function SporeField({ spec, seed }: SporeFieldProps) {
  return (
    <div className="spore-field">
      <Canvas camera={{ position: [0, 0, 8.8], fov: 44 }} dpr={[1, 2]} gl={{ antialias: true, alpha: true }}>
        <color attach="background" args={['#f4ede0']} />
        <fog attach="fog" args={['#f4ede0', 8, 16]} />
        <ambientLight intensity={0.36} />
        <directionalLight position={[2.5, 3.2, 4]} intensity={0.82} color="#fff3e3" />
        <pointLight position={[-3, 2, 2]} intensity={0.5} color="#d6f0ee" />
        <pointLight position={[3, -1.6, 2]} intensity={0.5} color="#f3ddd0" />
        <DreamSporeCluster spec={spec} seed={seed} />
      </Canvas>
    </div>
  );
}

function DreamSporeCluster({ spec, seed }: SporeFieldProps) {
  const model = useMemo(() => createModel(spec, seed), [seed, spec]);
  const groupRef = useRef<THREE.Group>(null);
  const linesRef = useRef<THREE.LineSegments>(null);
  const tipsRef = useRef<THREE.InstancedMesh>(null);

  const pointerRef = useRef<PointerState>({ active: false, world: new THREE.Vector3(), pulse: 0 });
  const dragRef = useRef<DragState>({ active: false, x: 0, y: 0 });
  const windRef = useRef(new THREE.Vector3());
  const rotTargetRef = useRef(new THREE.Vector2(0, 0));
  const [dragging, setDragging] = useState(false);

  const linesGeometry = useMemo(() => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(model.linePositions, 3));
    return geometry;
  }, [model.linePositions]);

  useFrame(({ clock }, delta) => {
    const dt = Math.min(0.033, delta);
    const t = clock.elapsedTime;
    const pointer = pointerRef.current;
    const wind = windRef.current;

    pointer.pulse = Math.max(0, pointer.pulse - dt * 0.9);
    wind.multiplyScalar(0.94);

    const pointerRadius = 0.7 + spec.pointerRadius * 4.8;
    const pointerStrength = 0.06 + spec.pointerStrength * 0.52;
    const spring = 0.03 + spec.recovery * 0.1;
    const damping = 0.84 + spec.collisionSoftness * 0.12;

    const tipMesh = tipsRef.current;
    const dummy = new THREE.Object3D();

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

      let pointerForce = new THREE.Vector3();
      if (pointer.active || pointer.pulse > 0.01) {
        const deltaPointer = pointer.world.clone().sub(fluff.tip);
        const dist = deltaPointer.length();
        if (dist < pointerRadius) {
          const falloff = Math.max(0, 1 - dist / pointerRadius);
          const burst = spec.interaction.pointerResponse === 'repel-burst' ? 1 + pointer.pulse * 2.4 : 1 + pointer.pulse;
          const sign =
            spec.interaction.pointerResponse === 'attract' || spec.interaction.pointerResponse === 'follow'
              ? 1
              : -1;
          pointerForce = deltaPointer
            .normalize()
            .multiplyScalar(sign * pointerStrength * falloff * falloff * burst);
        }
      }

      fluff.vel.addScaledVector(toRest, dt * 60);
      fluff.vel.addScaledVector(drift, dt * 60);
      fluff.vel.addScaledVector(swirl, dt * 60);
      fluff.vel.addScaledVector(windPush, dt * 60);
      fluff.vel.addScaledVector(pointerForce, dt * 60);
      fluff.vel.multiplyScalar(damping);
      fluff.tip.addScaledVector(fluff.vel, dt * 60);

      const lineIdx = i * 6;
      model.linePositions[lineIdx] = fluff.base.x;
      model.linePositions[lineIdx + 1] = fluff.base.y;
      model.linePositions[lineIdx + 2] = fluff.base.z;
      model.linePositions[lineIdx + 3] = fluff.tip.x;
      model.linePositions[lineIdx + 4] = fluff.tip.y;
      model.linePositions[lineIdx + 5] = fluff.tip.z;

      if (tipMesh) {
        dummy.position.copy(fluff.tip);
        const s = fluff.size * (0.7 + spec.translucency * 0.45 + Math.sin(t * 1.3 + fluff.phase) * 0.05);
        dummy.scale.setScalar(s);
        dummy.rotation.y = t * 0.2 + fluff.phase;
        dummy.updateMatrix();
        tipMesh.setMatrixAt(i, dummy.matrix);
        tipMesh.setColorAt(i, fluff.color);
      }
    }

    const lineAttr = linesGeometry.getAttribute('position') as THREE.BufferAttribute;
    lineAttr.needsUpdate = true;
    if (tipMesh) {
      tipMesh.instanceMatrix.needsUpdate = true;
      if (tipMesh.instanceColor) tipMesh.instanceColor.needsUpdate = true;
    }

    if (groupRef.current) {
      groupRef.current.rotation.x = THREE.MathUtils.lerp(groupRef.current.rotation.x, rotTargetRef.current.y, 0.07);
      groupRef.current.rotation.y = THREE.MathUtils.lerp(groupRef.current.rotation.y, rotTargetRef.current.x, 0.07);
      groupRef.current.rotation.z = Math.sin(t * 0.18) * (0.04 + spec.asymmetry * 0.08);
    }
  });

  return (
    <group
      ref={groupRef}
      onPointerDown={(e) => {
        e.stopPropagation();
        dragRef.current.active = true;
        dragRef.current.x = e.nativeEvent.clientX;
        dragRef.current.y = e.nativeEvent.clientY;
        pointerRef.current.active = true;
        pointerRef.current.world.copy(e.point);
        pointerRef.current.pulse = 1;
        setDragging(true);
      }}
      onPointerMove={(e) => {
        e.stopPropagation();
        pointerRef.current.active = true;
        pointerRef.current.world.copy(e.point);
        if (!dragRef.current.active) return;
        const dx = e.nativeEvent.clientX - dragRef.current.x;
        const dy = e.nativeEvent.clientY - dragRef.current.y;
        dragRef.current.x = e.nativeEvent.clientX;
        dragRef.current.y = e.nativeEvent.clientY;

        rotTargetRef.current.x += dx * 0.0046;
        rotTargetRef.current.y += dy * 0.0046;
        rotTargetRef.current.y = THREE.MathUtils.clamp(rotTargetRef.current.y, -1.1, 1.1);

        windRef.current.x += dx * 0.00035;
        windRef.current.y -= dy * 0.00028;
        windRef.current.z += dx * 0.0002;
      }}
      onPointerUp={(e) => {
        e.stopPropagation();
        dragRef.current.active = false;
        setDragging(false);
      }}
      onPointerLeave={() => {
        dragRef.current.active = false;
        pointerRef.current.active = false;
        setDragging(false);
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

      <lineSegments ref={linesRef} geometry={linesGeometry}>
        <lineBasicMaterial
          color={spec.palette[1] ?? '#c9baa4'}
          transparent
          opacity={0.1 + spec.filamentLength * 0.25}
        />
      </lineSegments>

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
        onPointerMove={(e) => {
          pointerRef.current.active = true;
          pointerRef.current.world.copy(e.point);
        }}
        onPointerDown={(e) => {
          pointerRef.current.active = true;
          pointerRef.current.world.copy(e.point);
          pointerRef.current.pulse = 1;
        }}
      >
        <planeGeometry args={[24, 16]} />
        <meshBasicMaterial transparent opacity={0} />
      </mesh>

      <CursorHint dragging={dragging} />
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
        size,
        color,
        phase: rng.next() * Math.PI * 2,
        birthDelayMs: order * (1 + spec.birthStagger * 10) + rng.range(0, 160),
      });
      order += 1;
    }
  }

  const linePositions = new Float32Array(fluffs.length * 6);
  for (let i = 0; i < fluffs.length; i++) {
    const fluff = fluffs[i];
    const idx = i * 6;
    linePositions[idx] = fluff.base.x;
    linePositions[idx + 1] = fluff.base.y;
    linePositions[idx + 2] = fluff.base.z;
    linePositions[idx + 3] = fluff.tip.x;
    linePositions[idx + 4] = fluff.tip.y;
    linePositions[idx + 5] = fluff.tip.z;
  }

  return { colonies, fluffs, linePositions };
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
