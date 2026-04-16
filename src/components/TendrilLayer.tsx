/**
 * TendrilLayer — SVG overlay drawing curved tendrils between nearby entities.
 * STEP 2 STUB. Step 6 will implement bezier paths + soft glow filter.
 */
export interface EntityRef {
  id: string;
  charId: number;
  x: number;
  y: number;
}

export interface Connection {
  id: string;
  a: EntityRef;
  b: EntityRef;
  bornAt: number;
}

export interface TendrilLayerProps {
  entities: EntityRef[];
  connections: Connection[];
}

export function TendrilLayer(_props: TendrilLayerProps) {
  return (
    <svg
      className="overlay-layer"
      width="100%"
      height="100%"
      aria-hidden
    />
  );
}
