import Link from 'next/link';

import type { SimilarityType } from '@/lib/constants';

export type SimilarSourceItem = {
  id: string;
  title: string | null;
  url: string;
  similarityScore: number;
  relationshipType: SimilarityType;
};

const RELATIONSHIP_BADGE: Record<SimilarityType, string> = {
  duplicate: 'bg-red-500/10 text-red-400',
  related: 'bg-accent/10 text-accent',
  contradicts: 'bg-yellow-500/10 text-yellow-300',
};

/** Sources linked via `source_similarities` — the dedup/related-reading
 * results the ingest pipeline's similarity check wrote at capture time. */
export function SimilarSources({ sources }: { sources: SimilarSourceItem[] }) {
  if (sources.length === 0) return null;

  return (
    <ul className="flex flex-col gap-2">
      {sources.map((source) => (
        <li key={source.id}>
          <Link
            href={`/source/${source.id}`}
            className="flex items-center justify-between gap-3 rounded-md border border-border bg-surface px-3 py-2 text-sm transition-colors hover:border-accent/50"
          >
            <span className="truncate">{source.title || 'Untitled'}</span>
            <span className="flex shrink-0 items-center gap-2 text-xs text-muted">
              <span className={`rounded-full px-2 py-0.5 ${RELATIONSHIP_BADGE[source.relationshipType]}`}>
                {source.relationshipType}
              </span>
              {Math.round(source.similarityScore * 100)}%
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
