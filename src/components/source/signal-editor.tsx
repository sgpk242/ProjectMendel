'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import {
  FEED_SIGNALS,
  FEED_SIGNAL_DEFINITIONS,
  FEED_SIGNAL_LABELS,
  type FeedSignal,
} from '@/lib/constants';

/**
 * Commercial-signal dropdown for the detail page. Carried over from the feed
 * item when the source was ingested from the feed (set by the model), and
 * correctable here; "None" clears it. PATCHes `/api/source/[id]`.
 */
export function SignalEditor({
  sourceId,
  signalType,
}: {
  sourceId: string;
  signalType: FeedSignal | null;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);

  async function handleChange(next: FeedSignal | null) {
    setPending(true);
    setError(false);
    try {
      const response = await fetch(`/api/source/${sourceId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signal_type: next }),
      });
      if (!response.ok) {
        setError(true);
        return;
      }
      router.refresh();
    } catch {
      setError(true);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted">Signal</span>
      <select
        value={signalType ?? ''}
        disabled={pending}
        onChange={(e) => handleChange((e.target.value || null) as FeedSignal | null)}
        title={signalType ? FEED_SIGNAL_DEFINITIONS[signalType] : 'Commercial signal'}
        className={`rounded-full border px-2 py-0.5 text-xs outline-none transition-colors focus:border-accent disabled:opacity-50 ${
          error
            ? 'border-red-700/40 text-red-400'
            : signalType
              ? 'border-accent/50 text-accent'
              : 'border-border text-muted hover:text-foreground'
        }`}
      >
        <option value="">None</option>
        {FEED_SIGNALS.map((s) => (
          <option key={s} value={s}>
            {FEED_SIGNAL_LABELS[s]}
          </option>
        ))}
      </select>
    </div>
  );
}
