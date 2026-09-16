import Link from 'next/link';

export type RatedProductIdea = {
  id: string;
  name: string;
  description: string | null;
  interest_rating: number;
  source_count: number;
};

type Props = { ideas: RatedProductIdea[] };

function InterestDots({ rating }: { rating: number }) {
  return (
    <span className="inline-flex gap-0.5" title={`${rating}/5 interest`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <span
          key={i}
          className={`inline-block h-1.5 w-1.5 rounded-full ${
            i <= rating ? 'bg-accent' : 'bg-border'
          }`}
        />
      ))}
    </span>
  );
}

export function ProductRadarTile({ ideas }: Props) {
  return (
    <div className="rounded-lg border border-border bg-surface">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold">Product Idea Radar</h2>
          {ideas.length > 0 && (
            <span className="rounded-full bg-accent/20 px-2 py-0.5 text-xs font-medium text-accent">
              {ideas.length}
            </span>
          )}
        </div>
      </div>

      <div className="px-4 py-3">
        {ideas.length === 0 ? (
          <p className="text-sm text-muted">
            No rated compounds yet. Ingest papers to discover compounds, then rate the ones that
            interest you.
          </p>
        ) : (
          <div className="space-y-2.5">
            {ideas.map((idea) => (
              <Link
                key={idea.id}
                href={`/product/${idea.id}`}
                className="block rounded-lg border border-border bg-surface p-3 text-sm transition-colors hover:border-accent/50"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{idea.name}</span>
                  <InterestDots rating={idea.interest_rating} />
                </div>
                {idea.description && (
                  <p className="mt-0.5 line-clamp-1 text-xs text-muted">{idea.description}</p>
                )}
                <p className="mt-0.5 text-xs text-muted">
                  From {idea.source_count} {idea.source_count === 1 ? 'paper' : 'papers'}
                </p>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
