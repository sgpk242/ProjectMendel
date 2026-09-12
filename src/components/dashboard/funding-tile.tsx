'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { FUNDING_STATUS_LABELS, type FundingStatus } from '@/lib/constants';

export type FundingTileItem = {
  id: string;
  title: string;
  organization: string | null;
  amount: string | null;
  deadline: string | null;
  url: string | null;
  status: string;
};

type Props = { opportunities: FundingTileItem[] };

export function FundingTile({ opportunities }: Props) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    const form = e.currentTarget;
    const data = new FormData(form);

    await fetch('/api/funding', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: data.get('title'),
        organization: data.get('organization') || undefined,
        amount: data.get('amount') || undefined,
        deadline: data.get('deadline') || undefined,
        url: data.get('url') || undefined,
      }),
    });

    setSaving(false);
    setAdding(false);
    router.refresh();
  }

  const isDeadlineSoon = (deadline: string | null): boolean => {
    if (!deadline) return false;
    const diff = new Date(deadline).getTime() - Date.now();
    return diff > 0 && diff < 14 * 24 * 60 * 60 * 1000;
  };

  return (
    <div className="rounded-lg border border-border bg-surface">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold">Funding Opportunities</h2>
          {opportunities.length > 0 && (
            <span className="rounded-full bg-accent/20 px-2 py-0.5 text-xs font-medium text-accent">
              {opportunities.length}
            </span>
          )}
        </div>
        <a href="/funding" className="text-xs text-muted hover:text-foreground">
          View all →
        </a>
      </div>

      <div className="px-4 py-3">
        {opportunities.length === 0 && !adding ? (
          <p className="text-sm text-muted">No funding opportunities tracked yet.</p>
        ) : (
          <div className="space-y-2">
            {opportunities.map((opp) => (
              <div key={opp.id} className="flex items-start justify-between gap-2 text-sm">
                <div className="min-w-0 flex-1">
                  {opp.url ? (
                    <a
                      href={opp.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium text-accent hover:underline"
                    >
                      {opp.title}
                    </a>
                  ) : (
                    <span className="font-medium">{opp.title}</span>
                  )}
                  {opp.organization && (
                    <span className="ml-1 text-muted">· {opp.organization}</span>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-2 text-xs">
                  {opp.amount && <span className="text-muted">{opp.amount}</span>}
                  {opp.deadline && (
                    <span
                      className={
                        isDeadlineSoon(opp.deadline)
                          ? 'font-medium text-yellow-400'
                          : 'text-muted'
                      }
                    >
                      {new Date(opp.deadline + 'T00:00:00').toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                      })}
                    </span>
                  )}
                  <span className="rounded bg-surface-alt px-1.5 py-0.5 text-muted">
                    {FUNDING_STATUS_LABELS[opp.status as FundingStatus] ?? opp.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}

        {adding ? (
          <form onSubmit={handleSubmit} className="mt-3 space-y-2">
            <input
              name="title"
              required
              placeholder="Grant title"
              className="w-full rounded border border-border bg-background px-2 py-1 text-sm"
            />
            <div className="flex gap-2">
              <input
                name="organization"
                placeholder="Organization"
                className="flex-1 rounded border border-border bg-background px-2 py-1 text-sm"
              />
              <input
                name="amount"
                placeholder="Amount"
                className="w-24 rounded border border-border bg-background px-2 py-1 text-sm"
              />
            </div>
            <div className="flex gap-2">
              <input
                name="deadline"
                type="date"
                className="flex-1 rounded border border-border bg-background px-2 py-1 text-sm"
              />
              <input
                name="url"
                placeholder="URL"
                className="flex-1 rounded border border-border bg-background px-2 py-1 text-sm"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setAdding(false)}
                className="rounded px-3 py-1 text-xs text-muted hover:text-foreground"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="rounded bg-accent px-3 py-1 text-xs font-medium text-white disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Add'}
              </button>
            </div>
          </form>
        ) : (
          <button
            onClick={() => setAdding(true)}
            className="mt-3 w-full rounded border border-dashed border-border py-1.5 text-xs text-muted hover:border-accent hover:text-accent"
          >
            + Add opportunity
          </button>
        )}
      </div>
    </div>
  );
}
