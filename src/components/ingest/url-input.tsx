'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';

import type { IngestResult } from '@/lib/pipeline/types';

type Status = 'idle' | 'loading' | 'error' | 'success';

const inputClass =
  'rounded-md border border-border bg-surface px-3 py-2 text-foreground outline-none focus:border-accent';

/**
 * Capture form: URL, optional interest rating and notes, submit to
 * /api/ingest. Always shows this same upload layout — a capture never takes
 * over the tile with a full result view; success/failure is a small banner
 * above the (now-reset) form, and the captured source shows up in the
 * source repository list below like any other.
 */
export function UrlInput() {
  const router = useRouter();
  const [url, setUrl] = useState('');
  const [interestRating, setInterestRating] = useState('');
  const [userNote, setUserNote] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ sourceId: string; title: string | null } | null>(
    null,
  );

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus('loading');
    setError(null);
    setSuccess(null);

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

      const result = body as IngestResult;
      setSuccess({ sourceId: result.sourceId, title: result.title });
      setStatus('idle');
      setUrl('');
      setInterestRating('');
      setUserNote('');
      router.refresh();
    } catch {
      setError('Network error — check your connection and try again');
      setStatus('error');
    }
  }

  return (
    <div className="rounded-lg border border-border bg-surface">
      <div className="border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold">New Source Upload</h2>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-3 p-4">
        {success ? (
          <p className="rounded-md border border-accent/40 bg-accent/10 px-3 py-2 text-sm text-accent">
            ✓ Captured &ldquo;{success.title || 'Untitled'}&rdquo; —{' '}
            <Link href={`/source/${success.sourceId}`} className="underline hover:no-underline">
              view source
            </Link>
          </p>
        ) : null}

        <label className="flex flex-col gap-2 text-sm">
          <span className="text-muted">URL</span>
          <input
            type="url"
            required
            placeholder="https://example.com/article"
            value={url}
            onChange={(e) => {
              setUrl(e.target.value);
              setSuccess(null);
              setError(null);
            }}
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
    </div>
  );
}
