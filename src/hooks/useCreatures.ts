/**
 * useCreatures — the accumulating cross-user colony.
 *
 * On mount, loads everyone's past creatures from /api/creatures (the
 * Upstash-backed history) so a fresh visitor opens onto the whole
 * accumulated ecology. When the backend isn't configured yet, it falls
 * back to a deterministic local demo colony so the field still looks
 * alive. `add` appends a freshly grown creature — optimistically to the
 * local colony and to the shared store.
 */
import { useCallback, useEffect, useState } from 'react';
import { demoColony } from '../core/demoColony';
import type { FieldCreature } from '../components/DitherField';

const MAX_LOCAL = 500;

export function useCreatures() {
  const [colony, setColony] = useState<FieldCreature[]>(() => demoColony(48));
  const [population, setPopulation] = useState(6856);
  const [configured, setConfigured] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch('/api/creatures')
      .then((r) => r.json())
      .then((d) => {
        if (!alive) return;
        if (d?.configured) setConfigured(true);
        if (Array.isArray(d?.creatures) && d.creatures.length) {
          setColony(d.creatures.slice(0, MAX_LOCAL));
        }
        if (typeof d?.population === 'number' && d.population > 0) {
          setPopulation(d.population);
        }
      })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  const add = useCallback((c: FieldCreature) => {
    setColony((prev) => [c, ...prev].slice(0, MAX_LOCAL));
    setPopulation((p) => p + 1);
    fetch('/api/creatures', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ creature: c }),
    })
      .then((r) => r.json())
      .then((d) => { if (typeof d?.population === 'number' && d.population > 0) setPopulation(d.population); })
      .catch(() => {});
  }, []);

  return { colony, population, configured, add };
}
