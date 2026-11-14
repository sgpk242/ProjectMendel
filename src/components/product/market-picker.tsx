'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import {
  COMPOUND_MARKETS,
  COMPOUND_MARKET_DEFINITIONS,
  COMPOUND_MARKET_LABELS,
  type CompoundMarket,
} from '@/lib/constants';

/** Industrial / Pharma / Both tag for a compound, which drives the radar toggle. */
export function MarketPicker({
  productId,
  market,
}: {
  productId: string;
  market: CompoundMarket | null;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  async function setMarket(next: CompoundMarket) {
    if (next === market) return;
    setSaving(true);
    await fetch(`/api/product-ideas/${productId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ market: next }),
    });
    setSaving(false);
    router.refresh();
  }

  return (
    <div className={`flex items-center gap-2 text-sm ${saving ? 'opacity-50' : ''}`}>
      <span className="text-muted">Market</span>
      <div className="flex overflow-hidden rounded-md border border-border">
        {COMPOUND_MARKETS.map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMarket(m)}
            disabled={saving}
            title={COMPOUND_MARKET_DEFINITIONS[m]}
            className={`px-2.5 py-1 text-xs transition-colors ${
              market === m ? 'bg-accent/20 font-medium text-accent' : 'text-muted hover:text-foreground'
            }`}
          >
            {COMPOUND_MARKET_LABELS[m]}
          </button>
        ))}
      </div>
      {market === null ? <span className="text-xs text-muted">Not tagged yet</span> : null}
    </div>
  );
}
