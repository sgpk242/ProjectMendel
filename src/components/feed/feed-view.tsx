'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import {
  FEED_ITEM_STATUSES,
  FEED_ITEM_STATUS_LABELS,
  FEED_SOURCE_TYPES,
  type FeedItemStatus,
} from '@/lib/constants';
import type { FeedItem, FeedQuery } from '@/lib/types/database';

type Props = {
  queries: FeedQuery[];
  items: FeedItem[];
  newCount: number;
};

export function FeedView({ queries, items, newCount }: Props) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<string>('new');
  const [refreshing, setRefreshing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [addingQuery, setAddingQuery] = useState(false);
  const [savingQuery, setSavingQuery] = useState(false);
  const [actionId, setActionId] = useState<string | null>(null);
  const [showQueries, setShowQueries] = useState(false);

  const filteredItems =
    activeTab === 'all' ? items : items.filter((i) => i.status === activeTab);

  async function handleRefresh() {
    setRefreshing(true);
    await fetch('/api/feed/refresh', { method: 'POST' });
    setRefreshing(false);
    router.refresh();
  }

  async function handleImportTopics() {
    setImporting(true);
    await fetch('/api/feed/queries/import-topics', { method: 'POST' });
    setImporting(false);
    router.refresh();
  }

  async function handleCreateQuery(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSavingQuery(true);
    const data = new FormData(e.currentTarget);
    await fetch('/api/feed/queries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        queryText: data.get('queryText'),
        sourceType: data.get('sourceType'),
      }),
    });
    setSavingQuery(false);
    setAddingQuery(false);
    router.refresh();
  }

  async function handleDeleteQuery(id: string) {
    await fetch(`/api/feed/queries/${id}`, { method: 'DELETE' });
    router.refresh();
  }

  async function handleToggleQuery(id: string, enabled: boolean) {
    await fetch(`/api/feed/queries/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled }),
    });
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

  async function handleReview(id: string) {
    setActionId(id);
    await fetch(`/api/feed/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'reviewed' }),
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
    <div>
      {/* Query management toggle */}
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="rounded bg-accent px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50"
        >
          {refreshing ? 'Refreshing…' : '↻ Refresh all queries'}
        </button>
        <button
          onClick={() => setShowQueries(!showQueries)}
          className="rounded border border-border px-4 py-1.5 text-sm text-muted hover:text-foreground"
        >
          {showQueries ? 'Hide queries' : `Manage queries (${queries.length})`}
        </button>
        <span className="text-sm text-muted">
          {newCount} new {newCount === 1 ? 'item' : 'items'}
        </span>
      </div>

      {/* Queries section */}
      {showQueries && (
        <div className="mt-4 rounded-lg border border-border p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">Feed Queries</h2>
            <button
              onClick={handleImportTopics}
              disabled={importing}
              className="rounded px-3 py-1 text-xs text-accent hover:bg-accent/10 disabled:opacity-50"
            >
              {importing ? 'Importing…' : 'Import from topics'}
            </button>
          </div>

          <div className="mt-3 space-y-2">
            {queries.map((q) => (
              <div
                key={q.id}
                className="flex items-center justify-between gap-3 rounded border border-border/50 px-3 py-2 text-sm"
              >
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleToggleQuery(q.id, !q.enabled)}
                    className={`h-4 w-4 rounded border ${
                      q.enabled
                        ? 'border-accent bg-accent'
                        : 'border-border bg-background'
                    }`}
                    title={q.enabled ? 'Disable' : 'Enable'}
                  >
                    {q.enabled && (
                      <span className="block text-center text-xs leading-4 text-white">✓</span>
                    )}
                  </button>
                  <span className={q.enabled ? '' : 'text-muted line-through'}>
                    {q.query_text}
                  </span>
                  <span className="rounded bg-surface-alt px-1.5 py-0.5 text-xs text-muted">
                    {q.source_type}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted">
                  {q.last_run_at && (
                    <span>
                      Last run:{' '}
                      {new Date(q.last_run_at).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                      })}
                    </span>
                  )}
                  <button
                    onClick={() => handleDeleteQuery(q.id)}
                    className="text-red-400 hover:text-red-300"
                  >
                    ×
                  </button>
                </div>
              </div>
            ))}

            {queries.length === 0 && (
              <p className="text-sm text-muted">
                No queries yet. Add a custom query or import from your topics.
              </p>
            )}
          </div>

          {addingQuery ? (
            <form onSubmit={handleCreateQuery} className="mt-3 flex gap-2">
              <input
                name="queryText"
                required
                placeholder="Search query"
                className="flex-1 rounded border border-border bg-background px-3 py-1.5 text-sm"
              />
              <select
                name="sourceType"
                defaultValue="openalex"
                className="rounded border border-border bg-background px-2 py-1.5 text-sm"
              >
                {FEED_SOURCE_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t === 'openalex' ? 'Academic (OpenAlex)' : 'News (Web)'}
                  </option>
                ))}
              </select>
              <button
                type="submit"
                disabled={savingQuery}
                className="rounded bg-accent px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
              >
                {savingQuery ? '…' : 'Add'}
              </button>
              <button
                type="button"
                onClick={() => setAddingQuery(false)}
                className="rounded px-3 py-1.5 text-sm text-muted hover:text-foreground"
              >
                Cancel
              </button>
            </form>
          ) : (
            <button
              onClick={() => setAddingQuery(true)}
              className="mt-3 w-full rounded border border-dashed border-border py-1.5 text-xs text-muted hover:border-accent hover:text-accent"
            >
              + Add query
            </button>
          )}
        </div>
      )}

      {/* Status tabs */}
      <div className="mt-6 flex gap-2 border-b border-border pb-2">
        {['all', ...FEED_ITEM_STATUSES].map((s) => (
          <button
            key={s}
            onClick={() => setActiveTab(s)}
            className={`rounded-md px-3 py-1 text-sm ${
              activeTab === s
                ? 'bg-accent/20 font-medium text-accent'
                : 'text-muted hover:text-foreground'
            }`}
          >
            {s === 'all' ? 'All' : FEED_ITEM_STATUS_LABELS[s as FeedItemStatus]}
            {s === 'new' && newCount > 0 && (
              <span className="ml-1 rounded-full bg-accent/20 px-1.5 text-xs">{newCount}</span>
            )}
          </button>
        ))}
      </div>

      {/* Feed items */}
      <div className="mt-4 space-y-3">
        {filteredItems.length === 0 ? (
          <p className="py-12 text-center text-muted">
            No items{activeTab !== 'all' ? ` with status "${activeTab}"` : ''}. Try refreshing
            your queries.
          </p>
        ) : (
          filteredItems.map((item) => (
            <div
              key={item.id}
              className="rounded-lg border border-border px-4 py-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-accent hover:underline"
                  >
                    {item.title}
                  </a>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
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
                    <span className="rounded bg-surface-alt px-1.5 py-0.5">
                      {item.external_id?.startsWith('https://openalex.org')
                        ? 'Academic'
                        : 'Web'}
                    </span>
                  </div>
                  {item.abstract && (
                    <p className="mt-2 line-clamp-2 text-sm text-muted">{item.abstract}</p>
                  )}
                </div>
                <span className="shrink-0 rounded bg-surface-alt px-2 py-0.5 text-xs text-muted">
                  {FEED_ITEM_STATUS_LABELS[item.status as FeedItemStatus] ?? item.status}
                </span>
              </div>

              {item.status !== 'ingested' && (
                <div className="mt-2 flex gap-1">
                  {item.status === 'new' && (
                    <button
                      onClick={() => handleReview(item.id)}
                      disabled={actionId === item.id}
                      className="rounded px-2 py-0.5 text-xs text-muted hover:bg-surface-alt hover:text-foreground disabled:opacity-50"
                    >
                      Mark reviewed
                    </button>
                  )}
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
                    Ingest →
                  </button>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
