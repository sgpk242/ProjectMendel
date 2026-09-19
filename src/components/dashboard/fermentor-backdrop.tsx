/**
 * Decorative "inside a bioreactor" background for the dashboard, rendered
 * behind the nav+content by `PageShell`'s `backdrop` prop. Pure CSS/markup —
 * no client JS, no state — so it costs nothing to render and never needs
 * hydration.
 *
 * Physics model:
 * - Terminal velocity ∝ √d (turbulent regime for gas bubbles in liquid),
 *   so animation duration ∝ 1/√d — big bubbles rise fast, small ones linger.
 * - Small bubbles (<10px) drift gently (Stokes regime, near-straight path).
 * - Medium bubbles (10-20px) zigzag from vortex shedding.
 * - Large bubbles (>20px) oscillate widely from turbulent wake instability.
 * - All bubbles start at scale(0.06-0.1) and grow to full size as they rise,
 *   simulating gas expansion from decreasing hydrostatic pressure.
 * - Bubbles are distributed randomly throughout the liquid column. The broth
 *   container's overflow:hidden clips them at the surface — no opacity
 *   fade-out needed.
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
    const top = +(rand() * 90 + 5).toFixed(1);
    const size = +(rand() * 27 + 3).toFixed(1);

    // v_terminal ∝ √d → duration ∝ 1/√d, with ±15% random variation
    const baseDuration = 14 / Math.sqrt(size / 3);
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

const BUBBLES = generateBubbles(1200);

export function FermentorBackdrop() {
  return (
    <div className="fermentor-root h-full w-full">
      <div className="fermentor-metal" />
      <div className="fermentor-broth">
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
      </div>
      <div className="fermentor-surface" />
    </div>
  );
}
