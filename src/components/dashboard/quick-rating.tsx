'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

/**
 * Five-dot interest rating for the source detail page (`RatingEditor`).
 * Hovering dot N previews the rating by filling dots 1 through N with
 * accent green — falling back to the saved rating when not hovering — the
 * same interaction as the biochemical-product rating dots in
 * `compound-list.tsx`. Click a dot to set that rating; click the
 * already-active dot to clear it. PATCHes `/api/source/[id]` and
 * refreshes.
 */
export function QuickRating({
  sourceId,
  rating,
  showLabels = false,
}: {
  sourceId: string;
  rating: number | null;
  showLabels?: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [hovered, setHovered] = useState<number | null>(null);

  async function setRating(next: number | null) {
    setPending(true);
    try {
      const response = await fetch(`/api/source/${sourceId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ interest_rating: next }),
      });
      if (response.ok) router.refresh();
    } finally {
      setPending(false);
    }
  }

  const highlightThrough = hovered ?? rating;

  return (
    <div className="flex items-center gap-2">
      {showLabels ? <span className="text-xs text-muted">Low</span> : null}
      <div className="flex items-center gap-1.5" onMouseLeave={() => setHovered(null)}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            disabled={pending}
            onClick={() => setRating(rating === n ? null : n)}
            onMouseEnter={() => setHovered(n)}
            aria-label={`Rate ${n} of 5`}
            aria-pressed={rating !== null && n <= rating}
            className={`h-3.5 w-3.5 cursor-pointer rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
              highlightThrough !== null && n <= highlightThrough ? 'bg-accent' : 'bg-border'
            }`}
          />
        ))}
      </div>
      {showLabels ? <span className="text-xs text-muted">High</span> : null}
    </div>
  );
}
