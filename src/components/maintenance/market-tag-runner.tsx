'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

/** Tags untagged compounds as industrial / pharma / both, 40 per request. */
export function MarketTagRunner({ untagged }: { untagged: number }) {
  const router = useRouter();
  const [remaining, setRemaining] = useState(untagged);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setRunning(true);
    setError(null);
    try {
      let left = remaining;
      while (left > 0) {
        const res = await fetch('/api/maintenance/tag-markets', { method: 'POST' });
        const data = (await res.json()) as { remaining?: number; error?: string };
        if (!res.ok || typeof data.remaining !== 'number') {
          throw new Error(data.error ?? `HTTP ${res.status}`);
        }
        left = data.remaining;
        setRemaining(left);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
    setRunning(false);
    router.refresh();
  }

  if (remaining === 0) {
    return <p className="text-sm text-muted">Every compound has a market tag.</p>;
  }

  return (
    <div>
      <button
        type="button"
        onClick={run}
        disabled={running}
        className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-background disabled:opacity-50"
      >
        {running ? `Tagging… (${remaining} left)` : `Tag ${remaining} compounds`}
      </button>
      {error ? <p className="mt-2 text-sm text-red-300">{error}</p> : null}
    </div>
  );
}
