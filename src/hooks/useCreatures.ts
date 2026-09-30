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

// `?test` — a fully local sandbox: creatures accumulate only in this
// browser tab, never read from or written to the shared store, so it
// costs zero backend memory / API quota. Great for spam-testing the
// whisper → grow → accumulate loop without polluting the real colony.
const TEST_MODE =
  typeof window !== 'undefined' &&
  new URLSearchParams(window.location.search).has('test');

export function useCreatures() {
  // Start EMPTY, not with demo spores: a boot-time placeholder colony put
  // fake creatures on the real tower (and they lingered on the field). The
  // demo colony is now only a fallback when there is no real data at all —
  // backend not configured, the sandbox, or the API unreachable (local dev).
  const [colony, setColony] = useState<FieldCreature[]>(() => (TEST_MODE ? demoColony(9, Date.now()) : []));
  const [population, setPopulation] = useState(6856);
  const [configured, setConfigured] = useState(false);

  useEffect(() => {
    if (TEST_MODE) return; // sandbox: don't touch the backend
    let alive = true;
    // no real data to show → demo colony, but only into an EMPTY field
    const fallback = () => setColony((cur) => (cur.length ? cur : demoColony(9, Date.now())));
    const load = () =>
      fetch('/api/creatures')
        .then((r) => r.json())
        .then((d) => {
          if (!alive) return;
          if (d?.configured) setConfigured(true);
          if (Array.isArray(d?.creatures) && d.creatures.length) {
            setColony(d.creatures.slice(0, MAX_LOCAL));
          } else if (!d?.configured) {
            fallback();
          }
          if (typeof d?.population === 'number' && d.population > 0) {
            setPopulation(d.population);
          }
        })
        .catch(() => { if (alive) fallback(); });
    load();
    // Kiosk panels (the physical tower) keep themselves fresh: creatures
    // whispered from visitors' phones surface within ~20s on every screen.
    const kiosk =
      typeof window !== 'undefined' &&
      new URLSearchParams(window.location.search).has('kiosk');
    const timer = kiosk ? setInterval(load, 20000) : null;
    return () => { alive = false; if (timer) clearInterval(timer); };
  }, []);

  const add = useCallback((c: FieldCreature) => {
    setColony((prev) => [c, ...prev].slice(0, MAX_LOCAL));
    setPopulation((p) => p + 1);
    if (TEST_MODE) return; // sandbox: keep it local, never persist
    fetch('/api/creatures', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ creature: c }),
    })
      .then((r) => r.json())
      .then((d) => { if (typeof d?.population === 'number' && d.population > 0) setPopulation(d.population); })
      .catch(() => {});
  }, []);

  return { colony, population, configured, testMode: TEST_MODE, add };
}
