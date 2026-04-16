import { useEffect, useMemo, useRef, useState } from 'react';
import type { ResolvedOrganismSpec } from '../core/species';
import { Rng } from '../core/seed';

interface SporeFieldProps {
  spec: ResolvedOrganismSpec;
  seed: number;
}

interface ColonyState {
  x: number;
  y: number;
  radius: number;
  colorIndex: number;
}

interface SporeState {
  colonyIndex: number;
  colorIndex: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  homeX: number;
  homeY: number;
  targetRadius: number;
  size: number;
  birthDelayMs: number;
  phase: number;
}

interface PointerState {
  active: boolean;
  x: number;
  y: number;
  pulse: number;
}

interface FieldState {
  colonies: ColonyState[];
  spores: SporeState[];
}

export function SporeField({ spec, seed }: SporeFieldProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const pointerRef = useRef<PointerState>({ active: false, x: 0, y: 0, pulse: 0 });
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;

    const updateSize = () => {
      const rect = node.getBoundingClientRect();
      setSize({
        width: Math.max(1, Math.floor(rect.width)),
        height: Math.max(1, Math.floor(rect.height)),
      });
    };
    updateSize();

    const observer = new ResizeObserver(updateSize);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const field = useMemo(() => {
    if (size.width <= 0 || size.height <= 0) {
      return null;
    }
    return buildField(spec, seed, size.width, size.height);
  }, [seed, size.height, size.width, spec]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !field) return;
    const context = canvas.getContext('2d');
    if (!context) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(size.width * dpr);
    canvas.height = Math.floor(size.height * dpr);
    canvas.style.width = `${size.width}px`;
    canvas.style.height = `${size.height}px`;
    context.setTransform(dpr, 0, 0, dpr, 0, 0);

    let raf = 0;
    let lastTs = performance.now();
    const bornAt = performance.now();
    const spores = field.spores.map((spore) => ({ ...spore }));
    const pointer = pointerRef.current;

    const tick = (ts: number) => {
      const dt = Math.min(0.033, (ts - lastTs) / 1000);
      const dtScale = dt * 60;
      lastTs = ts;
      const elapsedMs = ts - bornAt;

      pointer.pulse = Math.max(0, pointer.pulse - dt * 0.72);

      context.clearRect(0, 0, size.width, size.height);
      drawColonies(context, field.colonies, spec, elapsedMs / 1000);

      for (let i = 0; i < spores.length; i++) {
        const spore = spores[i];
        const colony = field.colonies[spore.colonyIndex];
        if (!colony) continue;
        const ageMs = elapsedMs - spore.birthDelayMs;
        if (ageMs < 0) continue;

        const t = elapsedMs / 1000;
        const pulseWave = (Math.sin(t * (0.8 + spec.pulse * 2.8) + spore.phase) + 1) * 0.5;
        const driftAngle = spore.phase + t * (0.2 + spec.swirl * 1.4);

        let ax = Math.cos(driftAngle) * (0.002 + spec.drift * 0.017);
        let ay = Math.sin(driftAngle * 1.07) * (0.002 + spec.drift * 0.017);

        ax += Math.sin(t * 0.9 + spore.phase * 3.7) * spec.jitter * 0.007;
        ay += Math.cos(t * 1.1 + spore.phase * 3.1) * spec.jitter * 0.007;

        const toHomeX = spore.homeX - spore.x;
        const toHomeY = spore.homeY - spore.y;
        const recoverySpring = 0.003 + spec.recovery * 0.018;
        ax += toHomeX * recoverySpring;
        ay += toHomeY * (recoverySpring + spec.droop * 0.002);

        const toColonyX = spore.x - colony.x;
        const toColonyY = spore.y - colony.y;
        const distFromColony = Math.hypot(toColonyX, toColonyY) || 1;
        const distError = spore.targetRadius - distFromColony;
        const shellForce = (0.001 + spec.scatter * 0.01) * (0.4 + pulseWave * 0.6);
        ax += (toColonyX / distFromColony) * distError * shellForce;
        ay += (toColonyY / distFromColony) * distError * shellForce;

        ax += (colony.x - spore.x) * (0.0007 + spec.cohesion * 0.0065);
        ay += (colony.y - spore.y) * (0.0007 + spec.cohesion * 0.0065);

        ay += spec.droop * 0.0022;

        const pointerRadius = 72 + spec.pointerRadius * 280;
        const pointerDx = pointer.x - spore.x;
        const pointerDy = pointer.y - spore.y;
        const pointerDist = Math.hypot(pointerDx, pointerDy) || 1;
        const pointerInRange = pointer.active && pointerDist < pointerRadius;
        const pulseInRange = pointer.pulse > 0.001 && pointerDist < pointerRadius * 1.1;

        if (pointerInRange || pulseInRange) {
          const falloff = Math.max(0, 1 - pointerDist / pointerRadius);
          const base = (0.003 + spec.pointerStrength * 0.028) * falloff * falloff;
          const pulseBoost =
            spec.interaction.pointerResponse === 'repel-burst' ? 1 + pointer.pulse * 2.8 : 1 + pointer.pulse;
          const response = responseSign(spec.interaction.pointerResponse);
          const strength = base * pulseBoost * response;
          ax += (pointerDx / pointerDist) * strength;
          ay += (pointerDy / pointerDist) * strength;
        }

        const damping =
          (0.84 + spec.collisionSoftness * 0.12) - (1 - spec.interaction.pointerRecovery) * 0.03;
        spore.vx = (spore.vx + ax * dtScale) * damping;
        spore.vy = (spore.vy + ay * dtScale) * damping;
        spore.x += spore.vx * dtScale;
        spore.y += spore.vy * dtScale;

        const birthFade = Math.min(1, ageMs / (260 + spec.birthStagger * 800));
        drawSpore(context, spore, colony, spec, pulseWave, birthFade);
      }

      raf = window.requestAnimationFrame(tick);
    };

    raf = window.requestAnimationFrame(tick);
    return () => {
      window.cancelAnimationFrame(raf);
    };
  }, [field, size.height, size.width, spec]);

  return (
    <div
      className="spore-field"
      ref={containerRef}
      onPointerMove={(event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        pointerRef.current.active = true;
        pointerRef.current.x = event.clientX - rect.left;
        pointerRef.current.y = event.clientY - rect.top;
      }}
      onPointerLeave={() => {
        pointerRef.current.active = false;
      }}
      onPointerDown={() => {
        pointerRef.current.pulse = 1;
      }}
    >
      <canvas ref={canvasRef} />
    </div>
  );
}

function buildField(spec: ResolvedOrganismSpec, seed: number, width: number, height: number): FieldState {
  const rng = new Rng(seed ^ 0x85ebca6b);
  const colonies: ColonyState[] = [];
  const spores: SporeState[] = [];
  const cx = width * 0.5;
  const cy = height * 0.52;
  const spread = Math.min(width, height) * (0.12 + spec.spawnRadius * 0.28);
  const colonyCount = Math.max(1, spec.colonyCount);

  for (let i = 0; i < colonyCount; i++) {
    const orbit = colonyCount === 1 ? 0 : (i / colonyCount) * Math.PI * 2;
    const asymBias = (rng.next() - 0.5) * 2 * spec.asymmetry;
    const angle = orbit + asymBias * 0.85 + Math.sin(i * 1.7) * spec.branching * 0.2;
    const radial = colonyCount === 1 ? 0 : spread * (0.35 + rng.next() * 0.65);
    const x = cx + Math.cos(angle) * radial * (0.8 + spec.asymmetry * 0.5);
    const y = cy + Math.sin(angle) * radial * (0.78 + (1 - spec.asymmetry) * 0.28);
    const radius =
      Math.min(width, height) *
      (0.055 + spec.spawnRadius * 0.12) *
      (0.72 + rng.next() * (0.35 + spec.scaleVariance * 0.45));
    colonies.push({
      x,
      y,
      radius: Math.max(18, radius),
      colorIndex: i % spec.palette.length,
    });
  }

  const weights = colonies.map(
    () => 0.8 + rng.next() * 0.4 + (rng.next() - 0.5) * spec.scaleVariance * 0.9
  );
  const totalWeight = weights.reduce((sum, value) => sum + value, 0);

  const counts = weights.map((weight) =>
    Math.max(8, Math.floor((weight / totalWeight) * Math.max(24, spec.sporeCount)))
  );
  let counted = counts.reduce((sum, value) => sum + value, 0);
  while (counted < spec.sporeCount) {
    const index = rng.int(0, counts.length);
    counts[index] += 1;
    counted += 1;
  }
  while (counted > spec.sporeCount) {
    const index = rng.int(0, counts.length);
    if (counts[index] > 8) {
      counts[index] -= 1;
      counted -= 1;
    } else {
      break;
    }
  }

  let order = 0;
  for (let c = 0; c < colonies.length; c++) {
    const colony = colonies[c];
    const colonySporeCount = counts[c] ?? 8;
    for (let i = 0; i < colonySporeCount; i++) {
      const theta = rng.next() * Math.PI * 2;
      const branchWarp = spec.branching * 0.9 * Math.sin(theta * (2 + spec.latticeDensity * 7));
      const angle = theta + branchWarp;
      const centerHole = spec.hollowness * 0.7;
      const radialPow = 0.45 + (1 - spec.latticeDensity) * 1.15;
      const radialUnit = centerHole + (1 - centerHole) * Math.pow(rng.next(), radialPow);
      const radial = colony.radius * radialUnit;
      const asymSkew = 1 + (rng.next() - 0.5) * spec.asymmetry * 0.7;
      const homeX = colony.x + Math.cos(angle) * radial * asymSkew;
      const homeY =
        colony.y +
        Math.sin(angle) * radial * (1 - spec.asymmetry * 0.22) +
        spec.droop * colony.radius * 0.12 * radialUnit;
      const initX = colony.x + (rng.next() - 0.5) * 8;
      const initY = colony.y + (rng.next() - 0.5) * 8;
      const stemBoost = 0.6 + spec.stemLength * 1.25;
      const sizeScale = 0.9 + spec.scaleVariance * 2.2;
      const size = (0.6 + rng.next() * sizeScale) * stemBoost;
      const birthDelayMs = order * (4 + spec.birthStagger * 24) + rng.range(0, 260);
      const phase = rng.next() * Math.PI * 2;
      spores.push({
        colonyIndex: c,
        colorIndex: (colony.colorIndex + i + Math.floor(rng.next() * spec.palette.length)) % spec.palette.length,
        x: initX,
        y: initY,
        vx: (rng.next() - 0.5) * 0.2,
        vy: (rng.next() - 0.5) * 0.2,
        homeX,
        homeY,
        targetRadius: radial,
        size,
        birthDelayMs,
        phase,
      });
      order += 1;
    }
  }

  return { colonies, spores };
}

function responseSign(mode: ResolvedOrganismSpec['interaction']['pointerResponse']): number {
  if (mode === 'attract' || mode === 'follow') {
    return 1;
  }
  return -1;
}

function drawColonies(
  ctx: CanvasRenderingContext2D,
  colonies: ColonyState[],
  spec: ResolvedOrganismSpec,
  t: number
) {
  for (let i = 0; i < colonies.length; i++) {
    const colony = colonies[i];
    const color = spec.palette[colony.colorIndex % spec.palette.length] ?? '#8fa8a8';
    const shimmer = 0.06 + spec.glow * 0.14 + (Math.sin(t * 0.7 + i) + 1) * 0.02;
    ctx.beginPath();
    ctx.arc(colony.x, colony.y, colony.radius * (0.58 + spec.shellOpenness * 0.42), 0, Math.PI * 2);
    ctx.fillStyle = hexToRgba(color, shimmer * (0.4 + spec.translucency));
    ctx.fill();
  }
}

function drawSpore(
  ctx: CanvasRenderingContext2D,
  spore: SporeState,
  colony: ColonyState,
  spec: ResolvedOrganismSpec,
  pulseWave: number,
  birthFade: number
) {
  const color = spec.palette[spore.colorIndex % spec.palette.length] ?? '#d9c7ac';
  const alpha = (0.18 + spec.translucency * 0.55 + spec.glow * 0.08) * birthFade;
  const radius = spore.size * (0.9 + spec.wetness * 0.5 + pulseWave * spec.pulse * 0.26);

  if (spec.stemLength > 0.08) {
    const stemAlpha = (0.07 + spec.filamentLength * 0.2) * birthFade;
    ctx.beginPath();
    ctx.moveTo(colony.x, colony.y);
    ctx.lineTo(spore.x, spore.y);
    ctx.strokeStyle = hexToRgba(color, stemAlpha);
    ctx.lineWidth = 0.35 + spec.filamentLength * 1.8;
    ctx.stroke();
  }

  ctx.beginPath();
  ctx.arc(spore.x, spore.y, radius, 0, Math.PI * 2);
  ctx.fillStyle = hexToRgba(color, alpha);
  ctx.fill();

  if (spec.glow > 0.1) {
    ctx.beginPath();
    ctx.arc(spore.x, spore.y, radius * (1.4 + spec.glow), 0, Math.PI * 2);
    ctx.fillStyle = hexToRgba(color, alpha * 0.24 * (0.4 + spec.glow));
    ctx.fill();
  }
}

function hexToRgba(hex: string, alpha: number): string {
  const normalized = hex.trim();
  if (/^#[0-9a-fA-F]{3}$/.test(normalized)) {
    const r = parseInt(normalized[1] + normalized[1], 16);
    const g = parseInt(normalized[2] + normalized[2], 16);
    const b = parseInt(normalized[3] + normalized[3], 16);
    return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, alpha))})`;
  }
  if (/^#[0-9a-fA-F]{6}$/.test(normalized)) {
    const r = parseInt(normalized.slice(1, 3), 16);
    const g = parseInt(normalized.slice(3, 5), 16);
    const b = parseInt(normalized.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, alpha))})`;
  }
  return `rgba(140, 140, 140, ${Math.max(0, Math.min(1, alpha))})`;
}
