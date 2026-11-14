'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import {
  THESIS_STANCES,
  THESIS_STANCE_LABELS,
  type ThesisStance,
  type ThesisStatus,
} from '@/lib/constants';

export type ThesisOption = { id: string; claim: string; status: ThesisStatus };
export type ThesisLink = { thesisId: string; claim: string; stance: ThesisStance; note: string | null };

const selectClass =
  'rounded border border-border bg-background px-2 py-1 text-sm outline-none focus:border-accent';

const STANCE_CLASS: Record<ThesisStance, string> = {
  supports: 'text-emerald-300',
  contradicts: 'text-red-300',
  context: 'text-muted',
};

/** Theses this source bears on, with a stance, plus a form to link another. */
export function ThesisLinks({
  sourceId,
  links,
  theses,
}: {
  sourceId: string;
  links: ThesisLink[];
  theses: ThesisOption[];
}) {
  const router = useRouter();
  const linkedIds = new Set(links.map((l) => l.thesisId));
  const available = theses.filter((t) => !linkedIds.has(t.id));

  const [thesisId, setThesisId] = useState('');
  const [stance, setStance] = useState<ThesisStance>('supports');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(targetThesisId: string, nextStance: ThesisStance, nextNote: string | null) {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/theses/${targetThesisId}/sources`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sourceId, stance: nextStance, note: nextNote }),
    });
    setBusy(false);
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setError(data.error ?? `HTTP ${res.status}`);
      return false;
    }
    router.refresh();
    return true;
  }

  async function unlink(targetThesisId: string) {
    setBusy(true);
    await fetch(`/api/theses/${targetThesisId}/sources?sourceId=${encodeURIComponent(sourceId)}`, {
      method: 'DELETE',
    });
    setBusy(false);
    router.refresh();
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!thesisId) return;
    if (await save(thesisId, stance, note.trim() || null)) {
      setThesisId('');
      setNote('');
    }
  }

  return (
    <div className={busy ? 'opacity-60' : ''}>
      {links.length > 0 ? (
        <ul className="space-y-2">
          {links.map((l) => (
            <li key={l.thesisId} className="rounded-md border border-border px-3 py-2">
              <div className="flex items-start justify-between gap-3">
                <Link href="/theses" className="text-sm hover:text-accent">
                  {l.claim}
                </Link>
                <div className="flex shrink-0 items-center gap-2">
                  <select
                    value={l.stance}
                    onChange={(e) => save(l.thesisId, e.target.value as ThesisStance, l.note)}
                    disabled={busy}
                    className={`${selectClass} ${STANCE_CLASS[l.stance]}`}
                    aria-label="Stance"
                  >
                    {THESIS_STANCES.map((s) => (
                      <option key={s} value={s}>
                        {THESIS_STANCE_LABELS[s]}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => unlink(l.thesisId)}
                    disabled={busy}
                    className="text-xs text-muted hover:text-red-400"
                  >
                    Remove
                  </button>
                </div>
              </div>
              {l.note ? <p className="mt-1 text-xs text-muted">{l.note}</p> : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted">Not linked to any thesis.</p>
      )}

      {theses.length === 0 ? (
        <p className="mt-2 text-sm text-muted">
          <Link href="/theses" className="text-accent hover:underline">
            Record a thesis
          </Link>{' '}
          to link this source to it.
        </p>
      ) : available.length > 0 ? (
        <form onSubmit={handleAdd} className="mt-3 flex flex-wrap items-center gap-2">
          <select
            value={thesisId}
            onChange={(e) => setThesisId(e.target.value)}
            className={`${selectClass} max-w-xs`}
            aria-label="Thesis"
          >
            <option value="">Link to a thesis…</option>
            {available.map((t) => (
              <option key={t.id} value={t.id}>
                {t.claim.length > 80 ? `${t.claim.slice(0, 80)}…` : t.claim}
                {t.status !== 'open' ? ` (${t.status})` : ''}
              </option>
            ))}
          </select>
          <select
            value={stance}
            onChange={(e) => setStance(e.target.value as ThesisStance)}
            className={selectClass}
            aria-label="Stance"
          >
            {THESIS_STANCES.map((s) => (
              <option key={s} value={s}>
                {THESIS_STANCE_LABELS[s]}
              </option>
            ))}
          </select>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Note (optional)"
            className={`${selectClass} min-w-40 flex-1`}
          />
          <button
            type="submit"
            disabled={!thesisId || busy}
            className="rounded-md bg-accent px-3 py-1 text-sm font-medium text-background disabled:opacity-50"
          >
            Link
          </button>
        </form>
      ) : null}
      {error ? <p className="mt-2 text-sm text-red-300">{error}</p> : null}
    </div>
  );
}
