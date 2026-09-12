'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

/**
 * Sets a product idea's interest_rating to 0 ("de-listed") — distinct from
 * null ("never rated") — which removes it from the dashboard's Product Idea
 * Radar tile and un-links it from source pages' compound lists, without
 * touching its `source_product_ideas` rows or notes — the mention still
 * shows on every source that references it, just no longer as a link.
 * Redirects to the dashboard on success, since this page's own "de-listed"
 * state has nothing further to show here.
 */
export function DelistButton({ productId }: { productId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function handleDelist() {
    setPending(true);
    try {
      const response = await fetch(`/api/product-ideas/${productId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ interest_rating: 0 }),
      });
      if (response.ok) {
        router.push('/dashboard');
        return;
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleDelist}
      disabled={pending}
      className="shrink-0 rounded-md border border-border px-3 py-1.5 text-sm text-muted transition-colors hover:border-red-700/40 hover:text-red-400 disabled:opacity-50"
    >
      {pending ? 'De-listing…' : 'De-list'}
    </button>
  );
}
