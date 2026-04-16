import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { SpeciesParams } from '../core/species';
import { Rng } from '../core/seed';

import fullscreenVert from './shaders/fullscreen.vert.glsl?raw';
import agentFrag from './shaders/agent.frag.glsl?raw';
import depositVert from './shaders/deposit.vert.glsl?raw';
import depositFrag from './shaders/deposit.frag.glsl?raw';
import diffuseFrag from './shaders/diffuse.frag.glsl?raw';
import sporeDisplayFrag from './shaders/spore-display.frag.glsl?raw';
import particleVert from './shaders/particle.vert.glsl?raw';
import particleFrag from './shaders/particle.frag.glsl?raw';

interface Props {
  species: SpeciesParams;
  seed: number;
  growth: number;
}

const TRAIL_SIZE = 512;
const MAX_SPORES = 12;
const MAX_PARTICLES = 300;
const SPORE_COUNT = 8;

// ---- Archetype mapping from species ----
const SPECIES_ARCHETYPE: Record<string, number> = {
  metatrichia: 4,    // E: dark bioluminescent
  physarum: 1,       // B: copper-orange
  cribraria: 0,      // A: grey-white crystalline
  chlorociboria: 3,  // D: cyan/turquoise
  badhamia: 2,       // C: iridescent holographic
  colloderma: 0,     // A: grey-white crystalline
};

const ARCHETYPE_PARTICLE_COLOR: [number, number, number][] = [
  [0.75, 0.73, 0.7],  // A
  [0.7, 0.4, 0.15],   // B
  [0.7, 0.5, 0.9],    // C
  [0.1, 0.75, 0.7],   // D
  [0.2, 0.45, 0.35],  // E
];

// ---- Spore state ----
interface Spore {
  x: number; y: number;
  vx: number; vy: number;
  baseX: number; baseY: number;
  radius: number;
  driftFreqX: number; driftFreqY: number;
  driftPhaseX: number; driftPhaseY: number;
  driftAmp: number;
  breathFreq: number; breathPhase: number;
  archetype: number;
  trailOffX: number; trailOffY: number;
  hopTimer: number;
}

interface Particle {
  x: number; y: number;
  vx: number; vy: number;
  life: number;
  maxLife: number;
  size: number;
  alive: boolean;
}

function initSpores(species: SpeciesParams, rng: Rng, aspect: number): Spore[] {
  const archetype = SPECIES_ARCHETYPE[species.id] ?? 0;
  const spores: Spore[] = [];
  for (let i = 0; i < SPORE_COUNT; i++) {
    const angle = (i / SPORE_COUNT) * Math.PI * 2 + rng.range(-0.3, 0.3);
    const dist = rng.range(0.12, 0.28);
    const cx = aspect * 0.5 + Math.cos(angle) * dist * aspect * 0.5;
    const cy = 0.5 + Math.sin(angle) * dist * 0.5;
    spores.push({
      x: cx, y: cy,
      vx: 0, vy: 0,
      baseX: cx, baseY: cy,
      radius: rng.range(0.028, 0.045), // ~60-90px on 1920-wide
      driftFreqX: rng.range(0.15, 0.4),
      driftFreqY: rng.range(0.12, 0.35),
      driftPhaseX: rng.range(0, Math.PI * 2),
      driftPhaseY: rng.range(0, Math.PI * 2),
      driftAmp: rng.range(0.015, 0.035),
      breathFreq: rng.range(0.4, 0.9),
      breathPhase: rng.range(0, Math.PI * 2),
      archetype: i < SPORE_COUNT - 2 ? archetype : ((archetype + rng.int(1, 5)) % 5),
      trailOffX: rng.range(0.1, 0.9),
      trailOffY: rng.range(0.1, 0.9),
      hopTimer: rng.range(3, 8),
    });
  }
  return spores;
}

function updateSpores(spores: Spore[], dt: number, time: number, growth: number, aspect: number) {
  const activeCount = Math.max(1, Math.floor(spores.length * growth));

  for (let i = 0; i < spores.length; i++) {
    const s = spores[i];
    if (i >= activeCount) {
      s.x = -10; s.y = -10; // offscreen
      continue;
    }

    // Sinusoidal drift
    const targetX = s.baseX + Math.sin(time * s.driftFreqX + s.driftPhaseX) * s.driftAmp * aspect;
    const targetY = s.baseY + Math.sin(time * s.driftFreqY + s.driftPhaseY) * s.driftAmp;
    s.x += (targetX - s.x) * 0.02;
    s.y += (targetY - s.y) * 0.02;

    // Hop
    s.hopTimer -= dt;
    if (s.hopTimer <= 0) {
      s.vx += (Math.random() - 0.5) * 0.008;
      s.vy += (Math.random() - 0.5) * 0.006;
      s.hopTimer = 3 + Math.random() * 6;
    }
    s.x += s.vx;
    s.y += s.vy;
    s.vx *= 0.92;
    s.vy *= 0.92;

    // Separation
    for (let j = i + 1; j < activeCount; j++) {
      const o = spores[j];
      const dx = s.x - o.x;
      const dy = s.y - o.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      const minDist = (s.radius + o.radius) * 2.5;
      if (d < minDist && d > 0.001) {
        const force = (minDist - d) * 0.003;
        const nx = dx / d, ny = dy / d;
        s.x += nx * force;
        s.y += ny * force;
        o.x -= nx * force;
        o.y -= ny * force;
      }
    }

    // Keep on screen
    s.x = Math.max(s.radius, Math.min(aspect - s.radius, s.x));
    s.y = Math.max(s.radius + s.radius * 2.5, Math.min(1 - s.radius, s.y));
  }
}

function emitParticles(spores: Spore[], particles: Particle[], growth: number) {
  const activeCount = Math.max(1, Math.floor(spores.length * growth));
  for (let i = 0; i < activeCount; i++) {
    const s = spores[i];
    if (s.x < 0) continue;
    if (Math.random() > 0.15) continue;
    const count = 1 + Math.floor(Math.random() * 2);
    for (let c = 0; c < count; c++) {
      const slot = particles.find(p => !p.alive);
      if (!slot) break;
      const angle = Math.random() * Math.PI * 2;
      slot.x = s.x + Math.cos(angle) * s.radius * 0.8;
      slot.y = s.y + Math.sin(angle) * s.radius * 0.8;
      slot.vx = Math.cos(angle) * 0.0004 + (Math.random() - 0.5) * 0.0003;
      slot.vy = -Math.abs(Math.sin(angle)) * 0.0005 - Math.random() * 0.0003;
      slot.maxLife = 1.5 + Math.random();
      slot.life = slot.maxLife;
      slot.size = 2 + Math.random() * 2.5;
      slot.alive = true;
    }
  }
}

function updateParticles(particles: Particle[], dt: number) {
  for (const p of particles) {
    if (!p.alive) continue;
    p.x += p.vx;
    p.y += p.vy;
    p.vy -= 0.000002;
    p.life -= dt;
    if (p.life <= 0) p.alive = false;
  }
}

export function SporeField({ species, seed, growth }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const growthRef = useRef(growth);
  useEffect(() => { growthRef.current = growth; }, [growth]);

  const { agentTexSize, actualAgentCount } = useMemo(() => {
    const n = Math.min(species.agentCount, 120_000);
    const side = Math.ceil(Math.sqrt(n));
    return { agentTexSize: side, actualAgentCount: side * side };
  }, [species.agentCount]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const renderer = new THREE.WebGLRenderer({
      canvas, antialias: false,
      powerPreference: 'high-performance',
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    let W = window.innerWidth, H = window.innerHeight;
    let aspect = W / H;
    const resize = () => {
      W = window.innerWidth;
      H = window.innerHeight;
      aspect = W / H;
      renderer.setSize(W, H, false);
    };
    resize();
    window.addEventListener('resize', resize);

    const quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const quadGeo = new THREE.PlaneGeometry(2, 2);

    const makeAgentRT = () => new THREE.WebGLRenderTarget(agentTexSize, agentTexSize, {
      type: THREE.FloatType, format: THREE.RGBAFormat,
      minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter,
      depthBuffer: false, stencilBuffer: false,
    });
    let agentA = makeAgentRT(), agentB = makeAgentRT();

    const makeTrailRT = () => new THREE.WebGLRenderTarget(TRAIL_SIZE, TRAIL_SIZE, {
      type: THREE.HalfFloatType, format: THREE.RGBAFormat,
      minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
      wrapS: THREE.RepeatWrapping, wrapT: THREE.RepeatWrapping,
      depthBuffer: false, stencilBuffer: false,
    });
    let trailA = makeTrailRT(), trailB = makeTrailRT();

    const rng = new Rng(seed);
    const initData = new Float32Array(actualAgentCount * 4);
    const spawnOrder = new Float32Array(actualAgentCount);
    for (let i = 0; i < actualAgentCount; i++) {
      const a = rng.next() * Math.PI * 2;
      const r = 0.15 * Math.sqrt(rng.next());
      initData[i * 4 + 0] = 0.5 + Math.cos(a) * r;
      initData[i * 4 + 1] = 0.5 + Math.sin(a) * r;
      initData[i * 4 + 2] = rng.next();
      initData[i * 4 + 3] = 1.0;
      spawnOrder[i] = i / actualAgentCount;
    }
    const initTex = new THREE.DataTexture(initData, agentTexSize, agentTexSize, THREE.RGBAFormat, THREE.FloatType);
    initTex.needsUpdate = true;

    {
      const mat = new THREE.ShaderMaterial({
        vertexShader: fullscreenVert,
        fragmentShader: `precision highp float; varying vec2 vUv; uniform sampler2D uTex;
          void main() { gl_FragColor = texture2D(uTex, vUv); }`,
        uniforms: { uTex: { value: initTex } },
      });
      const scene = new THREE.Scene();
      scene.add(new THREE.Mesh(quadGeo, mat));
      renderer.setRenderTarget(agentA);
      renderer.render(scene, quadCam);
      mat.dispose();
    }

    const agentMat = new THREE.ShaderMaterial({
      vertexShader: fullscreenVert, fragmentShader: agentFrag,
      uniforms: {
        uAgents: { value: agentA.texture }, uTrail: { value: trailA.texture },
        uSimSize: { value: new THREE.Vector2(TRAIL_SIZE, TRAIL_SIZE) },
        uTime: { value: 0 }, uDt: { value: 1 / 60 },
        uSenseAngle: { value: species.senseAngle }, uSenseDistance: { value: species.senseDistance },
        uTurnAngle: { value: species.turnAngle }, uStepSize: { value: species.stepSize },
        uPulse: { value: 0 },
      },
    });
    const agentScene = new THREE.Scene();
    agentScene.add(new THREE.Mesh(quadGeo, agentMat));

    const depositGeo = new THREE.BufferGeometry();
    const agentUvs = new Float32Array(actualAgentCount * 2);
    for (let i = 0; i < actualAgentCount; i++) {
      agentUvs[i * 2] = (i % agentTexSize) / agentTexSize + 0.5 / agentTexSize;
      agentUvs[i * 2 + 1] = Math.floor(i / agentTexSize) / agentTexSize + 0.5 / agentTexSize;
    }
    depositGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(actualAgentCount * 3), 3));
    depositGeo.setAttribute('aUv', new THREE.BufferAttribute(agentUvs, 2));
    depositGeo.setAttribute('aOrder', new THREE.BufferAttribute(spawnOrder, 1));
    const depositMat = new THREE.ShaderMaterial({
      vertexShader: depositVert, fragmentShader: depositFrag,
      uniforms: {
        uAgents: { value: agentA.texture }, uPointSize: { value: 1.5 },
        uGrowth: { value: 0 }, uDeposit: { value: species.depositStrength }, uPulse: { value: 0 },
      },
      blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false, transparent: true,
    });
    const depositScene = new THREE.Scene();
    depositScene.add(new THREE.Points(depositGeo, depositMat));

    const diffuseMat = new THREE.ShaderMaterial({
      vertexShader: fullscreenVert, fragmentShader: diffuseFrag,
      uniforms: {
        uTrail: { value: trailA.texture },
        uSimSize: { value: new THREE.Vector2(TRAIL_SIZE, TRAIL_SIZE) },
        uDiffuseRate: { value: species.diffuseRate }, uDecayRate: { value: species.decayRate },
      },
    });
    const diffuseScene = new THREE.Scene();
    diffuseScene.add(new THREE.Mesh(quadGeo, diffuseMat));

    const sporePosArr: number[] = [];
    const sporeRadArr: number[] = [];
    const sporeArchArr: number[] = [];
    const sporeTrailArr: number[] = [];
    for (let i = 0; i < MAX_SPORES; i++) {
      sporePosArr.push(0, 0); sporeRadArr.push(0);
      sporeArchArr.push(0); sporeTrailArr.push(0, 0);
    }

    const displayMat = new THREE.ShaderMaterial({
      vertexShader: fullscreenVert, fragmentShader: sporeDisplayFrag,
      uniforms: {
        uTrail: { value: trailA.texture },
        uTime: { value: 0 }, uAspect: { value: aspect },
        uSporeCount: { value: 0 },
        uSporePos: { value: sporePosArr },
        uSporeRadius: { value: sporeRadArr },
        uSporeArchetype: { value: sporeArchArr },
        uSporeTrailOff: { value: sporeTrailArr },
        uGrain: { value: species.grainAmount },
      },
    });
    const displayScene = new THREE.Scene();
    displayScene.add(new THREE.Mesh(quadGeo, displayMat));

    const particlePool: Particle[] = [];
    for (let i = 0; i < MAX_PARTICLES; i++) {
      particlePool.push({ x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 1, size: 3, alive: false });
    }
    const pPositions = new Float32Array(MAX_PARTICLES * 3);
    const pData = new Float32Array(MAX_PARTICLES * 2);
    const pGeo = new THREE.BufferGeometry();
    pGeo.setAttribute('position', new THREE.BufferAttribute(pPositions, 3));
    pGeo.setAttribute('aData', new THREE.BufferAttribute(pData, 2));
    const primaryArch = SPECIES_ARCHETYPE[species.id] ?? 0;
    const pColor = ARCHETYPE_PARTICLE_COLOR[primaryArch];
    const pMat = new THREE.ShaderMaterial({
      vertexShader: particleVert, fragmentShader: particleFrag,
      uniforms: {
        uAspect: { value: aspect },
        uParticleColor: { value: new THREE.Vector3(pColor[0], pColor[1], pColor[2]) },
      },
      blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false, transparent: true,
    });
    const particlePoints = new THREE.Points(pGeo, pMat);
    const particleScene = new THREE.Scene();
    particleScene.add(particlePoints);

    const sporeRng = new Rng(seed + 777);
    const spores = initSpores(species, sporeRng, aspect);

    let raf = 0;
    const start = performance.now();
    let prevTime = start;

    const loop = () => {
      const now = performance.now();
      const tSec = (now - start) / 1000;
      const dt = Math.min(0.05, (now - prevTime) / 1000);
      prevTime = now;
      const gr = growthRef.current;
      const pulse = 0.5 + 0.5 * Math.sin(tSec * species.pulseFrequency * Math.PI * 2);
      const modPulse = pulse * species.pulseDepth;

      agentMat.uniforms.uAgents.value = agentA.texture;
      agentMat.uniforms.uTrail.value = trailA.texture;
      agentMat.uniforms.uTime.value = tSec;
      agentMat.uniforms.uPulse.value = modPulse;
      renderer.setRenderTarget(agentB);
      renderer.render(agentScene, quadCam);

      depositMat.uniforms.uAgents.value = agentB.texture;
      depositMat.uniforms.uGrowth.value = gr;
      depositMat.uniforms.uPulse.value = modPulse;
      renderer.setRenderTarget(trailA);
      renderer.autoClear = false;
      renderer.render(depositScene, quadCam);
      renderer.autoClear = true;

      diffuseMat.uniforms.uTrail.value = trailA.texture;
      renderer.setRenderTarget(trailB);
      renderer.render(diffuseScene, quadCam);

      [agentA, agentB] = [agentB, agentA];
      [trailA, trailB] = [trailB, trailA];

      updateSpores(spores, dt, tSec, gr, aspect);
      emitParticles(spores, particlePool, gr);
      updateParticles(particlePool, dt);

      const posArr: number[] = [];
      const radArr: number[] = [];
      const archArr: number[] = [];
      const trailOffArr: number[] = [];
      const activeSporeCount = Math.max(1, Math.floor(spores.length * gr));
      for (let i = 0; i < MAX_SPORES; i++) {
        if (i < spores.length) {
          const s = spores[i];
          const breathScale = 1.0 + Math.sin(tSec * s.breathFreq + s.breathPhase) * 0.08;
          posArr.push(s.x, s.y);
          radArr.push(i < activeSporeCount ? s.radius * breathScale : 0);
          archArr.push(s.archetype);
          trailOffArr.push(s.trailOffX, s.trailOffY);
        } else {
          posArr.push(-10, -10); radArr.push(0);
          archArr.push(0); trailOffArr.push(0, 0);
        }
      }
      displayMat.uniforms.uTrail.value = trailB.texture;
      displayMat.uniforms.uTime.value = tSec;
      displayMat.uniforms.uAspect.value = aspect;
      displayMat.uniforms.uSporeCount.value = Math.min(activeSporeCount, spores.length);
      displayMat.uniforms.uSporePos.value = posArr;
      displayMat.uniforms.uSporeRadius.value = radArr;
      displayMat.uniforms.uSporeArchetype.value = archArr;
      displayMat.uniforms.uSporeTrailOff.value = trailOffArr;

      renderer.setRenderTarget(null);
      renderer.render(displayScene, quadCam);

      let pCount = 0;
      for (let i = 0; i < MAX_PARTICLES; i++) {
        const p = particlePool[i];
        if (p.alive) {
          pPositions[pCount * 3] = p.x;
          pPositions[pCount * 3 + 1] = p.y;
          pPositions[pCount * 3 + 2] = 0;
          pData[pCount * 2] = p.life / p.maxLife;
          pData[pCount * 2 + 1] = p.size;
          pCount++;
        }
      }
      pGeo.attributes.position.needsUpdate = true;
      pGeo.attributes.aData.needsUpdate = true;
      pGeo.setDrawRange(0, pCount);
      pMat.uniforms.uAspect.value = aspect;

      renderer.autoClear = false;
      renderer.render(particleScene, quadCam);
      renderer.autoClear = true;

      raf = requestAnimationFrame(loop);
    };
    loop();

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      agentA.dispose(); agentB.dispose();
      trailA.dispose(); trailB.dispose();
      initTex.dispose(); depositGeo.dispose(); quadGeo.dispose(); pGeo.dispose();
      agentMat.dispose(); depositMat.dispose(); diffuseMat.dispose();
      displayMat.dispose(); pMat.dispose();
      renderer.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [species.id, seed]);

  return <canvas ref={canvasRef} style={{ display: 'block', width: '100%', height: '100%' }} />;
}
