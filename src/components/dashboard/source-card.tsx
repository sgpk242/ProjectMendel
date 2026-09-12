import Link from 'next/link';

import { CollectionPicker } from '@/components/dashboard/collection-picker';
import { QuickRating } from '@/components/dashboard/quick-rating';
import { QuickStatus } from '@/components/dashboard/quick-status';
import { DeleteSourceButton } from '@/components/source/delete-button';
import { SOURCE_TYPE_LABELS, type IngestStatus } from '@/lib/constants';

import type { SourceListItem } from './source-list';

const INGEST_DOT: Record<IngestStatus, string> = {
  pending: 'bg-yellow-500',
  fetching: 'bg-yellow-500',
  extracting: 'bg-yellow-500',
  chunking: 'bg-yellow-500',
  embedding: 'bg-yellow-500',
  complete: 'bg-accent',
  failed: 'bg-red-500',
};

const INGEST_LABEL: Record<IngestStatus, string> = {
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

/**
 * One source's card in the dashboard grid. The title/summary block is the
 * only part wrapped in a `<Link>` — quick-action controls (select, buttons,
 * checkboxes) live outside it as sibling rows, since a `<select>`/`<button>`
 * nested inside an `<a>` is invalid HTML and would also fire navigation on
 * every interaction (same reasoning as `DeleteSourceButton`'s placement).
 */
export function SourceCard({ source }: { source: SourceListItem }) {
  return (
    <li className="relative rounded-lg border border-border bg-surface p-4 pr-10 transition-colors hover:border-accent/50">
      <DeleteSourceButton
        sourceId={source.id}
        title={source.title}
        className="absolute right-3 top-3"
      />

      <Link href={`/source/${source.id}`} className="block">
        <div className="flex items-start justify-between gap-4">
          <h3 className="font-medium">{source.title || 'Untitled'}</h3>
          {source.ingestStatus !== 'complete' ? (
            <span className="flex shrink-0 items-center gap-1.5 text-xs text-muted">
              <span className={`h-1.5 w-1.5 rounded-full ${INGEST_DOT[source.ingestStatus]}`} />
              {INGEST_LABEL[source.ingestStatus]}
            </span>
          ) : null}
        </div>

        {source.summary ? (
          <p className="mt-1 line-clamp-2 text-sm text-muted">{source.summary}</p>
        ) : null}
      </Link>

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
        <span className="rounded-full border border-border px-2 py-0.5">
          {SOURCE_TYPE_LABELS[source.sourceType]}
        </span>
        {source.publication ? <span>{source.publication}</span> : null}
        <span>{relativeDate(source.capturedAt)}</span>
        {source.readingTimeMinutes ? <span>{source.readingTimeMinutes} min read</span> : null}
        {source.topics.map((topic) => (
          <span key={topic} className="rounded-full bg-accent/10 px-2 py-0.5 text-accent">
            {topic}
          </span>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3">
        <QuickStatus sourceId={source.id} status={source.status} />
        <QuickRating sourceId={source.id} rating={source.interestRating} />
        <CollectionPicker sourceId={source.id} initialCollectionIds={source.collectionIds} />
      </div>
    </li>
  );
}
