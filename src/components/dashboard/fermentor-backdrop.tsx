/**
 * Decorative "inside a bioreactor" background for the dashboard, rendered
 * behind the nav+content by `PageShell`'s `backdrop` prop. Pure CSS/markup —
 * no client JS, no state — so it costs nothing to render and never needs
 * hydration.
 *
 * Bubble positions/sizes/timings are generated from a deterministic seeded
 * LCG so server renders are stable.
 *
 * Layout is driven by `--broth-surface` (defined on `.fermentor-root` in
 * globals.css) — the distance from the top of the page down to the top of
 * the first dashboard tile row, i.e. where the broth's surface sits.
 */

type Bubble = {
  left: string;
  top: string;
  size: number;
  delay: string;
  duration: string;
  variant: 'a' | 'b' | 'c';
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
  const variants: Array<'a' | 'b' | 'c'> = ['a', 'b', 'c'];
  const bubbles: Bubble[] = [];

  for (let i = 0; i < count; i++) {
    const left = (rand() * 96 + 2).toFixed(1);
    const top = (rand() * 80 + 3).toFixed(1);
    const size = Math.round(rand() * 18 + 6);
    const delay = (rand() * 8).toFixed(1);
    const duration = (rand() * 4 + 5).toFixed(1);
    const variant = variants[Math.floor(rand() * 3)];

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

const BUBBLES = generateBubbles(55);

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
