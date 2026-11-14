'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import type { DelistChoice, MergePlan } from '@/lib/compound-merge';

const buttonClass =
  'rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-background disabled:opacity-50';

function ratingLabel(rating: number | null): string {
  if (rating === null) return 'unrated';
  if (rating === 0) return 'de-listed';
  return `${rating}/5`;
}

/**
 * Step 1: look product names up in PubChem (cache only). Step 2: review the
 * proposed merges — nothing is written until "Apply merges".
 */
export function CompoundMergeReview({ plan }: { plan: MergePlan }) {
  const router = useRouter();
  const [resolving, setResolving] = useState(false);
  const [remaining, setRemaining] = useState(plan.unresolvedCount);
  const [resolveError, setResolveError] = useState<string | null>(null);
  const [choices, setChoices] = useState<Record<string, DelistChoice>>({});
  const [applying, setApplying] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  async function resolveAll() {
    setResolving(true);
    setResolveError(null);
    try {
      let left = remaining;
      while (left > 0) {
        const res = await fetch('/api/maintenance/resolve-compounds', { method: 'POST' });
        const data = (await res.json()) as { remaining?: number; error?: string };
        if (!res.ok || typeof data.remaining !== 'number') {
          throw new Error(data.error ?? `HTTP ${res.status}`);
        }
        left = data.remaining;
        setRemaining(left);
      }
    } catch (err) {
      setResolveError(err instanceof Error ? err.message : String(err));
    }
    setResolving(false);
    router.refresh();
  }

  async function apply() {
    setApplying(true);
    setResult(null);
    try {
      const res = await fetch('/api/maintenance/compound-merges', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ choices }),
      });
      const data = (await res.json()) as {
        merged?: number;
        assigned?: number;
        skipped?: string[];
        errors?: string[];
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      const parts = [`Merged ${data.merged} groups`, `recorded PubChem IDs on ${data.assigned} other compounds`];
      if (data.skipped?.length) parts.push(`skipped: ${data.skipped.join('; ')}`);
      if (data.errors?.length) parts.push(`errors: ${data.errors.join('; ')}`);
      setResult(parts.join('. '));
    } catch (err) {
      setResult(`Failed: ${err instanceof Error ? err.message : String(err)}`);
    }
    setApplying(false);
    router.refresh();
  }

  const conflicts = plan.proposals.filter((p) => p.delistConflict);
  const unchosen = conflicts.filter((p) => !choices[String(p.cid)]).length;
  const nothingToApply = plan.proposals.length === 0 && plan.assignments.length === 0;

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-medium">1. Look up names in PubChem</h3>
        <p className="mt-1 text-sm text-muted">
          {remaining > 0
            ? `${remaining} compound names haven't been looked up yet. This only fills a lookup cache — no compounds change.`
            : 'Every compound name has been looked up.'}
        </p>
        {remaining > 0 ? (
          <button type="button" onClick={resolveAll} disabled={resolving} className={`mt-2 ${buttonClass}`}>
            {resolving ? `Looking up… (${remaining} left)` : `Look up ${remaining} names`}
          </button>
        ) : null}
        {resolveError ? <p className="mt-2 text-sm text-red-300">{resolveError}</p> : null}
      </div>

      <div>
        <h3 className="text-sm font-medium">2. Review proposed merges</h3>
        <p className="mt-1 text-sm text-muted">
          {plan.proposals.length} groups of compounds share a PubChem ID and would be merged.
          Merging keeps every source link and combines notes; the merged compound takes PubChem&apos;s
          name and the highest rating. {plan.assignments.length} other compounds will just have
          their PubChem ID recorded.
        </p>

        {plan.proposals.length > 0 ? (
          <ul className="mt-3 space-y-3">
            {plan.proposals.map((p) => (
              <li key={p.cid} className="rounded-md border border-border px-3 py-2">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-sm font-medium">{p.name}</span>
                  <a
                    href={`https://pubchem.ncbi.nlm.nih.gov/compound/${p.cid}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-accent hover:underline"
                  >
                    PubChem CID {p.cid} ↗
                  </a>
                </div>
                <ul className="mt-1.5 space-y-0.5 text-xs text-muted">
                  {p.members.map((m) => (
                    <li key={m.id}>
                      {m.name} · {m.sourceCount} sources · {ratingLabel(m.interestRating)}
                      {m.notes ? ' · has notes' : ''}
                      {m.id === p.survivorId ? ' · kept' : ''}
                    </li>
                  ))}
                </ul>
                {p.delistConflict ? (
                  <fieldset className="mt-2 flex flex-wrap gap-4 text-xs">
                    <legend className="mb-1 text-yellow-300">
                      One of these is de-listed and another is rated. Which should the merged compound keep?
                    </legend>
                    <label className="flex items-center gap-1.5">
                      <input
                        type="radio"
                        name={`choice-${p.cid}`}
                        checked={choices[String(p.cid)] === 'delist'}
                        onChange={() => setChoices((c) => ({ ...c, [String(p.cid)]: 'delist' }))}
                        className="accent-accent"
                      />
                      Keep de-listed
                    </label>
                    <label className="flex items-center gap-1.5">
                      <input
                        type="radio"
                        name={`choice-${p.cid}`}
                        checked={choices[String(p.cid)] === 'rating'}
                        onChange={() => setChoices((c) => ({ ...c, [String(p.cid)]: 'rating' }))}
                        className="accent-accent"
                      />
                      Keep rating {p.bestRating}/5
                    </label>
                  </fieldset>
                ) : (
                  <p className="mt-1.5 text-xs text-muted">Merged rating: {ratingLabel(p.mergedRating)}</p>
                )}
              </li>
            ))}
          </ul>
        ) : null}

        <div className="mt-3 flex items-center gap-3">
          <button
            type="button"
            onClick={apply}
            disabled={applying || resolving || nothingToApply || unchosen > 0}
            className={buttonClass}
          >
            {applying ? 'Applying…' : 'Apply merges'}
          </button>
          {unchosen > 0 ? (
            <span className="text-xs text-yellow-300">
              Choose for {unchosen} de-list conflict{unchosen === 1 ? '' : 's'} first.
            </span>
          ) : null}
        </div>
        {result ? <p className="mt-2 text-sm text-muted">{result}</p> : null}
      </div>
    </div>
  );
}
