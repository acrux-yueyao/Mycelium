/**
 * Cream paper stage. Five soft layers to get the "time-worn paper"
 * feel described in the brief — warm, low-contrast, quiet, with an
 * invisible breathing to it:
 *
 *   1. Base gradient         a very soft cream radial, almost flat.
 *   2. Warm wash             large, low-frequency turbulence tinted
 *                            in peach; soft-light blend for a gentle
 *                            warm shimmer across the scene.
 *   3. Paper mottle          mid-frequency turbulence blurred out,
 *                            multiplied in as cloudy patches.
 *   4. Fine grain            high-frequency turbulence, multiplied at
 *                            very low alpha — the paper/film grain.
 *   5. Soft vignette         almost invisible corner fall-off so
 *                            centered content sits lit from within.
 *
 * All turbulence patterns are non-repeating and pointer-events: none.
 */
export function Background() {
  return (
    <>
      <svg width="0" height="0" style={{ position: 'absolute' }}>
        <defs>
          {/* Fine paper grain — very high frequency noise, tiny amount. */}
          <filter id="paperGrainFine" x="0" y="0" width="100%" height="100%">
            <feTurbulence
              type="fractalNoise"
              baseFrequency="1.4"
              numOctaves="2"
              seed="11"
              stitchTiles="noStitch"
            />
            <feColorMatrix
              values="0 0 0 0 0.80
                      0 0 0 0 0.70
                      0 0 0 0 0.55
                      0 0 0 0.04 0"
            />
          </filter>

          {/* Mid-frequency cloud mottling — blurred out to read as
               gentle patches rather than speckle. */}
          <filter id="paperMottle" x="0" y="0" width="100%" height="100%">
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.006"
              numOctaves="3"
              seed="29"
              stitchTiles="noStitch"
            />
            <feGaussianBlur stdDeviation="3" />
            <feColorMatrix
              values="0 0 0 0 0.86
                      0 0 0 0 0.76
                      0 0 0 0 0.64
                      0 0 0 0.10 0"
            />
          </filter>

          {/* Very large-scale warm wash: slow peach mottle across the
               whole page, blended soft-light so it warms without
               darkening anything noticeably. */}
          <filter id="warmWash" x="0" y="0" width="100%" height="100%">
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.002"
              numOctaves="2"
              seed="41"
              stitchTiles="noStitch"
            />
            <feGaussianBlur stdDeviation="10" />
            <feColorMatrix
              values="0 0 0 0 1.00
                      0 0 0 0 0.84
                      0 0 0 0 0.72
                      0 0 0 0.08 0"
            />
          </filter>
        </defs>
      </svg>

      <div className="stage-bg" aria-hidden>
        <div className="stage-warm-wash" />
        <div className="stage-mottle" />
        <div className="stage-grain" />
        <div className="stage-vignette" />
      </div>
    </>
  );
}
