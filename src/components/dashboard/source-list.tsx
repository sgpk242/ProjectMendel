import { SourceCard } from '@/components/dashboard/source-card';
import type { IngestStatus, SourceStatus, SourceType } from '@/lib/constants';

export type SourceListItem = {
  id: string;
  title: string | null;
  summary: string | null;
  sourceType: SourceType;
  ingestStatus: IngestStatus;
  status: SourceStatus;
  capturedAt: string;
  publication: string | null;
  interestRating: number | null;
  readingTimeMinutes: number | null;
  userNote: string | null;
  topics: string[];
  collectionIds: string[];
};

/** Grid of source cards, most recent first (ordering comes from the caller). */
export function SourceList({ sources }: { sources: SourceListItem[] }) {
  if (sources.length === 0) return null;

  return (
    <ul className="flex flex-col gap-3">
      {sources.map((source) => (
        <SourceCard key={source.id} source={source} />
      ))}
    </ul>
  );
}
