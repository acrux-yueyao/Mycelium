/**
 * Time-of-day mood. Maps the current hour (plus an optional
 * "exam week" override) to a small bundle of visual tuning knobs
 * that other layers read — background palette, per-entity vibration,
 * spawn-density hints.
 *
 * Overrides via URL:
 *   ?hour=2        force the hour (0..23) for demo/screenshot work
 *   ?mood=exam     force exam-week mode
 */

export type TimeBucket = 'late-night' | 'morning' | 'afternoon' | 'evening';

export interface TimeMood {
  hour: number;
  bucket: TimeBucket;
  /** -1 = cool/blue end, +1 = warm/amber end. Background blends between two palettes. */
  paletteShift: number;
  /** Multiplier applied to per-entity wobble/breathe amplitude. */
  vibrationGain: number;
  /** Rough "how busy should the stage feel" hint in [0..1]. */
  spawnDensityHint: number;
  isExamWeek: boolean;
}

/** Read the current mood, honouring URL overrides when present. */
export function readTimeMood(now: Date = new Date()): TimeMood {
  const params =
    typeof window !== 'undefined'
      ? new URLSearchParams(window.location.search)
      : new URLSearchParams();

  const hourParam = params.get('hour');
  const forcedHour = hourParam != null ? clampInt(parseInt(hourParam, 10), 0, 23) : null;
  const hour = forcedHour != null ? forcedHour : now.getHours();

  const isExamWeek = params.get('mood') === 'exam';

  const bucket = bucketForHour(hour);
  const base = baseMoodForBucket(bucket);

  // Exam week shifts cold and amps vibration — compounded on top of
  // whatever the hour already said.
  if (isExamWeek) {
    return {
      hour,
      bucket,
      paletteShift: clamp(base.paletteShift - 0.55, -1, 1),
      vibrationGain: base.vibrationGain * 1.55,
      spawnDensityHint: Math.min(1, base.spawnDensityHint + 0.15),
      isExamWeek,
    };
  }

  return {
    hour,
    bucket,
    paletteShift: base.paletteShift,
    vibrationGain: base.vibrationGain,
    spawnDensityHint: base.spawnDensityHint,
    isExamWeek: false,
  };
}

function bucketForHour(h: number): TimeBucket {
  if (h < 5) return 'late-night';
  if (h < 12) return 'morning';
  if (h < 18) return 'afternoon';
  return 'evening';
}

function baseMoodForBucket(b: TimeBucket) {
  switch (b) {
    // Few but luminous — fine crisp tendrils at 2am per the vision.
    case 'late-night': return { paletteShift: -0.55, vibrationGain: 0.7,  spawnDensityHint: 0.25 };
    // Cool-neutral morning, gentle activity.
    case 'morning':    return { paletteShift: -0.1,  vibrationGain: 1.0,  spawnDensityHint: 0.55 };
    // Busiest + warmest — "4pm, dense and lively" per the vision.
    case 'afternoon':  return { paletteShift: 0.6,   vibrationGain: 1.05, spawnDensityHint: 0.85 };
    // Warm winding-down.
    case 'evening':    return { paletteShift: 0.25,  vibrationGain: 0.9,  spawnDensityHint: 0.6  };
  }
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function clampInt(n: number, lo: number, hi: number): number {
  if (!Number.isFinite(n)) return lo;
  return Math.max(lo, Math.min(hi, Math.round(n)));
}
