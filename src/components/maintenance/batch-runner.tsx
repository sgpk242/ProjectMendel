'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

/**
 * Calls a /maintenance endpoint repeatedly until it reports nothing left.
 * The endpoint returns `{ remaining }` (or `{ error }`).
 */
export function BatchRunner({
  endpoint,
  total,
  label,
  runningLabel,
  doneText,
}: {
  endpoint: string;
  total: number;
  /** Button text, e.g. "Tag 12 compounds". */
  label: (remaining: number) => string;
  runningLabel: string;
  doneText: string;
}) {
  const router = useRouter();
  const [remaining, setRemaining] = useState(total);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setRunning(true);
    setError(null);
    try {
      let left = remaining;
      while (left > 0) {
        const res = await fetch(endpoint, { method: 'POST' });
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
    return <p className="text-sm text-muted">{doneText}</p>;
  }

  return (
    <div>
      <button
        type="button"
        onClick={run}
        disabled={running}
        className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-background disabled:opacity-50"
      >
        {running ? `${runningLabel}… (${remaining} left)` : label(remaining)}
      </button>
      {error ? <p className="mt-2 text-sm text-red-300">{error}</p> : null}
    </div>
  );
}
