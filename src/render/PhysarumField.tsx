import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { SpeciesParams } from '../core/species';
import { gradientToVec3s } from '../core/species';
import { Rng } from '../core/seed';

import fullscreenVert from './shaders/fullscreen.vert.glsl?raw';
import agentFrag from './shaders/agent.frag.glsl?raw';
import depositVert from './shaders/deposit.vert.glsl?raw';
import depositFrag from './shaders/deposit.frag.glsl?raw';
import diffuseFrag from './shaders/diffuse.frag.glsl?raw';
import displayFrag from './shaders/display.frag.glsl?raw';

interface Props {
  species: SpeciesParams;
  seed: number;
  /** 0 → just-seeded, 1 → fully grown. Driven by parent. */
  growth: number;
}

// Simulation resolution — trail texture is square, sized down from the
// display canvas to stay fast on modest hardware.
const TRAIL_SIZE = 1024;

export function PhysarumField({ species, seed, growth }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const growthRef = useRef(growth);
  useEffect(() => {
    growthRef.current = growth;
  }, [growth]);

  // Determine agent texture dimensions to fit species.agentCount.
  const { agentTexSize, actualAgentCount } = useMemo(() => {
    const n = Math.min(species.agentCount, 200_000);
    const side = Math.ceil(Math.sqrt(n));
    return { agentTexSize: side, actualAgentCount: side * side };
  }, [species.agentCount]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      powerPreference: 'high-performance',
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    const resize = () => {
      renderer.setSize(window.innerWidth, window.innerHeight, false);
    };
    resize();
    window.addEventListener('resize', resize);

    // Float RT support check
    const gl = renderer.getContext() as WebGL2RenderingContext;
    if (!gl.getExtension('EXT_color_buffer_float')) {
      // Fall back silently to half-float — still fine for trails 0..few.
      // (three.js will pick HalfFloatType where needed)
    }

    // === Agent RT (ping-pong) ===
    const makeAgentRT = () =>
      new THREE.WebGLRenderTarget(agentTexSize, agentTexSize, {
        type: THREE.FloatType,
        format: THREE.RGBAFormat,
        minFilter: THREE.NearestFilter,
        magFilter: THREE.NearestFilter,
        depthBuffer: false,
        stencilBuffer: false,
      });
    let agentA = makeAgentRT();
    let agentB = makeAgentRT();

    // === Trail RT (ping-pong) ===
    const makeTrailRT = () =>
      new THREE.WebGLRenderTarget(TRAIL_SIZE, TRAIL_SIZE, {
        type: THREE.HalfFloatType,
        format: THREE.RGBAFormat,
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        wrapS: THREE.RepeatWrapping,
        wrapT: THREE.RepeatWrapping,
        depthBuffer: false,
        stencilBuffer: false,
      });
    let trailA = makeTrailRT();
    let trailB = makeTrailRT();

    // === Seed initial agent positions ===
    const rng = new Rng(seed);
    const initData = new Float32Array(actualAgentCount * 4);
    const spawnOrder = new Float32Array(actualAgentCount);
    for (let i = 0; i < actualAgentCount; i++) {
      const [px, py] = spawnPoint(species, rng);
      initData[i * 4 + 0] = px;
      initData[i * 4 + 1] = py;
      initData[i * 4 + 2] = rng.next(); // heading / TAU
      initData[i * 4 + 3] = 1.0;
      spawnOrder[i] = i / actualAgentCount;
    }
    const initTex = new THREE.DataTexture(
      initData,
      agentTexSize,
      agentTexSize,
      THREE.RGBAFormat,
      THREE.FloatType
    );
    initTex.needsUpdate = true;

    // Scene setup: one offscreen camera+quad per pass.
    const quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const quadGeo = new THREE.PlaneGeometry(2, 2);

    // === Pass: copy init tex into agentA ===
    {
      const mat = new THREE.ShaderMaterial({
        vertexShader: fullscreenVert,
        fragmentShader: `
          precision highp float;
          varying vec2 vUv;
          uniform sampler2D uTex;
          void main() { gl_FragColor = texture2D(uTex, vUv); }
        `,
        uniforms: { uTex: { value: initTex } },
      });
      const mesh = new THREE.Mesh(quadGeo, mat);
      const scene = new THREE.Scene().add(mesh) as THREE.Scene;
      renderer.setRenderTarget(agentA);
      renderer.render(scene, quadCam);
      mat.dispose();
    }

    // === Agent update pass ===
    const agentMat = new THREE.ShaderMaterial({
      vertexShader: fullscreenVert,
      fragmentShader: agentFrag,
      uniforms: {
        uAgents: { value: agentA.texture },
        uTrail: { value: trailA.texture },
        uSimSize: { value: new THREE.Vector2(TRAIL_SIZE, TRAIL_SIZE) },
        uTime: { value: 0 },
        uDt: { value: 1 / 60 },
        uSenseAngle: { value: species.senseAngle },
        uSenseDistance: { value: species.senseDistance },
        uTurnAngle: { value: species.turnAngle },
        uStepSize: { value: species.stepSize },
        uPulse: { value: 0 },
      },
    });
    const agentMesh = new THREE.Mesh(quadGeo, agentMat);
    const agentScene = new THREE.Scene();
    agentScene.add(agentMesh);

    // === Deposit pass ===
    // Points geometry with one vertex per agent — vertex shader looks up
    // position from the agent texture.
    const depositGeo = new THREE.BufferGeometry();
    const agentUvs = new Float32Array(actualAgentCount * 2);
    for (let i = 0; i < actualAgentCount; i++) {
      const x = (i % agentTexSize) / agentTexSize + 0.5 / agentTexSize;
      const y = Math.floor(i / agentTexSize) / agentTexSize + 0.5 / agentTexSize;
      agentUvs[i * 2 + 0] = x;
      agentUvs[i * 2 + 1] = y;
    }
    // three.js needs a `position` attribute for Points; we supply dummies.
    depositGeo.setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array(actualAgentCount * 3), 3)
    );
    depositGeo.setAttribute('aUv', new THREE.BufferAttribute(agentUvs, 2));
    depositGeo.setAttribute('aOrder', new THREE.BufferAttribute(spawnOrder, 1));
    const depositMat = new THREE.ShaderMaterial({
      vertexShader: depositVert,
      fragmentShader: depositFrag,
      uniforms: {
        uAgents: { value: agentA.texture },
        uPointSize: { value: 1.5 },
        uGrowth: { value: 0 },
        uDeposit: { value: species.depositStrength },
        uPulse: { value: 0 },
      },
      blending: THREE.AdditiveBlending,
      depthTest: false,
      depthWrite: false,
      transparent: true,
    });
    const depositPoints = new THREE.Points(depositGeo, depositMat);
    const depositScene = new THREE.Scene();
    depositScene.add(depositPoints);

    // === Diffuse pass ===
    const diffuseMat = new THREE.ShaderMaterial({
      vertexShader: fullscreenVert,
      fragmentShader: diffuseFrag,
      uniforms: {
        uTrail: { value: trailA.texture },
        uSimSize: { value: new THREE.Vector2(TRAIL_SIZE, TRAIL_SIZE) },
        uDiffuseRate: { value: species.diffuseRate },
        uDecayRate: { value: species.decayRate },
      },
    });
    const diffuseMesh = new THREE.Mesh(quadGeo, diffuseMat);
    const diffuseScene = new THREE.Scene();
    diffuseScene.add(diffuseMesh);

    // === Display pass ===
    const grads = gradientToVec3s(species.gradient);
    const bgHex = parseInt(species.background.replace('#', ''), 16);
    const bg = new THREE.Vector3(
      ((bgHex >> 16) & 255) / 255,
      ((bgHex >> 8) & 255) / 255,
      (bgHex & 255) / 255
    );
    const displayMat = new THREE.ShaderMaterial({
      vertexShader: fullscreenVert,
      fragmentShader: displayFrag,
      uniforms: {
        uTrail: { value: trailA.texture },
        uGrad0: { value: new THREE.Vector3(grads[0], grads[1], grads[2]) },
        uGrad1: { value: new THREE.Vector3(grads[3], grads[4], grads[5]) },
        uGrad2: { value: new THREE.Vector3(grads[6], grads[7], grads[8]) },
        uBackground: { value: bg },
        uGrain: { value: species.grainAmount },
        uVignette: { value: species.vignetteStrength },
        uTime: { value: 0 },
      },
    });
    const displayMesh = new THREE.Mesh(quadGeo, displayMat);
    const displayScene = new THREE.Scene();
    displayScene.add(displayMesh);

    // === Render loop ===
    let raf = 0;
    let start = performance.now();
    const loop = () => {
      const tMs = performance.now() - start;
      const tSec = tMs / 1000;
      const pulse = 0.5 + 0.5 * Math.sin(tSec * species.pulseFrequency * Math.PI * 2);
      const modPulse = pulse * species.pulseDepth;

      // 1. Agent update:  agentA, trailA -> agentB
      agentMat.uniforms.uAgents.value = agentA.texture;
      agentMat.uniforms.uTrail.value = trailA.texture;
      agentMat.uniforms.uTime.value = tSec;
      agentMat.uniforms.uPulse.value = modPulse;
      renderer.setRenderTarget(agentB);
      renderer.render(agentScene, quadCam);

      // 2. Deposit:       agentB -> trailA (additive on top of current trailA)
      depositMat.uniforms.uAgents.value = agentB.texture;
      depositMat.uniforms.uGrowth.value = growthRef.current;
      depositMat.uniforms.uPulse.value = modPulse;
      renderer.setRenderTarget(trailA);
      renderer.autoClear = false;
      renderer.render(depositScene, quadCam);
      renderer.autoClear = true;

      // 3. Diffuse+decay: trailA -> trailB
      diffuseMat.uniforms.uTrail.value = trailA.texture;
      renderer.setRenderTarget(trailB);
      renderer.render(diffuseScene, quadCam);

      // 4. Display:       trailB -> screen
      displayMat.uniforms.uTrail.value = trailB.texture;
      displayMat.uniforms.uTime.value = tSec;
      renderer.setRenderTarget(null);
      renderer.render(displayScene, quadCam);

      // swap
      const agentTmp = agentA;
      agentA = agentB;
      agentB = agentTmp;
      const trailTmp = trailA;
      trailA = trailB;
      trailB = trailTmp;

      raf = requestAnimationFrame(loop);
    };
    loop();

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      agentA.dispose();
      agentB.dispose();
      trailA.dispose();
      trailB.dispose();
      initTex.dispose();
      depositGeo.dispose();
      quadGeo.dispose();
      agentMat.dispose();
      depositMat.dispose();
      diffuseMat.dispose();
      displayMat.dispose();
      renderer.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [species.id, seed]);

  return <canvas ref={canvasRef} style={{ display: 'block', width: '100%', height: '100%' }} />;
}

// ---- spawn patterns ----
function spawnPoint(species: SpeciesParams, rng: Rng): [number, number] {
  const cx = 0.5;
  const cy = 0.5;
  const R = species.spawnRadius;
  switch (species.spawnPattern) {
    case 'radial': {
      const a = rng.next() * Math.PI * 2;
      const r = R * Math.sqrt(rng.next());
      return [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
    }
    case 'branching': {
      // Seed on a few radial spokes so growth reads as branches.
      const spokes = 5;
      const s = rng.int(0, spokes);
      const a = (s / spokes) * Math.PI * 2 + (rng.next() - 0.5) * 0.25;
      const r = R * rng.next() * 0.6;
      return [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
    }
    case 'cluster': {
      // Several gaussian clumps
      const clumps = 4;
      const c = rng.int(0, clumps);
      const ang = (c / clumps) * Math.PI * 2;
      const cxj = cx + Math.cos(ang) * R * 0.7;
      const cyj = cy + Math.sin(ang) * R * 0.7;
      const dx = (rng.next() - 0.5) * R * 0.4;
      const dy = (rng.next() - 0.5) * R * 0.4;
      return [cxj + dx, cyj + dy];
    }
    case 'cup': {
      // Hollow ring — produces cup-like silhouette as trail diffuses inward.
      const a = rng.next() * Math.PI * 2;
      const r = R * (0.85 + rng.next() * 0.15);
      return [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
    }
    case 'grid': {
      // Hex-ish grid of seed nodes
      const N = 6;
      const ix = rng.int(0, N);
      const iy = rng.int(0, N);
      const jitterX = (rng.next() - 0.5) * (R / N) * 0.5;
      const jitterY = (rng.next() - 0.5) * (R / N) * 0.5;
      return [
        cx + (ix / (N - 1) - 0.5) * R * 2 + jitterX,
        cy + (iy / (N - 1) - 0.5) * R * 2 + jitterY,
      ];
    }
  }
}
