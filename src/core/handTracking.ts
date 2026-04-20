/**
 * Hand tracking via MediaPipe HandLandmarker.
 *
 * The tracker owns the <video> element, the getUserMedia stream, and
 * the per-frame landmark detection loop. Each tick it builds a
 * `HandSnapshot` per visible hand — landmarks plus derived screen-
 * space key points and three gesture flags (pointing / pinching /
 * open palm). Consumers subscribe via `onUpdate`.
 *
 * Landmarks are delivered in MediaPipe's normalized coordinates
 * (0..1) from the un-mirrored camera frame. Since the preview is
 * rendered mirrored, we mirror the X axis here so downstream
 * physics ("finger at screen x = 200px") matches what the user sees.
 */

import {
  FilesetResolver,
  HandLandmarker,
  type NormalizedLandmark,
} from '@mediapipe/tasks-vision';

const WASM_BASE =
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.34/wasm';
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

export type Handedness = 'Left' | 'Right';

export interface Point2 {
  x: number;
  y: number;
}

export interface HandSnapshot {
  handedness: Handedness;
  /** 21 landmarks in screen pixel coords (X already mirrored). */
  landmarks: Point2[];
  indexTip: Point2;
  thumbTip: Point2;
  palmCenter: Point2;
  /** Rough palm size in px — distance wrist → middle MCP. */
  palmRadius: number;
  /** Normalized pinch distance: thumb-index gap / palmRadius. */
  pinch: number;
  isPinching: boolean;
  isPointing: boolean;
  isOpen: boolean;
}

export type HandUpdateListener = (hands: HandSnapshot[]) => void;

export class HandTracker {
  private landmarker: HandLandmarker | null = null;
  private video: HTMLVideoElement | null = null;
  private stream: MediaStream | null = null;
  private rafId: number | null = null;
  private listeners = new Set<HandUpdateListener>();
  private lastTs = 0;
  private running = false;

  async init(): Promise<void> {
    if (this.landmarker) return;
    const vision = await FilesetResolver.forVisionTasks(WASM_BASE);
    this.landmarker = await HandLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath: MODEL_URL, delegate: 'GPU' },
      runningMode: 'VIDEO',
      numHands: 2,
    });
  }

  async start(video: HTMLVideoElement): Promise<void> {
    if (!this.landmarker) await this.init();
    if (this.running) return;
    this.video = video;
    this.stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: 640, height: 480 },
      audio: false,
    });
    video.srcObject = this.stream;
    video.playsInline = true;
    await video.play();
    this.running = true;
    this.tick();
  }

  stop(): void {
    this.running = false;
    if (this.rafId != null) cancelAnimationFrame(this.rafId);
    this.rafId = null;
    if (this.stream) {
      for (const track of this.stream.getTracks()) track.stop();
      this.stream = null;
    }
    if (this.video) {
      this.video.srcObject = null;
      this.video = null;
    }
    this.emit([]);
  }

  subscribe(fn: HandUpdateListener): () => void {
    this.listeners.add(fn);
    return () => { this.listeners.delete(fn); };
  }

  private emit(hands: HandSnapshot[]): void {
    for (const fn of this.listeners) fn(hands);
  }

  private tick = (): void => {
    if (!this.running || !this.landmarker || !this.video) return;
    // Only run detection when the video has advanced to a new frame.
    const ts = this.video.currentTime;
    if (ts !== this.lastTs && this.video.readyState >= 2) {
      this.lastTs = ts;
      const result = this.landmarker.detectForVideo(
        this.video,
        performance.now(),
      );
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const snapshots: HandSnapshot[] = [];
      if (result.landmarks && result.landmarks.length > 0) {
        for (let i = 0; i < result.landmarks.length; i++) {
          const lm = result.landmarks[i];
          const rawHanded =
            result.handednesses?.[i]?.[0]?.categoryName ?? 'Right';
          snapshots.push(buildSnapshot(lm, rawHanded as Handedness, vw, vh));
        }
      }
      this.emit(snapshots);
    }
    this.rafId = requestAnimationFrame(this.tick);
  };
}

function buildSnapshot(
  lm: NormalizedLandmark[],
  handedness: Handedness,
  vw: number,
  vh: number,
): HandSnapshot {
  // Mirror X so the sprite-space math matches the mirrored preview.
  const pts: Point2[] = lm.map((p) => ({
    x: (1 - p.x) * vw,
    y: p.y * vh,
  }));

  const wrist = pts[0];
  const middleMcp = pts[9];
  const palmRadius = dist(wrist, middleMcp);
  // Palm centre: midpoint of wrist and middle MCP, tolerable proxy.
  const palmCenter: Point2 = {
    x: (wrist.x + middleMcp.x) / 2,
    y: (wrist.y + middleMcp.y) / 2,
  };

  const thumbTip = pts[4];
  const indexTip = pts[8];
  const pinchPx = dist(thumbTip, indexTip);
  const pinch = palmRadius > 0 ? pinchPx / palmRadius : 1;
  const isPinching = pinch < 0.35;

  // Finger extension: tip farther from wrist than the PIP joint by a
  // healthy margin → that finger is straight.
  const extIndex  = isExtended(pts[0], pts[6],  pts[8]);
  const extMid    = isExtended(pts[0], pts[10], pts[12]);
  const extRing   = isExtended(pts[0], pts[14], pts[16]);
  const extPinky  = isExtended(pts[0], pts[18], pts[20]);

  // Pointing: only the index is extended.
  const isPointing = extIndex && !extMid && !extRing && !extPinky && !isPinching;
  // Open palm: all four non-thumb fingers extended and the fingers
  // are splayed (so a claw-fist doesn't count).
  const spread = dist(pts[8], pts[20]); // index tip to pinky tip
  const isOpen =
    extIndex && extMid && extRing && extPinky && spread > palmRadius * 1.4;

  return {
    handedness,
    landmarks: pts,
    indexTip,
    thumbTip,
    palmCenter,
    palmRadius,
    pinch,
    isPinching,
    isPointing,
    isOpen,
  };
}

function dist(a: Point2, b: Point2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function isExtended(wrist: Point2, pip: Point2, tip: Point2): boolean {
  return dist(tip, wrist) > dist(pip, wrist) * 1.12;
}
