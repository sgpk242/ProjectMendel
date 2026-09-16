'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { SOURCE_TYPES, SOURCE_TYPE_LABELS, type SourceType } from '@/lib/constants';

/**
 * Inline source-type dropdown for the detail page — the LLM classifies this
 * during ingestion, but it's a judgment call ("scientific paper" vs "white
 * paper" vs "non-peer-reviewed article" isn't always obvious from the page
 * alone) worth letting the user correct. PATCHes `/api/source/[id]` and
 * refreshes.
 */
export function SourceTypeEditor({
  sourceId,
  sourceType,
}: {
  sourceId: string;
  sourceType: SourceType;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);

  async function handleChange(next: SourceType) {
    setPending(true);
    setError(false);
    try {
      const response = await fetch(`/api/source/${sourceId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source_type: next }),
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
      <span className="text-xs text-muted">Type</span>
      <select
        value={sourceType}
        disabled={pending}
        onChange={(e) => handleChange(e.target.value as SourceType)}
        title="Source type"
        className={`rounded-full border px-2 py-0.5 text-xs outline-none transition-colors focus:border-accent disabled:opacity-50 ${
          error ? 'border-red-700/40 text-red-400' : 'border-border text-muted hover:text-foreground'
        }`}
      >
        {SOURCE_TYPES.map((t) => (
          <option key={t} value={t}>
            {SOURCE_TYPE_LABELS[t]}
          </option>
        ))}
      </select>
    </div>
  );
}
