'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { SOURCE_STATUSES, SOURCE_STATUS_LABELS, type SourceStatus } from '@/lib/constants';

/**
 * Inline reading-status dropdown (unread/skimmed/read/synthesized — distinct
 * from `ingest_status`, the pipeline's own processing state). PATCHes
 * `/api/source/[id]` on change, then refreshes so the card and detail page
 * reflect the new value immediately.
 */
export function QuickStatus({
  sourceId,
  status,
  className = '',
}: {
  sourceId: string;
  status: SourceStatus;
  className?: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);

  async function handleChange(next: SourceStatus) {
    setPending(true);
    setError(false);
    try {
      const response = await fetch(`/api/source/${sourceId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: next }),
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
    <select
      value={status}
      disabled={pending}
      onChange={(e) => handleChange(e.target.value as SourceStatus)}
      title="Reading status"
      className={`rounded-full border px-2 py-0.5 text-xs outline-none transition-colors focus:border-accent disabled:opacity-50 ${
        error ? 'border-red-700/40 text-red-400' : 'border-border text-muted hover:text-foreground'
      } ${className}`}
    >
      {SOURCE_STATUSES.map((s) => (
        <option key={s} value={s}>
          {SOURCE_STATUS_LABELS[s]}
        </option>
      ))}
    </select>
  );
}
