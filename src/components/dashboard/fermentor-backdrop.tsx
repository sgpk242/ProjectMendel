/**
 * Decorative "inside a bioreactor" background for the dashboard, rendered
 * behind the nav+content by `PageShell`'s `backdrop` prop. Pure CSS/markup —
 * no client JS, no state — so it costs nothing to render and never needs
 * hydration. Bubble positions/timings are hand-picked (not `Math.random()`)
 * so server renders are deterministic.
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
};

// Hand-placed rather than randomized: deterministic across server renders,
// and "lightly bubbling" wants a sparse, intentional scatter rather than a
// dense field.
const BUBBLES: Bubble[] = [
  { left: '6%', top: '4%', size: 5, delay: '0s', duration: '6.5s' },
  { left: '14%', top: '18%', size: 3, delay: '1.4s', duration: '5.2s' },
  { left: '22%', top: '9%', size: 6, delay: '2.8s', duration: '7.1s' },
  { left: '31%', top: '24%', size: 4, delay: '0.6s', duration: '5.8s' },
  { left: '9%', top: '33%', size: 4, delay: '3.6s', duration: '6.2s' },
  { left: '40%', top: '13%', size: 3, delay: '2.1s', duration: '5.5s' },
  { left: '48%', top: '28%', size: 5, delay: '0.9s', duration: '6.8s' },
  { left: '55%', top: '6%', size: 4, delay: '4.2s', duration: '5.9s' },
  { left: '63%', top: '20%', size: 6, delay: '1.7s', duration: '7.4s' },
  { left: '71%', top: '11%', size: 3, delay: '3.1s', duration: '5.3s' },
  { left: '78%', top: '30%', size: 5, delay: '0.3s', duration: '6.6s' },
  { left: '86%', top: '15%', size: 4, delay: '2.5s', duration: '6.1s' },
  { left: '93%', top: '25%', size: 3, delay: '4.6s', duration: '5.6s' },
  { left: '17%', top: '45%', size: 4, delay: '1.1s', duration: '6.4s' },
  { left: '37%', top: '52%', size: 5, delay: '3.4s', duration: '7.0s' },
  { left: '58%', top: '47%', size: 3, delay: '0.5s', duration: '5.4s' },
  { left: '75%', top: '55%', size: 6, delay: '2.9s', duration: '6.9s' },
  { left: '90%', top: '43%', size: 4, delay: '1.9s', duration: '6.0s' },
  { left: '4%', top: '62%', size: 3, delay: '4.0s', duration: '5.7s' },
  { left: '26%', top: '68%', size: 5, delay: '0.8s', duration: '6.7s' },
  { left: '50%', top: '65%', size: 4, delay: '2.3s', duration: '6.3s' },
  { left: '68%', top: '72%', size: 3, delay: '3.8s', duration: '5.5s' },
  { left: '83%', top: '66%', size: 5, delay: '1.3s', duration: '6.5s' },
  { left: '97%', top: '58%', size: 4, delay: '4.4s', duration: '6.2s' },
];

export function FermentorBackdrop() {
  return (
    <div className="fermentor-root h-full w-full">
      <div className="fermentor-metal" />
      <div className="fermentor-broth">
        <div className="fermentor-bubbles">
          {BUBBLES.map((b, i) => (
            <span
              key={i}
              className="fermentor-bubble"
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
      <div className="fermentor-froth" />
    </div>
  );
}
