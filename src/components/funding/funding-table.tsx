'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { FUNDING_STATUSES, FUNDING_STATUS_LABELS, type FundingStatus } from '@/lib/constants';
import type { FundingOpportunity } from '@/lib/types/database';

type Props = { opportunities: FundingOpportunity[] };

export function FundingTable({ opportunities }: Props) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>('all');

  const filtered =
    filterStatus === 'all'
      ? opportunities
      : opportunities.filter((o) => o.status === filterStatus);

  async function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    const data = new FormData(e.currentTarget);
    await fetch('/api/funding', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: data.get('title'),
        organization: data.get('organization') || undefined,
        amount: data.get('amount') || undefined,
        deadline: data.get('deadline') || undefined,
        url: data.get('url') || undefined,
        notes: data.get('notes') || undefined,
      }),
    });
    setSaving(false);
    setAdding(false);
    router.refresh();
  }

  async function handleStatusChange(id: string, status: string) {
    await fetch(`/api/funding/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    router.refresh();
  }

  async function handleDelete(id: string) {
    await fetch(`/api/funding/${id}`, { method: 'DELETE' });
    setEditingId(null);
    router.refresh();
  }

  const isDeadlineSoon = (deadline: string | null): boolean => {
    if (!deadline) return false;
    const diff = new Date(deadline).getTime() - Date.now();
    return diff > 0 && diff < 14 * 24 * 60 * 60 * 1000;
  };

  return (
    <div>
      {/* Filter tabs */}
      <div className="flex gap-2 border-b border-border pb-2">
        {['all', ...FUNDING_STATUSES].map((s) => (
          <button
            key={s}
            onClick={() => setFilterStatus(s)}
            className={`rounded-md px-3 py-1 text-sm ${
              filterStatus === s
                ? 'bg-accent/20 font-medium text-accent'
                : 'text-muted hover:text-foreground'
            }`}
          >
            {s === 'all' ? 'All' : FUNDING_STATUS_LABELS[s as FundingStatus]}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted">
              <th className="pb-2 pr-4 font-medium">Title</th>
              <th className="pb-2 pr-4 font-medium">Organization</th>
              <th className="pb-2 pr-4 font-medium">Amount</th>
              <th className="pb-2 pr-4 font-medium">Deadline</th>
              <th className="pb-2 pr-4 font-medium">Status</th>
              <th className="pb-2 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((opp) => (
              <tr key={opp.id} className="border-b border-border/50">
                <td className="py-2.5 pr-4">
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
                  {opp.notes && <p className="mt-0.5 text-xs text-muted">{opp.notes}</p>}
                </td>
                <td className="py-2.5 pr-4 text-muted">{opp.organization ?? '—'}</td>
                <td className="py-2.5 pr-4 text-muted">{opp.amount ?? '—'}</td>
                <td className="py-2.5 pr-4">
                  {opp.deadline ? (
                    <span
                      className={
                        isDeadlineSoon(opp.deadline) ? 'font-medium text-yellow-400' : 'text-muted'
                      }
                    >
                      {new Date(opp.deadline + 'T00:00:00').toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </span>
                  ) : (
                    <span className="text-muted">—</span>
                  )}
                </td>
                <td className="py-2.5 pr-4">
                  <select
                    value={opp.status}
                    onChange={(e) => handleStatusChange(opp.id, e.target.value)}
                    className="rounded border border-border bg-background px-1.5 py-0.5 text-xs"
                  >
                    {FUNDING_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {FUNDING_STATUS_LABELS[s]}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="py-2.5">
                  {editingId === opp.id ? (
                    <div className="flex gap-1">
                      <button
                        onClick={() => handleDelete(opp.id)}
                        className="rounded px-2 py-0.5 text-xs text-red-400 hover:bg-red-500/10"
                      >
                        Confirm delete
                      </button>
                      <button
                        onClick={() => setEditingId(null)}
                        className="rounded px-2 py-0.5 text-xs text-muted hover:text-foreground"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setEditingId(opp.id)}
                      className="rounded px-2 py-0.5 text-xs text-muted hover:text-red-400"
                    >
                      Delete
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="py-8 text-center text-muted">
                  No funding opportunities{filterStatus !== 'all' ? ` with status "${filterStatus}"` : ''}.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Add form */}
      {adding ? (
        <form onSubmit={handleCreate} className="mt-4 rounded-lg border border-border p-4">
          <h3 className="text-sm font-medium">Add Funding Opportunity</h3>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <input
              name="title"
              required
              placeholder="Grant title *"
              className="rounded border border-border bg-background px-3 py-1.5 text-sm"
            />
            <input
              name="organization"
              placeholder="Organization"
              className="rounded border border-border bg-background px-3 py-1.5 text-sm"
            />
            <input
              name="amount"
              placeholder="Amount (e.g. $500K)"
              className="rounded border border-border bg-background px-3 py-1.5 text-sm"
            />
            <input
              name="deadline"
              type="date"
              className="rounded border border-border bg-background px-3 py-1.5 text-sm"
            />
            <input
              name="url"
              placeholder="URL"
              className="rounded border border-border bg-background px-3 py-1.5 text-sm sm:col-span-2"
            />
            <textarea
              name="notes"
              placeholder="Notes"
              rows={2}
              className="rounded border border-border bg-background px-3 py-1.5 text-sm sm:col-span-2"
            />
          </div>
          <div className="mt-3 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setAdding(false)}
              className="rounded px-4 py-1.5 text-sm text-muted hover:text-foreground"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded bg-accent px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Add'}
            </button>
          </div>
        </form>
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="mt-4 w-full rounded border border-dashed border-border py-2 text-sm text-muted hover:border-accent hover:text-accent"
        >
          + Add funding opportunity
        </button>
      )}
    </div>
  );
}
