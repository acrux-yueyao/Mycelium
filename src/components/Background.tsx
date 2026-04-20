/**
 * Cream paper stage with scattered crayon polka dots.
 *
 * Stacking (back → front):
 *   1. Base gradient     a very light cream radial, almost flat.
 *   2. Warm wash         large, low-frequency turbulence tinted
 *                        peach; soft-light blend for a gentle warm
 *                        shimmer across the scene.
 *   3. Crayon dots       scattered warm dots, pushed through a
 *                        displacement filter so the circles wobble
 *                        like crayon on paper — not CSS-geometric.
 *   4. Paper mottle      mid-frequency turbulence blurred out,
 *                        multiplied in as cloudy patches.
 *   5. Fine grain        high-frequency turbulence, multiplied at
 *                        very low alpha — the paper/film grain.
 *   6. Soft vignette     almost invisible corner fall-off.
 */
import { useEffect, useMemo } from 'react';
import { readTimeMood } from '../core/timeMood';

export function Background() {
  // Read the time-of-day mood once on mount (and any time the URL
  // query changes are handled by a full reload, which is the Vite
  // dev workflow). paletteShift ∈ [-1..+1] is written to the root
  // as a CSS variable so styles.css can color-mix between the cool
  // and warm palette ends without any JS on the render path.
  const mood = useMemo(() => readTimeMood(), []);
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--palette-shift', String(mood.paletteShift));
    root.style.setProperty('--vibration-gain', String(mood.vibrationGain));
    root.classList.toggle('mood-exam', mood.isExamWeek);
    return () => {
      root.style.removeProperty('--palette-shift');
      root.style.removeProperty('--vibration-gain');
      root.classList.remove('mood-exam');
    };
  }, [mood]);

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
              values="0 0 0 0 0.84
                      0 0 0 0 0.74
                      0 0 0 0 0.58
                      0 0 0 0.03 0"
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
              values="0 0 0 0 0.90
                      0 0 0 0 0.82
                      0 0 0 0 0.70
                      0 0 0 0.07 0"
            />
          </filter>

          {/* Very large-scale warm wash. */}
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
                      0 0 0 0 0.86
                      0 0 0 0 0.74
                      0 0 0 0.06 0"
            />
          </filter>

          {/* Crayon wobble — displaces a shape along a low-frequency
               noise field so circular edges read as hand-drawn. */}
          <filter id="crayonWobble" x="-10%" y="-10%" width="120%" height="120%">
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.9"
              numOctaves="2"
              seed="7"
              result="noise"
            />
            <feDisplacementMap
              in="SourceGraphic"
              in2="noise"
              scale="2.2"
              xChannelSelector="R"
              yChannelSelector="G"
            />
          </filter>

          {/* Scattered polka-dot pattern. One 260×260 tile with a few
               circles placed irregularly, rotated so the repeat is
               hard to detect. Rendered through crayonWobble so the
               edges aren't perfectly circular. */}
          <pattern
            id="crayonDots"
            patternUnits="userSpaceOnUse"
            width="260"
            height="260"
            patternTransform="rotate(8)"
          >
            <circle cx="38"  cy="52"  r="7"   fill="#E9CFA0" opacity="0.55" />
            <circle cx="142" cy="28"  r="4.5" fill="#F0C9A2" opacity="0.45" />
            <circle cx="208" cy="96"  r="8"   fill="#E9CFA0" opacity="0.50" />
            <circle cx="72"  cy="142" r="5.5" fill="#EDD2A8" opacity="0.45" />
            <circle cx="185" cy="195" r="6.5" fill="#E9CFA0" opacity="0.55" />
            <circle cx="30"  cy="228" r="4"   fill="#F0C9A2" opacity="0.40" />
            <circle cx="118" cy="212" r="3.5" fill="#E9CFA0" opacity="0.38" />
            <circle cx="242" cy="155" r="3"   fill="#EDD2A8" opacity="0.42" />
            <circle cx="96"  cy="88"  r="3"   fill="#F0C9A2" opacity="0.35" />
          </pattern>
        </defs>
      </svg>

      <div className="stage-bg" aria-hidden>
        <div className="stage-warm-wash" />
        <div className="stage-dots">
          <svg>
            <rect
              width="100%"
              height="100%"
              fill="url(#crayonDots)"
              filter="url(#crayonWobble)"
            />
          </svg>
        </div>
        <div className="stage-mottle" />
        <div className="stage-grain" />
        <div className="stage-vignette" />
      </div>
    </>
  );
}
