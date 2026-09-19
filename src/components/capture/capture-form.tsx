'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

type Status = 'idle' | 'loading' | 'error';

const inputClass =
  'rounded-md border border-border bg-surface px-3 py-3 text-base text-foreground outline-none focus:border-accent';

/**
 * Mobile capture form used by the PWA share target. Submits with
 * `async: true` so `/api/ingest` responds the moment the row is inserted
 * (202) instead of waiting out the full pipeline, then redirects straight
 * to the dashboard — the newly captured (still-pending) source shows up
 * there immediately, and the pipeline keeps running in the background.
 */
export function CaptureForm({ initialUrl }: { initialUrl: string }) {
  const router = useRouter();
  const [url, setUrl] = useState(initialUrl);
  const [interestRating, setInterestRating] = useState<number | null>(null);
  const [userNote, setUserNote] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);
  const [existingSourceId, setExistingSourceId] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus('loading');
    setError(null);
    setExistingSourceId(null);

    try {
      const response = await fetch('/api/ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url,
          interestRating: interestRating ?? undefined,
          userNote: userNote || undefined,
          async: true,
        }),
      });

      const body = await response.json();

      if (response.status === 409) {
        setError(
          body.existingSource
            ? `Already captured: "${body.existingSource.title || 'Untitled'}"`
            : body.error,
        );
        setExistingSourceId(body.existingSource?.id ?? null);
        setStatus('error');
        return;
      }

      if (!response.ok) {
        setError(body.error || 'Capture failed');
        setStatus('error');
        return;
      }

      router.push('/dashboard');
    } catch {
      setError('Network error — check your connection and try again');
      setStatus('error');
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <label className="flex flex-col gap-2 text-sm">
        <span className="text-muted">URL</span>
        <input
          type="url"
          required
          placeholder="https://example.com/article"
          value={url}
          onChange={(e) => {
            setUrl(e.target.value);
            setError(null);
          }}
          disabled={status === 'loading'}
          className={inputClass}
        />
      </label>

      <div className="flex flex-col gap-2 text-sm">
        <span className="text-muted">Interest rating (optional)</span>
        <div className="flex gap-2">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setInterestRating(interestRating === n ? null : n)}
              disabled={status === 'loading'}
              className={`flex h-12 w-12 items-center justify-center rounded-md border text-base font-medium transition-colors ${
                interestRating === n
                  ? 'border-accent bg-accent text-background'
                  : 'border-border bg-surface text-foreground'
              }`}
            >
              {n}
            </button>
          ))}
        </div>
      </div>

      <label className="flex flex-col gap-2 text-sm">
        <span className="text-muted">Note (optional)</span>
        <input
          type="text"
          value={userNote}
          onChange={(e) => setUserNote(e.target.value)}
          disabled={status === 'loading'}
          className={inputClass}
        />
      </label>

      {error ? (
        <div role="alert" className="text-sm text-red-400">
          <p>{error}</p>
          {existingSourceId ? (
            <Link href={`/source/${existingSourceId}`} className="underline hover:no-underline">
              View existing source
            </Link>
          ) : null}
        </div>
      ) : null}

      <button
        type="submit"
        disabled={status === 'loading'}
        className="rounded-md bg-accent px-4 py-3 text-base font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {status === 'loading' ? 'Capturing…' : 'Capture'}
      </button>
    </form>
  );
}
