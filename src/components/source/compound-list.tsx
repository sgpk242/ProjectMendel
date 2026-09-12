'use client';

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

  return (
    <span className={`inline-flex gap-0.5 ${saving ? 'opacity-50' : ''}`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <button
          key={i}
          onClick={() => setRating(rating === i ? null : i)}
          disabled={saving}
          className="group relative"
          title={rating === i ? 'Clear rating' : `Rate ${i}/5`}
        >
          <span
            className={`inline-block h-2 w-2 rounded-full transition-colors ${
              rating !== null && i <= rating
                ? 'bg-accent'
                : 'bg-border group-hover:bg-accent/50'
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
      {compounds.map((compound) => (
        <div key={compound.id} className="rounded-md border border-border px-3 py-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium">{compound.name}</span>
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
      ))}
    </div>
  );
}
