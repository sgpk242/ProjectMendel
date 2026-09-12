'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

/**
 * Five-dot interest rating. Click a dot to set that rating; click the dot
 * that's already active to clear it (rating → null). PATCHes
 * `/api/source/[id]` and refreshes. Shared by the dashboard card and the
 * detail page's rating editor (`showLabels` + `size="lg"` there).
 */
export function QuickRating({
  sourceId,
  rating,
  size = 'sm',
  showLabels = false,
}: {
  sourceId: string;
  rating: number | null;
  size?: 'sm' | 'lg';
  showLabels?: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

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

  const dotSize = size === 'lg' ? 'h-3.5 w-3.5' : 'h-2 w-2';
  const gap = size === 'lg' ? 'gap-1.5' : 'gap-1';

  return (
    <div className="flex items-center gap-2">
      {showLabels ? <span className="text-xs text-muted">Low</span> : null}
      <div
        className={`flex items-center ${gap}`}
        title={rating ? `Interest: ${rating}/5` : 'Not rated'}
      >
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            disabled={pending}
            onClick={() => setRating(rating === n ? null : n)}
            aria-label={`Rate ${n} of 5`}
            aria-pressed={rating !== null && n <= rating}
            className={`cursor-pointer rounded-full ${dotSize} transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
              rating !== null && n <= rating ? 'bg-accent hover:opacity-80' : 'bg-border hover:bg-muted'
            }`}
          />
        ))}
      </div>
      {showLabels ? <span className="text-xs text-muted">High</span> : null}
    </div>
  );
}
