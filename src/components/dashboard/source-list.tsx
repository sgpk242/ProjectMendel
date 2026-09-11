import Link from 'next/link';

import { SOURCE_TYPE_LABELS, type IngestStatus, type SourceType } from '@/lib/constants';

export type SourceListItem = {
  id: string;
  title: string | null;
  summary: string | null;
  sourceType: SourceType;
  ingestStatus: IngestStatus;
  capturedAt: string;
  topics: string[];
};

const STATUS_DOT: Record<IngestStatus, string> = {
  pending: 'bg-yellow-500',
  fetching: 'bg-yellow-500',
  extracting: 'bg-yellow-500',
  chunking: 'bg-yellow-500',
  embedding: 'bg-yellow-500',
  complete: 'bg-accent',
  failed: 'bg-red-500',
};

const STATUS_LABEL: Record<IngestStatus, string> = {
  pending: 'Queued',
  fetching: 'Fetching…',
  extracting: 'Classifying…',
  chunking: 'Chunking…',
  embedding: 'Embedding…',
  complete: 'Ready',
  failed: 'Failed',
};

const relativeTime = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

function relativeDate(iso: string): string {
  const diffMs = new Date(iso).getTime() - Date.now();
  const diffDays = Math.round(diffMs / 86_400_000);
  if (Math.abs(diffDays) < 1) {
    const diffHours = Math.round(diffMs / 3_600_000);
    if (Math.abs(diffHours) < 1) return 'just now';
    return relativeTime.format(diffHours, 'hour');
  }
  return relativeTime.format(diffDays, 'day');
}

/** List of captured sources, most recent first. */
export function SourceList({ sources }: { sources: SourceListItem[] }) {
  if (sources.length === 0) return null;

  return (
    <ul className="flex flex-col gap-3">
      {sources.map((source) => (
        <li key={source.id}>
          <Link
            href={`/source/${source.id}`}
            className="block rounded-lg border border-border bg-surface p-4 transition-colors hover:border-accent/50"
          >
            <div className="flex items-start justify-between gap-4">
              <h3 className="font-medium">{source.title || 'Untitled'}</h3>
              <span className="flex shrink-0 items-center gap-1.5 text-xs text-muted">
                <span className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[source.ingestStatus]}`} />
                {STATUS_LABEL[source.ingestStatus]}
              </span>
            </div>

            {source.summary ? (
              <p className="mt-1 line-clamp-2 text-sm text-muted">{source.summary}</p>
            ) : null}

            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
              <span className="rounded-full border border-border px-2 py-0.5">
                {SOURCE_TYPE_LABELS[source.sourceType]}
              </span>
              <span>{relativeDate(source.capturedAt)}</span>
              {source.topics.map((topic) => (
                <span key={topic} className="rounded-full bg-accent/10 px-2 py-0.5 text-accent">
                  {topic}
                </span>
              ))}
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
