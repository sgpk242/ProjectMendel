'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import {
  THESIS_STANCES,
  THESIS_STANCE_LABELS,
  THESIS_STATUSES,
  THESIS_STATUS_LABELS,
  type ThesisStance,
  type ThesisStatus,
} from '@/lib/constants';

export type LinkedSource = {
  sourceId: string;
  title: string;
  stance: ThesisStance;
  note: string | null;
};

export type ThesisItem = {
  id: string;
  claim: string;
  changeMyMind: string | null;
  reviewDate: string | null;
  status: ThesisStatus;
  resolutionNote: string | null;
  resolvedAt: string | null;
  createdAt: string;
  sources: LinkedSource[];
};

const inputClass =
  'w-full rounded border border-border bg-background px-3 py-1.5 text-sm outline-none focus:border-accent';
const labelClass = 'flex flex-col gap-1 text-xs text-muted';

const STATUS_CLASS: Record<ThesisStatus, string> = {
  open: 'bg-accent/15 text-accent',
  confirmed: 'bg-emerald-500/15 text-emerald-300',
  refuted: 'bg-red-500/15 text-red-300',
  unresolved: 'bg-border text-muted',
};

const STANCE_CLASS: Record<ThesisStance, string> = {
  supports: 'text-emerald-300',
  contradicts: 'text-red-300',
  context: 'text-muted',
};

function formatDate(date: string): string {
  return new Date(date.length === 10 ? `${date}T00:00:00` : date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function ThesisForm({
  initial,
  onDone,
  onCreated,
}: {
  initial?: ThesisItem;
  onDone: () => void;
  onCreated?: (id: string) => void;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<ThesisStatus>(initial?.status ?? 'open');

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const payload: Record<string, unknown> = {
      claim: String(form.get('claim') ?? ''),
      change_my_mind: String(form.get('change_my_mind') ?? ''),
      review_date: String(form.get('review_date') ?? '') || null,
    };
    if (initial) {
      payload.status = status;
      payload.resolution_note = String(form.get('resolution_note') ?? '');
    }

    setSaving(true);
    setError(null);
    const res = await fetch(initial ? `/api/theses/${initial.id}` : '/api/theses', {
      method: initial ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    setSaving(false);
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setError(data.error ?? `HTTP ${res.status}`);
      return;
    }
    if (!initial && onCreated) {
      const created = (await res.json().catch(() => null)) as { id?: string } | null;
      if (created?.id) onCreated(created.id);
    }
    onDone();
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 rounded-lg border border-border bg-surface p-4">
      <label className={labelClass}>
        Claim *
        <textarea
          name="claim"
          required
          rows={2}
          defaultValue={initial?.claim}
          placeholder="e.g. Precision-fermented whey protein reaches cost parity with dairy whey by 2029"
          className={inputClass}
        />
      </label>
      <label className={`${labelClass} sm:w-56`}>
        Review date
        <input name="review_date" type="date" defaultValue={initial?.reviewDate ?? ''} className={inputClass} />
      </label>
      <label className={labelClass}>
        What would change my mind
        <textarea
          name="change_my_mind"
          rows={2}
          defaultValue={initial?.changeMyMind ?? ''}
          className={inputClass}
        />
      </label>
      {initial ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[12rem_1fr]">
          <label className={labelClass}>
            Status
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as ThesisStatus)}
              className={inputClass}
            >
              {THESIS_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {THESIS_STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          </label>
          <label className={labelClass}>
            Resolution note
            <input
              name="resolution_note"
              defaultValue={initial.resolutionNote ?? ''}
              placeholder={status === 'open' ? 'Filled in when you resolve it' : 'What happened?'}
              className={inputClass}
            />
          </label>
        </div>
      ) : null}
      {error ? <p className="text-sm text-red-300">{error}</p> : null}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={saving}
          className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-background disabled:opacity-50"
        >
          {saving ? 'Saving…' : initial ? 'Save' : 'Add thesis'}
        </button>
        <button
          type="button"
          onClick={onDone}
          className="rounded-md px-3 py-1.5 text-sm text-muted hover:text-foreground"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

type Suggestion = {
  sourceId: string;
  title: string;
  similarity: number;
  excerpt: string;
};

/**
 * Sources from the library that look related to the claim. Nothing is
 * linked until a stance is picked; Dismiss only hides a suggestion for now.
 */
function SuggestedSources({ thesisId }: { thesisId: string }) {
  const router = useRouter();
  const [suggestions, setSuggestions] = useState<Suggestion[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/theses/${thesisId}/suggestions`)
      .then(async (res) => {
        const data = (await res.json().catch(() => ({}))) as {
          suggestions?: Suggestion[];
          error?: string;
        };
        if (cancelled) return;
        if (!res.ok || !data.suggestions) setError(data.error ?? `HTTP ${res.status}`);
        else setSuggestions(data.suggestions);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [thesisId]);

  function remove(sourceId: string) {
    setSuggestions((list) => list?.filter((s) => s.sourceId !== sourceId) ?? null);
  }

  async function link(sourceId: string, stance: ThesisStance) {
    setBusyId(sourceId);
    const res = await fetch(`/api/theses/${thesisId}/sources`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sourceId, stance }),
    });
    setBusyId(null);
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setError(data.error ?? `HTTP ${res.status}`);
      return;
    }
    remove(sourceId);
    router.refresh();
  }

  return (
    <div className="mt-3 border-t border-border pt-3">
      <h4 className="text-xs font-semibold text-muted">Related sources in your library</h4>
      {error ? <p className="mt-2 text-xs text-red-300">{error}</p> : null}
      {suggestions === null && !error ? (
        <p className="mt-2 text-xs text-muted">Searching your library…</p>
      ) : null}
      {suggestions?.length === 0 ? (
        <p className="mt-2 text-xs text-muted">No related sources found in your library.</p>
      ) : null}
      {suggestions && suggestions.length > 0 ? (
        <ul className="mt-2 space-y-2">
          {suggestions.map((s) => (
            <li
              key={s.sourceId}
              className={`rounded-md border border-border px-3 py-2 ${busyId === s.sourceId ? 'opacity-50' : ''}`}
            >
              <Link href={`/source/${s.sourceId}`} className="text-sm text-accent hover:underline">
                {s.title}
              </Link>
              <p className="mt-1 line-clamp-2 text-xs text-muted">{s.excerpt}</p>
              <div className="mt-1.5 flex flex-wrap items-center gap-3 text-xs">
                {THESIS_STANCES.map((stance) => (
                  <button
                    key={stance}
                    type="button"
                    disabled={busyId !== null}
                    onClick={() => link(s.sourceId, stance)}
                    className={`hover:underline ${STANCE_CLASS[stance]}`}
                  >
                    {THESIS_STANCE_LABELS[stance]}
                  </button>
                ))}
                <span className="flex-1" />
                <button
                  type="button"
                  onClick={() => remove(s.sourceId)}
                  className="text-muted hover:text-foreground"
                >
                  Dismiss
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function ThesisCard({
  thesis,
  today,
  openSuggestions = false,
}: {
  thesis: ThesisItem;
  today: string;
  openSuggestions?: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(openSuggestions);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  if (editing) return <ThesisForm initial={thesis} onDone={() => setEditing(false)} />;

  const overdue = thesis.status === 'open' && thesis.reviewDate !== null && thesis.reviewDate < today;
  const counts = THESIS_STANCES.map((stance) => ({
    stance,
    count: thesis.sources.filter((s) => s.stance === stance).length,
  })).filter((c) => c.count > 0);

  async function handleDelete() {
    await fetch(`/api/theses/${thesis.id}`, { method: 'DELETE' });
    router.refresh();
  }

  return (
    <div
      className={`rounded-lg border bg-surface p-4 ${overdue ? 'border-yellow-600/60' : 'border-border'}`}
    >
      <div className="flex items-start justify-between gap-4">
        <p className="text-sm font-medium leading-snug">{thesis.claim}</p>
        <div className="flex shrink-0 items-center gap-2">
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_CLASS[thesis.status]}`}>
            {THESIS_STATUS_LABELS[thesis.status]}
          </span>
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
        {thesis.reviewDate ? (
          <span className={overdue ? 'font-medium text-yellow-300' : ''}>
            {overdue ? 'Overdue — review was due ' : 'Review '}
            {formatDate(thesis.reviewDate)}
          </span>
        ) : (
          <span>No review date</span>
        )}
        <span>Recorded {formatDate(thesis.createdAt)}</span>
        {thesis.resolvedAt ? <span>Resolved {formatDate(thesis.resolvedAt)}</span> : null}
      </div>

      {thesis.changeMyMind ? (
        <p className="mt-2 text-xs text-muted">
          <span className="font-medium text-foreground/80">Would change my mind: </span>
          {thesis.changeMyMind}
        </p>
      ) : null}
      {thesis.resolutionNote ? (
        <p className="mt-1 text-xs text-muted">
          <span className="font-medium text-foreground/80">Resolution: </span>
          {thesis.resolutionNote}
        </p>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-3 text-xs">
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          disabled={thesis.sources.length === 0}
          className="text-muted hover:text-foreground disabled:hover:text-muted"
        >
          {thesis.sources.length === 0
            ? 'No linked sources'
            : `${expanded ? '▾' : '▸'} ${thesis.sources.length} linked source${thesis.sources.length === 1 ? '' : 's'}`}
          {counts.length > 0 ? (
            <span className="ml-1.5">
              (
              {counts.map((c, i) => (
                <span key={c.stance} className={STANCE_CLASS[c.stance]}>
                  {i > 0 ? ', ' : ''}
                  {c.count} {THESIS_STANCE_LABELS[c.stance].toLowerCase()}
                </span>
              ))}
              )
            </span>
          ) : null}
        </button>
        <button
          type="button"
          onClick={() => setShowSuggestions((v) => !v)}
          className="text-accent hover:underline"
        >
          {showSuggestions ? 'Hide related sources' : 'Find related sources'}
        </button>
        <span className="flex-1" />
        <button type="button" onClick={() => setEditing(true)} className="text-muted hover:text-foreground">
          Edit
        </button>
        {confirmingDelete ? (
          <>
            <button type="button" onClick={handleDelete} className="text-red-400 hover:underline">
              Confirm delete
            </button>
            <button
              type="button"
              onClick={() => setConfirmingDelete(false)}
              className="text-muted hover:text-foreground"
            >
              Cancel
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmingDelete(true)}
            className="text-muted hover:text-red-400"
          >
            Delete
          </button>
        )}
      </div>

      {expanded ? (
        <div className="mt-3 space-y-3 border-t border-border pt-3">
          {THESIS_STANCES.map((stance) => {
            const linked = thesis.sources.filter((s) => s.stance === stance);
            if (linked.length === 0) return null;
            return (
              <div key={stance}>
                <h4 className={`text-xs font-semibold ${STANCE_CLASS[stance]}`}>
                  {THESIS_STANCE_LABELS[stance]}
                </h4>
                <ul className="mt-1 space-y-1">
                  {linked.map((s) => (
                    <li key={s.sourceId} className="text-sm">
                      <Link href={`/source/${s.sourceId}`} className="text-accent hover:underline">
                        {s.title}
                      </Link>
                      {s.note ? <span className="ml-2 text-xs text-muted">— {s.note}</span> : null}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      ) : null}

      {showSuggestions ? <SuggestedSources thesisId={thesis.id} /> : null}
    </div>
  );
}

/**
 * Theses sorted by review date (soonest first, undated last). Open theses
 * past their review date are flagged as overdue. `today` is passed from the
 * server (YYYY-MM-DD) so server and client render the same flags.
 */
export function ThesisList({ theses, today }: { theses: ThesisItem[]; today: string }) {
  const [adding, setAdding] = useState(false);
  // The thesis just created opens with its related-source suggestions showing.
  const [justCreatedId, setJustCreatedId] = useState<string | null>(null);
  const overdueCount = theses.filter(
    (t) => t.status === 'open' && t.reviewDate !== null && t.reviewDate < today,
  ).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-muted">
          {theses.length} thes{theses.length === 1 ? 'is' : 'es'}
          {overdueCount > 0 ? (
            <span className="ml-2 font-medium text-yellow-300">{overdueCount} overdue for review</span>
          ) : null}
        </p>
        {!adding ? (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-background"
          >
            New thesis
          </button>
        ) : null}
      </div>

      {adding ? <ThesisForm onDone={() => setAdding(false)} onCreated={setJustCreatedId} /> : null}

      {theses.length === 0 && !adding ? (
        <div className="rounded-lg border border-dashed border-border py-16 text-center text-sm text-muted">
          No theses yet. Record a call about where the industry is heading, with a date to check it.
        </div>
      ) : null}

      {theses.map((t) => (
        <ThesisCard key={t.id} thesis={t} today={today} openSuggestions={t.id === justCreatedId} />
      ))}
    </div>
  );
}
