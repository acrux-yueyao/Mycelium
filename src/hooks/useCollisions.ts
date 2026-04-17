/**
 * useCollisions — per-frame proximity check; fires callback when two entities
 * stay within threshold. When held >= HYBRID_THRESHOLD_SEC, triggers hybrid.
 * STEP 2 STUB. Step 8 will implement.
 */
import type { ConnectionEndpoint as EntityRef } from '../core/connections';

export interface CollisionEvent {
  a: EntityRef;
  b: EntityRef;
  heldSeconds: number;
}

export function useCollisions(
  _entities: EntityRef[],
  _onConnect: (e: CollisionEvent) => void
) {
  // stub: Step 8 will install a RAF loop with spatial hash
}
