/**
 * demoColony — a deterministic placeholder for the accumulated colony.
 *
 * Until the Upstash-backed cross-user history is wired, DitherField needs
 * something to render so the ecology looks populated. This scatters a
 * fixed set of creatures across the field (seeded, so it's identical
 * every load). Once real history exists, it's replaced by the fetched
 * creatures — same FieldCreature shape.
 */
import { Rng, xmur3 } from './seed';
import type { CharId } from '../data/characters';
import type { FieldCreature } from '../components/DitherField';

export function demoColony(count = 48): FieldCreature[] {
  const rng = new Rng(xmur3('demo-colony-v1')());
  const out: FieldCreature[] = [];
  // loose clusters so the colony reads as a datamosh mass, not a grid
  const zones = [
    { x: 0.5, y: 0.44, s: 0.22 },
    { x: 0.66, y: 0.4, s: 0.18 },
    { x: 0.4, y: 0.6, s: 0.18 },
    { x: 0.82, y: 0.5, s: 0.16 },
    { x: 0.55, y: 0.72, s: 0.16 },
  ];
  for (let i = 0; i < count; i++) {
    const z = zones[i % zones.length];
    const cid = rng.int(0, 6) as CharId;
    const density = rng.range(0.45, 0.95);
    out.push({
      id: `demo-${i}`,
      charId: cid,
      morphology: {
        density,
        agitation: rng.range(0.2, 0.6),
        tendrilCount: 5,
        glow: 0.15,
        tintHue: (24 + cid * 47 + rng.range(-30, 30) + 360) % 360,
        particles: false,
      },
      intensity: rng.range(0.3, 0.95),
      x: Math.max(0.04, Math.min(0.96, z.x + rng.range(-z.s, z.s))),
      y: Math.max(0.06, Math.min(0.94, z.y + rng.range(-z.s, z.s))),
      cell: rng.int(3, 8),
    });
  }
  return out;
}
