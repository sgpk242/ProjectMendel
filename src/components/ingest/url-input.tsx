'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';

import { IngestResultView } from '@/components/ingest/ingest-result';
import type { IngestResult } from '@/lib/pipeline/types';

type Status = 'idle' | 'loading' | 'error' | 'success';

const inputClass =
  'rounded-md border border-border bg-surface px-3 py-2 text-foreground outline-none focus:border-accent';

/** Capture form: URL, optional interest rating and notes, submit to /api/ingest. */
export function UrlInput() {
  const router = useRouter();
  const [url, setUrl] = useState('');
  const [interestRating, setInterestRating] = useState('');
  const [userNote, setUserNote] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<IngestResult | null>(null);

  function reset() {
    setUrl('');
    setInterestRating('');
    setUserNote('');
    setStatus('idle');
    setError(null);
    setResult(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus('loading');
    setError(null);

    try {
      const response = await fetch('/api/ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url,
          interestRating: interestRating ? Number(interestRating) : undefined,
          userNote: userNote || undefined,
        }),
      });

      const body = await response.json();

      if (response.status === 409) {
        setError(
          body.existingSource
            ? `Already captured: "${body.existingSource.title || 'Untitled'}"`
            : body.error,
        );
        setStatus('error');
        return;
      }

      if (!response.ok) {
        setError(body.error || 'Ingest failed');
        setStatus('error');
        return;
      }

      setResult(body as IngestResult);
      setStatus('success');
      router.refresh();
    } catch {
      setError('Network error — check your connection and try again');
      setStatus('error');
    }
  }

  if (status === 'success' && result) {
    return <IngestResultView result={result} onCaptureAnother={reset} />;
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
      <label className="flex flex-col gap-2 text-sm">
        <span className="text-muted">URL</span>
        <input
          type="url"
          required
          placeholder="https://example.com/article"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          disabled={status === 'loading'}
          className={inputClass}
        />
      </label>

      <div className="flex gap-4">
        <label className="flex flex-1 flex-col gap-2 text-sm">
          <span className="text-muted">Interest rating (optional)</span>
          <select
            value={interestRating}
            onChange={(e) => setInterestRating(e.target.value)}
            disabled={status === 'loading'}
            className={inputClass}
          >
            <option value="">—</option>
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="flex flex-col gap-2 text-sm">
        <span className="text-muted">Notes (optional)</span>
        <textarea
          value={userNote}
          onChange={(e) => setUserNote(e.target.value)}
          disabled={status === 'loading'}
          rows={2}
          className={inputClass}
        />
      </label>

      {error ? (
        <p role="alert" className="text-sm text-red-400">
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={status === 'loading'}
        className="mt-1 self-start rounded-md bg-accent px-4 py-2 text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {status === 'loading' ? 'Capturing…' : 'Capture'}
      </button>

      {status === 'loading' ? (
        <p className="text-xs text-muted">
          Fetching, classifying, and indexing — this can take up to a minute.
        </p>
      ) : null}
    </form>
  );
}
