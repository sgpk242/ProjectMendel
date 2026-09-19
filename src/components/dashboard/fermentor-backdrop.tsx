/**
 * Decorative "inside a bioreactor" background for the dashboard, rendered
 * behind the nav+content by `PageShell`'s `backdrop` prop. Pure CSS/markup —
 * no client JS, no state — so it costs nothing to render and never needs
 * hydration.
 *
 * Physics / look:
 * - Terminal velocity ∝ √d (turbulent regime for gas bubbles in liquid),
 *   so animation duration ∝ 1/√d — big bubbles rise fast, small ones linger.
 * - Small bubbles (<10px) drift gently; medium (10-20px) zigzag from vortex
 *   shedding; large (>20px) oscillate widely from turbulent wake instability.
 * - Bubbles grow (scale 0.06→1) as they rise (gas expansion as hydrostatic
 *   pressure drops), and are near-white/high-contrast against the amber broth.
 * - A soft "eddies" layer drifts/rotates slowly beneath everything for
 *   large-scale churn.
 * - A dense foam band of near-white bubbles sits at the surface; each pops
 *   and jitters on its own randomized period, so the froth never loops.
 * - The broth's overflow:hidden clips rising bubbles at the surface.
 *
 * Layout is driven by `--broth-surface` (defined on `.fermentor-root` in
 * globals.css).
 */

type Bubble = {
  left: string;
  top: string;
  size: number;
  delay: string;
  duration: string;
  variant: 'a' | 'b' | 'c' | 'd' | 'e';
};

type Foam = {
  left: string;
  top: string;
  size: number;
  delay: string;
  duration: string;
  variant: 'p' | 'q' | 'r';
};

function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

function generateBubbles(count: number): Bubble[] {
  const rand = seededRandom(42);
  const bubbles: Bubble[] = [];

  for (let i = 0; i < count; i++) {
    const left = +(rand() * 96 + 2).toFixed(1);
    const top = +(rand() * 92 + 4).toFixed(1);
    // Power curve widens the size spread (more small, but a real tail of big
    // ones) so it reads as turbulence rather than uniform carbonation.
    const size = +(2 + Math.pow(rand(), 0.7) * 32).toFixed(1);

    // v_terminal ∝ √d → duration ∝ 1/√d, with ±15% random variation
    const baseDuration = 13 / Math.sqrt(size / 3);
    const duration = +(baseDuration * (0.85 + rand() * 0.3)).toFixed(1);

    const delay = +(rand() * 15).toFixed(1);

    let variant: Bubble['variant'];
    if (size < 10) variant = rand() < 0.5 ? 'a' : 'b';
    else if (size < 20) variant = rand() < 0.5 ? 'c' : 'd';
    else variant = 'e';

    bubbles.push({
      left: `${left}%`,
      top: `${top}%`,
      size,
      delay: `${delay}s`,
      duration: `${duration}s`,
      variant,
    });
  }

  return bubbles;
}

function generateFoam(count: number): Foam[] {
  const rand = seededRandom(1337);
  const variants: Array<Foam['variant']> = ['p', 'q', 'r'];
  const foam: Foam[] = [];

  for (let i = 0; i < count; i++) {
    const left = +(rand() * 100).toFixed(1);
    // Power bias clusters foam tight against the very top (the surface).
    const top = +(Math.pow(rand(), 1.6) * 100).toFixed(1);
    const size = +(3 + rand() * 11).toFixed(1);
    // Non-uniform periods so hundreds of foam bubbles never sync into a loop.
    const duration = +(1.8 + rand() * 3.4).toFixed(2);
    const delay = +(rand() * 6).toFixed(2);
    const variant = variants[Math.floor(rand() * 3)];

    foam.push({
      left: `${left}%`,
      top: `${top}%`,
      size,
      delay: `${delay}s`,
      duration: `${duration}s`,
      variant,
    });
  }

  return foam;
}

const BUBBLES = generateBubbles(2500);
const FOAM = generateFoam(450);

export function FermentorBackdrop() {
  return (
    <div className="fermentor-root h-full w-full">
      <div className="fermentor-metal" />
      <div className="fermentor-broth">
        <div className="fermentor-eddies" />
        <div className="fermentor-bubbles">
          {BUBBLES.map((b, i) => (
            <span
              key={i}
              className={`fermentor-bubble fermentor-bubble-${b.variant}`}
              style={{
                left: b.left,
                top: b.top,
                width: b.size,
                height: b.size,
                animationDelay: b.delay,
                animationDuration: b.duration,
              }}
            />
          ))}
        </div>
        <div className="fermentor-foam-band">
          {FOAM.map((f, i) => (
            <span
              key={i}
              className={`fermentor-foam fermentor-foam-${f.variant}`}
              style={{
                left: f.left,
                top: f.top,
                width: f.size,
                height: f.size,
                animationDelay: f.delay,
                animationDuration: f.duration,
              }}
            />
          ))}
        </div>
      </div>
      <div className="fermentor-surface">
        <span className="fermentor-ripple fermentor-ripple-1" />
        <span className="fermentor-ripple fermentor-ripple-2" />
        <span className="fermentor-ripple fermentor-ripple-3" />
      </div>
    </div>
  );
}
