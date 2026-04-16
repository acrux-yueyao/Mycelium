/**
 * Cream-backed stage. A soft radial vignette darkens the corners so that
 * entities centered on screen feel lit from within. Subtle grain texture
 * is produced via an inline SVG feTurbulence filter.
 */
export function Background() {
  return (
    <>
      <svg width="0" height="0" style={{ position: 'absolute' }}>
        <filter id="paperGrain">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.8"
            numOctaves="2"
            seed="7"
          />
          <feColorMatrix values="0 0 0 0 0.95  0 0 0 0 0.92  0 0 0 0 0.86  0 0 0 0.035 0" />
        </filter>
      </svg>

      <div className="stage-bg" aria-hidden>
        <div className="stage-grain" />
        <div className="stage-vignette" />
      </div>
    </>
  );
}
