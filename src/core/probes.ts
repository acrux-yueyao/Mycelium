/**
 * Exploratory probes — thin transient filaments each mushroom sends
 * into nearby empty space, independent of any pair-connection.
 *
 * A probe sprouts from a mushroom's silhouette at a random outward
 * angle, extends a short distance, lingers briefly, then retracts.
 * Its visual lifecycle mirrors a connection:
 *   bornAt + 0                   → sprout (pathLength 0 → 1)
 *   bornAt + growMs              → steady
 *   bornAt + growMs + stableMs   → retract begins
 *   bornAt + growMs + stableMs + retractMs → removed
 *
 * Probes exist to sell the "always searching" brief: mushrooms don't
 * just form pair-connections and rest — they keep putting out new
 * tentative hyphae in other directions.
 */
export interface ExplorationProbe {
  id: string;
  originId: string;   // mushroom the probe is attached to
  angle: number;      // outward angle in radians from mushroom center
  length: number;     // reach in pixels from mushroom silhouette
  curvature: number;  // perpendicular sway amount (signed)
  bornAt: number;     // performance.now()
  growMs: number;
  stableMs: number;
  retractMs: number;
}

export const PROBE_ANCHOR_R = 72;

export function probeTotalMs(p: ExplorationProbe): number {
  return p.growMs + p.stableMs + p.retractMs;
}

export function probePhase(p: ExplorationProbe, now: number): {
  phase: 'growing' | 'stable' | 'retracting' | 'expired';
  /** 0..1 within the current phase */
  localT: number;
} {
  const t = now - p.bornAt;
  if (t < p.growMs) return { phase: 'growing', localT: t / p.growMs };
  const t2 = t - p.growMs;
  if (t2 < p.stableMs) return { phase: 'stable', localT: t2 / p.stableMs };
  const t3 = t2 - p.stableMs;
  if (t3 < p.retractMs) return { phase: 'retracting', localT: t3 / p.retractMs };
  return { phase: 'expired', localT: 1 };
}

/**
 * Roll a new probe for an entity.
 * `avoidAngles` are radians to stay away from (e.g. directions of
 * existing connections) so probes don't overlap tendrils.
 */
export function rollProbe(
  entityId: string,
  now: number,
  avoidAngles: number[],
): ExplorationProbe {
  // Try up to 12 random angles; pick the first that's at least 35°
  // away from every avoidAngle.
  let angle = Math.random() * Math.PI * 2;
  const MIN_ANGLE_GAP = (35 * Math.PI) / 180;
  for (let attempt = 0; attempt < 12; attempt++) {
    const tryAngle = Math.random() * Math.PI * 2;
    let ok = true;
    for (const a of avoidAngles) {
      let diff = Math.abs(tryAngle - a);
      if (diff > Math.PI) diff = 2 * Math.PI - diff;
      if (diff < MIN_ANGLE_GAP) { ok = false; break; }
    }
    if (ok) { angle = tryAngle; break; }
  }
  const length = 55 + Math.random() * 65;           // 55..120 px
  const curvature = (Math.random() - 0.5) * 28;     // ±14 perpendicular sway
  return {
    id: `pb-${entityId}-${Math.floor(Math.random() * 1e9).toString(36)}`,
    originId: entityId,
    angle,
    length,
    curvature,
    bornAt: now,
    growMs: 2600 + Math.random() * 900,    // very slow sprout: 2.6-3.5s
    stableMs: 900 + Math.random() * 900,   // hold 0.9-1.8s
    retractMs: 1600 + Math.random() * 600, // retract 1.6-2.2s
  };
}
