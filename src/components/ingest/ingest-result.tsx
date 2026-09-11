import Link from 'next/link';

import { SOURCE_TYPE_LABELS } from '@/lib/constants';
import type { IngestResult } from '@/lib/pipeline/types';

/**
 * Confirmation screen shown after a successful ingest: what was extracted,
 * how it was classified, and whether anything in the corpus looks similar.
 */
export function IngestResultView({
  result,
  onCaptureAnother,
}: {
  result: IngestResult;
  onCaptureAnother: () => void;
}) {
  const duplicates = result.similarSources.filter((s) => s.relationshipType === 'duplicate');
  const related = result.similarSources.filter((s) => s.relationshipType === 'related');

  return (
    <div className="rounded-lg border border-border bg-surface p-6">
      <div className="flex items-start justify-between gap-4">
        <h2 className="text-lg font-semibold tracking-tight">
          {result.title || 'Untitled'}
        </h2>
        <a
          href={result.url}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 text-sm text-accent hover:underline"
        >
          Open original ↗
        </a>
      </div>

      <p className="mt-3 text-sm leading-relaxed text-foreground">{result.summary}</p>

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
        <span className="rounded-full border border-border px-2 py-0.5">
          {SOURCE_TYPE_LABELS[result.sourceType]}
        </span>
        <span>{result.wordCount.toLocaleString()} words</span>
        <span>{result.readingTimeMinutes} min read</span>
        <span>{result.chunkCount} chunks indexed</span>
      </div>

      {result.topics.length > 0 ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {result.topics.map((topic) => (
            <span
              key={topic.name}
              className="rounded-full bg-accent/10 px-2.5 py-1 text-xs text-accent"
            >
              {topic.name}
            </span>
          ))}
        </div>
      ) : null}

      {duplicates.length > 0 ? (
        <div className="mt-5 rounded-md border border-yellow-700/40 bg-yellow-500/10 px-3 py-2 text-sm text-yellow-300">
          <p className="font-medium">Possible duplicate</p>
          <ul className="mt-1 list-inside list-disc">
            {duplicates.map((d) => (
              <li key={d.sourceId}>
                {d.title || 'Untitled'} ({Math.round(d.similarity * 100)}% similar)
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {related.length > 0 ? (
        <div className="mt-3 text-sm text-muted">
          <p>Related to:</p>
          <ul className="mt-1 list-inside list-disc">
            {related.map((r) => (
              <li key={r.sourceId}>
                <Link href={`/source/${r.sourceId}`} className="hover:text-foreground">
                  {r.title || 'Untitled'}
                </Link>{' '}
                ({Math.round(r.similarity * 100)}% similar)
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="mt-6 flex items-center gap-4">
        <Link
          href={`/source/${result.sourceId}`}
          className="rounded-md bg-accent px-3 py-2 text-sm font-medium text-background transition-opacity hover:opacity-90"
        >
          View source
        </Link>
        <button
          type="button"
          onClick={onCaptureAnother}
          className="text-sm text-muted transition-colors hover:text-foreground"
        >
          Capture another
        </button>
      </div>
    </div>
  );
}
