'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Spinner } from '@/components/ui/spinner';

/** Looks the product's description up again, replacing the cached one. */
export function RefreshDescriptionButton({ productId }: { productId: string }) {
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleRefresh() {
    setRefreshing(true);
    setError(null);
    try {
      const res = await fetch(`/api/product-ideas/${productId}/description`, { method: 'POST' });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? `Refresh failed (${res.status})`);
      } else {
        router.refresh();
      }
    } catch {
      setError('Refresh failed: network error');
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={handleRefresh}
        disabled={refreshing}
        title="Look the description up again"
        className="inline-flex items-center gap-1 text-xs font-normal text-muted hover:text-accent disabled:opacity-50"
      >
        {refreshing ? (
          <>
            <Spinner /> Refreshing…
          </>
        ) : (
          '↻ Refresh'
        )}
      </button>
      {error ? <span className="text-xs font-normal text-red-400">{error}</span> : null}
    </span>
  );
}
