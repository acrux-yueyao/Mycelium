import { Canvas, useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import type { ResolvedOrganismSpec } from '../core/species';
import { Rng } from '../core/seed';

interface SporeFieldProps {
  spec: ResolvedOrganismSpec;
  seed: number;
}

interface Particle {
  colony: number;
  home: THREE.Vector3;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  size: number;
  phase: number;
  birthDelay: number;
  colorIndex: number;
}

interface Colony {
  center: THREE.Vector3;
  radius: number;
}

interface ModelData {
  particles: Particle[];
  colonies: Colony[];
  pointPositions: Float32Array;
  pointColors: Float32Array;
  linePositions: Float32Array;
}

interface DragState {
  active: boolean;
  x: number;
  y: number;
}

interface PointerFieldState {
  active: boolean;
  world: THREE.Vector3;
  pulse: number;
}

export function SporeField({ spec, seed }: SporeFieldProps) {
  return (
    <div className="spore-field">
      <Canvas
        dpr={[1, 2]}
        camera={{ position: [0, 0, 9.8], fov: 46 }}
        gl={{ antialias: true, alpha: true }}
      >
        <color attach="background" args={['#f4ede0']} />
        <ambientLight intensity={0.4} />
        <directionalLight position={[2, 3, 4]} intensity={0.55} color="#f6ead4" />
        <pointLight position={[-3, 2, 2]} intensity={0.75} color="#d7f1ee" />
        <pointLight position={[3, -2, 2]} intensity={0.45} color="#f1dac8" />
        <SporeCluster spec={spec} seed={seed} />
      </Canvas>
    </div>
  );
}

function SporeCluster({ spec, seed }: SporeFieldProps) {
  const model = useMemo(() => buildModel(spec, seed), [seed, spec]);
  const pointsGeometry = useMemo(() => new THREE.BufferGeometry(), []);
  const linesGeometry = useMemo(() => new THREE.BufferGeometry(), []);
  const pointsRef = useRef<THREE.Points>(null);
  const linesRef = useRef<THREE.LineSegments>(null);
  const groupRef = useRef<THREE.Group>(null);

  const pointer = useRef<PointerFieldState>({
    active: false,
    world: new THREE.Vector3(),
    pulse: 0,
  });
  const drag = useRef<DragState>({ active: false, x: 0, y: 0 });
  const rotationTarget = useRef(new THREE.Vector2(0, 0));
  const [dragging, setDragging] = useState(false);

  useMemo(() => {
    pointsGeometry.setAttribute('position', new THREE.BufferAttribute(model.pointPositions, 3));
    pointsGeometry.setAttribute('color', new THREE.BufferAttribute(model.pointColors, 3));
    linesGeometry.setAttribute('position', new THREE.BufferAttribute(model.linePositions, 3));
    return undefined;
  }, [linesGeometry, model.linePositions, model.pointColors, model.pointPositions, pointsGeometry]);

  useFrame(({ clock }, delta) => {
    const dt = Math.min(0.033, delta);
    const t = clock.elapsedTime;
    pointer.current.pulse = Math.max(0, pointer.current.pulse - dt * 0.8);

    const pullStrength = 0.08 + spec.pointerStrength * 0.34;
    const pullRadius = 0.65 + spec.pointerRadius * 3.8;
    const recovery = 0.2 + spec.recovery * 1.6;
    const damping = 0.92 + spec.collisionSoftness * 0.06;

    for (let i = 0; i < model.particles.length; i++) {
      const p = model.particles[i];
      const c = model.colonies[p.colony];
      const alive = t * 1000 >= p.birthDelay;
      if (!alive) {
        continue;
      }

      const sway = new THREE.Vector3(
        Math.sin(t * (0.6 + spec.swirl * 1.8) + p.phase) * (0.005 + spec.jitter * 0.02),
        Math.cos(t * (0.7 + spec.swirl * 1.6) + p.phase * 0.7) * (0.005 + spec.jitter * 0.02),
        Math.sin(t * (0.5 + spec.drift * 1.7) + p.phase * 1.9) * (0.004 + spec.drift * 0.02)
      );

      const toHome = p.home.clone().sub(p.pos).multiplyScalar(0.02 + recovery * 0.03);
      const toColony = c.center.clone().sub(p.pos).multiplyScalar(0.003 + spec.cohesion * 0.015);
      const swirl = p.pos
        .clone()
        .sub(c.center)
        .cross(new THREE.Vector3(0, 1, 0))
        .multiplyScalar(0.0008 + spec.swirl * 0.008);

      const pulseScale = 0.5 + 0.5 * Math.sin(t * (0.8 + spec.pulse * 2.4) + p.phase);
      const scatter = p.pos
        .clone()
        .sub(c.center)
        .normalize()
        .multiplyScalar((0.001 + spec.scatter * 0.01) * pulseScale);

      let pointerForce = new THREE.Vector3();
      if (pointer.current.active || pointer.current.pulse > 0.01) {
        const deltaToPointer = pointer.current.world.clone().sub(p.pos);
        const dist = Math.max(0.001, deltaToPointer.length());
        if (dist < pullRadius) {
          const falloff = 1 - dist / pullRadius;
          const modeSign =
            spec.interaction.pointerResponse === 'attract' || spec.interaction.pointerResponse === 'follow'
              ? 1
              : -1;
          const burstBoost =
            spec.interaction.pointerResponse === 'repel-burst' ? 1 + pointer.current.pulse * 2.4 : 1 + pointer.current.pulse;
          pointerForce = deltaToPointer
            .normalize()
            .multiplyScalar(modeSign * pullStrength * falloff * falloff * burstBoost);
        }
      }

      p.vel.addScaledVector(sway, dt * 60);
      p.vel.addScaledVector(toHome, dt * 60);
      p.vel.addScaledVector(toColony, dt * 60);
      p.vel.addScaledVector(swirl, dt * 60);
      p.vel.addScaledVector(scatter, dt * 60);
      p.vel.addScaledVector(pointerForce, dt * 60);
      p.vel.multiplyScalar(damping);
      p.pos.addScaledVector(p.vel, dt * 60);

      const pi = i * 3;
      model.pointPositions[pi] = p.pos.x;
      model.pointPositions[pi + 1] = p.pos.y;
      model.pointPositions[pi + 2] = p.pos.z;

      const li = i * 6;
      model.linePositions[li] = c.center.x;
      model.linePositions[li + 1] = c.center.y;
      model.linePositions[li + 2] = c.center.z;
      model.linePositions[li + 3] = p.pos.x;
      model.linePositions[li + 4] = p.pos.y;
      model.linePositions[li + 5] = p.pos.z;
    }

    const px = pointsGeometry.getAttribute('position') as THREE.BufferAttribute;
    const lx = linesGeometry.getAttribute('position') as THREE.BufferAttribute;
    px.needsUpdate = true;
    lx.needsUpdate = true;

    const targetX = rotationTarget.current.y;
    const targetY = rotationTarget.current.x;
    if (groupRef.current) {
      groupRef.current.rotation.x = THREE.MathUtils.lerp(groupRef.current.rotation.x, targetX, 0.08);
      groupRef.current.rotation.y = THREE.MathUtils.lerp(groupRef.current.rotation.y, targetY, 0.08);
      groupRef.current.rotation.z = Math.sin(t * 0.15) * (0.03 + spec.asymmetry * 0.05);
    }

    if (pointsRef.current) {
      const mat = pointsRef.current.material as THREE.PointsMaterial;
      mat.opacity = 0.65 + spec.translucency * 0.35;
    }
  });

  return (
    <group
      ref={groupRef}
      onPointerDown={(event) => {
        event.stopPropagation();
        drag.current.active = true;
        drag.current.x = event.nativeEvent.clientX;
        drag.current.y = event.nativeEvent.clientY;
        pointer.current.active = true;
        pointer.current.world.copy(event.point);
        pointer.current.pulse = 1;
        setDragging(true);
      }}
      onPointerMove={(event) => {
        event.stopPropagation();
        pointer.current.active = true;
        pointer.current.world.copy(event.point);

        if (!drag.current.active) return;
        const dx = event.nativeEvent.clientX - drag.current.x;
        const dy = event.nativeEvent.clientY - drag.current.y;
        drag.current.x = event.nativeEvent.clientX;
        drag.current.y = event.nativeEvent.clientY;

        rotationTarget.current.x += dx * 0.005;
        rotationTarget.current.y += dy * 0.005;
        rotationTarget.current.y = THREE.MathUtils.clamp(rotationTarget.current.y, -1.2, 1.2);
      }}
      onPointerUp={(event) => {
        event.stopPropagation();
        drag.current.active = false;
        setDragging(false);
      }}
      onPointerLeave={() => {
        drag.current.active = false;
        pointer.current.active = false;
        setDragging(false);
      }}
    >
      <mesh position={[0, 0, -0.2]}>
        <sphereGeometry args={[0.25 + spec.hollowness * 0.35, 24, 24]} />
        <meshStandardMaterial
          color={spec.palette[0] ?? '#d9c7ac'}
          transparent
          opacity={0.16 + spec.wetness * 0.22}
          roughness={0.32 + spec.grain * 0.5}
          metalness={0.08 + spec.wetness * 0.12}
        />
      </mesh>

      {model.colonies.map((colony, idx) => (
        <mesh key={idx} position={colony.center}>
          <sphereGeometry args={[0.08 + colony.radius * 0.07, 16, 16]} />
          <meshStandardMaterial
            color={spec.palette[idx % spec.palette.length] ?? '#ece2d0'}
            emissive={spec.palette[idx % spec.palette.length] ?? '#ece2d0'}
            emissiveIntensity={0.08 + spec.glow * 0.2}
            transparent
            opacity={0.2 + spec.translucency * 0.3}
            roughness={0.4}
          />
        </mesh>
      ))}

      <lineSegments ref={linesRef} geometry={linesGeometry}>
        <lineBasicMaterial
          color={spec.palette[1] ?? '#c8b79a'}
          transparent
          opacity={0.08 + spec.filamentLength * 0.25}
        />
      </lineSegments>

      <points ref={pointsRef} geometry={pointsGeometry}>
        <pointsMaterial
          size={0.05 + spec.scaleVariance * 0.07}
          transparent
          opacity={0.78}
          sizeAttenuation
          vertexColors
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </points>

      <mesh
        position={[0, 0, -0.6]}
        onPointerMove={(event) => {
          pointer.current.active = true;
          pointer.current.world.copy(event.point);
        }}
        onPointerDown={(event) => {
          pointer.current.active = true;
          pointer.current.world.copy(event.point);
          pointer.current.pulse = 1;
        }}
      >
        <planeGeometry args={[30, 20]} />
        <meshBasicMaterial transparent opacity={0} />
      </mesh>

      <HtmlCursor dragging={dragging} />
    </group>
  );
}

function buildModel(spec: ResolvedOrganismSpec, seed: number): ModelData {
  const rng = new Rng(seed ^ 0x51f15d9f);
  const colonyCount = Math.max(1, spec.colonyCount);
  const colonies: Colony[] = [];
  const spread = 0.5 + spec.spawnRadius * 2.2;
  const particles: Particle[] = [];

  for (let i = 0; i < colonyCount; i++) {
    const angle = (i / colonyCount) * Math.PI * 2 + (rng.next() - 0.5) * spec.asymmetry;
    const radial = colonyCount === 1 ? 0 : spread * (0.4 + rng.next() * 0.6);
    const lift = (rng.next() - 0.5) * (0.5 + spec.asymmetry * 0.8);
    colonies.push({
      center: new THREE.Vector3(Math.cos(angle) * radial, lift, Math.sin(angle) * radial * 0.75),
      radius: 0.45 + spec.spawnRadius * 0.95 + rng.next() * 0.55,
    });
  }

  const perColony = Math.max(18, Math.floor(spec.sporeCount / colonyCount));
  let order = 0;
  for (let c = 0; c < colonyCount; c++) {
    const colony = colonies[c];
    for (let i = 0; i < perColony; i++) {
      const theta = rng.next() * Math.PI * 2;
      const phi = Math.acos(1 - 2 * rng.next());
      const radialUnit = 0.18 + (1 - spec.hollowness * 0.75) * 0.82 * Math.pow(rng.next(), 0.7);
      const radial = colony.radius * radialUnit;
      const branch = 1 + Math.sin(theta * (2 + spec.branching * 5)) * spec.branching * 0.35;
      const local = new THREE.Vector3(
        Math.sin(phi) * Math.cos(theta) * radial * branch,
        Math.cos(phi) * radial * (0.8 + spec.shellOpenness * 0.4),
        Math.sin(phi) * Math.sin(theta) * radial * (0.8 + spec.asymmetry * 0.45)
      );
      const home = colony.center.clone().add(local);
      const pos = colony.center.clone().addScaledVector(local, 0.06 + rng.next() * 0.08);
      particles.push({
        colony: c,
        home,
        pos,
        vel: new THREE.Vector3((rng.next() - 0.5) * 0.02, (rng.next() - 0.5) * 0.02, (rng.next() - 0.5) * 0.02),
        size: 0.6 + rng.next() * (0.5 + spec.scaleVariance * 1.1),
        phase: rng.next() * Math.PI * 2,
        birthDelay: order * (3 + spec.birthStagger * 20) + rng.range(0, 260),
        colorIndex: (c + i + Math.floor(rng.next() * spec.palette.length)) % spec.palette.length,
      });
      order += 1;
    }
  }

  const pointPositions = new Float32Array(particles.length * 3);
  const pointColors = new Float32Array(particles.length * 3);
  const linePositions = new Float32Array(particles.length * 6);

  for (let i = 0; i < particles.length; i++) {
    const p = particles[i];
    const pi = i * 3;
    pointPositions[pi] = p.pos.x;
    pointPositions[pi + 1] = p.pos.y;
    pointPositions[pi + 2] = p.pos.z;

    const color = new THREE.Color(spec.palette[p.colorIndex] ?? '#d9c7ac');
    pointColors[pi] = color.r;
    pointColors[pi + 1] = color.g;
    pointColors[pi + 2] = color.b;

    const colony = colonies[p.colony];
    const li = i * 6;
    linePositions[li] = colony.center.x;
    linePositions[li + 1] = colony.center.y;
    linePositions[li + 2] = colony.center.z;
    linePositions[li + 3] = p.pos.x;
    linePositions[li + 4] = p.pos.y;
    linePositions[li + 5] = p.pos.z;
  }

  return {
    particles,
    colonies,
    pointPositions,
    pointColors,
    linePositions,
  };
}

function HtmlCursor({ dragging }: { dragging: boolean }) {
  useEffect(() => {
    document.body.style.cursor = dragging ? 'grabbing' : 'grab';
    return () => {
      document.body.style.cursor = '';
    };
  }, [dragging]);
  return null;
}
