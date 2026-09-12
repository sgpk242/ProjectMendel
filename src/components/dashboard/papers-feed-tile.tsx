'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export type FeedTileItem = {
  id: string;
  title: string;
  authors: string | null;
  published_date: string | null;
  url: string;
};

type Props = {
  newCount: number;
  items: FeedTileItem[];
};

export function PapersFeedTile({ newCount, items }: Props) {
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);
  const [actionId, setActionId] = useState<string | null>(null);

  async function handleRefresh() {
    setRefreshing(true);
    await fetch('/api/feed/refresh', { method: 'POST' });
    setRefreshing(false);
    router.refresh();
  }

  async function handleDismiss(id: string) {
    setActionId(id);
    await fetch(`/api/feed/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'dismissed' }),
    });
    setActionId(null);
    router.refresh();
  }

  async function handleIngest(id: string) {
    setActionId(id);
    await fetch(`/api/feed/${id}/ingest`, { method: 'POST' });
    setActionId(null);
    router.refresh();
  }

  return (
    <div className="rounded-lg border border-border bg-surface">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold">New Papers</h2>
          {newCount > 0 && (
            <span className="rounded-full bg-accent/20 px-2 py-0.5 text-xs font-medium text-accent">
              {newCount}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="rounded px-2 py-0.5 text-xs text-muted hover:text-accent disabled:opacity-50"
          >
            {refreshing ? 'Refreshing…' : '↻ Refresh'}
          </button>
          <a href="/feed" className="text-xs text-muted hover:text-foreground">
            View all →
          </a>
        </div>
      </div>

      <div className="px-4 py-3">
        {items.length === 0 ? (
          <p className="text-sm text-muted">
            No new papers. Add feed queries and click Refresh to discover papers.
          </p>
        ) : (
          <div className="space-y-2.5">
            {items.map((item) => (
              <div key={item.id} className="text-sm">
                <a
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-accent hover:underline"
                >
                  {item.title}
                </a>
                <div className="mt-0.5 flex items-center gap-2 text-xs text-muted">
                  {item.authors && <span>{item.authors}</span>}
                  {item.published_date && (
                    <span>
                      {new Date(item.published_date + 'T00:00:00').toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </span>
                  )}
                </div>
                <div className="mt-1 flex gap-1">
                  <button
                    onClick={() => handleDismiss(item.id)}
                    disabled={actionId === item.id}
                    className="rounded px-2 py-0.5 text-xs text-muted hover:bg-surface-alt hover:text-foreground disabled:opacity-50"
                  >
                    Dismiss
                  </button>
                  <button
                    onClick={() => handleIngest(item.id)}
                    disabled={actionId === item.id}
                    className="rounded bg-accent/10 px-2 py-0.5 text-xs text-accent hover:bg-accent/20 disabled:opacity-50"
                  >
                    Ingest
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
