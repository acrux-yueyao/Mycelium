/**
 * scanRecord — deterministic "field scan" metadata for a creature.
 *
 * The Beautiful Worlds visual language labels every specimen like a
 * biological survey record: an id, a capture time/date, and geographic
 * coordinates. None of that is real — it's fabricated deterministically
 * from the creature's id (via seed.ts's xmur3) plus its birth time, so
 * the same creature always shows the same coordinates on every machine.
 */
import { xmur3, Rng } from './seed';

export interface ScanRecord {
  /** zero-padded serial, e.g. "07". */
  serial: string;
  /** "51.5449 N" */
  lat: string;
  /** "-0.0623 E" */
  lon: string;
  /** "21:47" */
  time: string;
  /** "05-07" */
  date: string;
}

// Field origin (a plausible parkland lat/long the whole colony scatters
// around — mirrors the reference's 51.5xxx N / -0.0xxx E readouts).
const ORIGIN_LAT = 51.5448;
const ORIGIN_LON = -0.0589;

function pad2(n: number): string {
  return (n < 10 ? '0' : '') + n;
}

/**
 * Build a scan record. `serialIndex` is the creature's position in the
 * colony (1-based) when known; falls back to a hash-derived number.
 */
export function scanRecord(id: string, bornAt: number, serialIndex?: number): ScanRecord {
  const r = new Rng(xmur3(`${id}:scan`)());
  const serialN = serialIndex != null ? serialIndex : 1 + r.int(0, 99);
  const lat = ORIGIN_LAT + r.range(-0.0018, 0.0018);
  const lon = ORIGIN_LON + r.range(-0.0075, 0.0075);

  const d = new Date(bornAt);
  const hh = pad2(d.getHours());
  const mm = pad2(d.getMinutes());
  const mo = pad2(d.getMonth() + 1);
  const da = pad2(d.getDate());

  return {
    serial: pad2(serialN),
    lat: `${lat.toFixed(4)} N`,
    lon: `${lon.toFixed(4)} E`,
    time: `${hh}:${mm}`,
    date: `${mo}-${da}`,
  };
}
