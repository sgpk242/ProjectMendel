'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

export type CompoundItem = {
  id: string;
  name: string;
  description: string | null;
  context: string | null;
  relevanceScore: number | null;
  interestRating: number | null;
};

type Props = {
  compounds: CompoundItem[];
};

function InterestRating({
  compoundId,
  rating,
}: {
  compoundId: string;
  rating: number | null;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [hovered, setHovered] = useState<number | null>(null);

  async function setRating(value: number | null) {
    setSaving(true);
    await fetch(`/api/product-ideas/${compoundId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ interest_rating: value }),
    });
    setSaving(false);
    router.refresh();
  }

  // Highlight every dot up to and including the hovered one, not just the
  // one under the cursor — falls back to the saved rating when not hovering.
  const highlightThrough = hovered ?? rating;

  return (
    <span
      className={`inline-flex gap-0.5 ${saving ? 'opacity-50' : ''}`}
      onMouseLeave={() => setHovered(null)}
    >
      {[1, 2, 3, 4, 5].map((i) => (
        <button
          key={i}
          onClick={() => setRating(rating === i ? null : i)}
          onMouseEnter={() => setHovered(i)}
          disabled={saving}
          className="relative"
          title={rating === i ? 'Clear rating' : `Rate ${i}/5`}
        >
          <span
            className={`inline-block h-2 w-2 rounded-full transition-colors ${
              highlightThrough !== null && i <= highlightThrough
                ? 'bg-accent'
                : 'bg-border'
            }`}
          />
        </button>
      ))}
    </span>
  );
}

export function CompoundList({ compounds }: Props) {
  if (compounds.length === 0) {
    return (
      <p className="text-sm text-muted">
        No biomanufacturing compounds were identified in this source.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {compounds.map((compound) => {
        // A product details page exists for any compound, but it's only
        // worth visiting once it's been rated — matches the Product Idea
        // Radar tile only surfacing rated compounds.
        const hasProductPage = compound.interestRating !== null;

        return (
          <div
            key={compound.id}
            className={`rounded-md border border-border px-3 py-2 transition-colors ${
              hasProductPage ? 'hover:border-accent/50' : ''
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              {hasProductPage ? (
                <Link
                  href={`/product/${compound.id}`}
                  className="text-sm font-medium text-accent hover:underline"
                >
                  {compound.name}
                </Link>
              ) : (
                <span className="text-sm font-medium">{compound.name}</span>
              )}
              <div className="flex items-center gap-3">
                {compound.relevanceScore !== null && (
                  <span className="rounded bg-accent/10 px-1.5 py-0.5 text-xs text-accent">
                    {Math.round(compound.relevanceScore * 100)}%
                  </span>
                )}
                <InterestRating compoundId={compound.id} rating={compound.interestRating} />
              </div>
            </div>
            {compound.description && (
              <p className="mt-1 text-xs text-muted">{compound.description}</p>
            )}
            {compound.context && (
              <p className="mt-1 text-xs italic text-muted/80">&ldquo;{compound.context}&rdquo;</p>
            )}
          </div>
        );
      })}
    </div>
  );
}
