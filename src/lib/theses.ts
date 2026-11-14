import { THESIS_STATUSES, type ThesisStatus } from '@/lib/constants';
import type { TablesUpdate } from '@/lib/types/database';

type ThesisFields = Omit<TablesUpdate<'theses'>, 'id' | 'user_id' | 'created_at' | 'updated_at'>;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function optionalText(value: unknown, field: string): string | null | Error {
  if (value === null) return null;
  if (typeof value !== 'string') return new Error(`${field} must be a string or null`);
  return value.trim() || null;
}

/**
 * Validate the editable thesis fields present in a request body. Only keys
 * that are present are returned, so the same parser serves create (with
 * `requireClaim`) and partial PATCH updates. `resolved_at` is never set
 * here — use `resolvedAtFor()` once the previous status is known.
 */
export function parseThesisFields(
  body: unknown,
  { requireClaim }: { requireClaim: boolean },
): { fields: ThesisFields } | { error: string } {
  const input = (body ?? {}) as Record<string, unknown>;
  const fields: ThesisFields = {};

  if (input.claim !== undefined || requireClaim) {
    if (typeof input.claim !== 'string' || !input.claim.trim()) {
      return { error: 'claim is required' };
    }
    fields.claim = input.claim.trim();
  }

  for (const key of ['change_my_mind', 'resolution_note'] as const) {
    if (input[key] === undefined) continue;
    const value = optionalText(input[key], key);
    if (value instanceof Error) return { error: value.message };
    fields[key] = value;
  }

  if (input.review_date !== undefined) {
    if (input.review_date === null || input.review_date === '') fields.review_date = null;
    else if (typeof input.review_date !== 'string' || !DATE_RE.test(input.review_date)) {
      return { error: 'review_date must be a YYYY-MM-DD date or null' };
    } else fields.review_date = input.review_date;
  }

  if (input.status !== undefined) {
    if (!THESIS_STATUSES.includes(input.status as ThesisStatus)) {
      return { error: `status must be one of: ${THESIS_STATUSES.join(', ')}` };
    }
    fields.status = input.status as ThesisStatus;
  }

  return { fields };
}

/**
 * `resolved_at` for a status change: stamped when a thesis moves from open
 * to a resolved status, cleared when it moves back to open. Undefined (leave
 * as is) when the status isn't changing between open and resolved.
 */
export function resolvedAtFor(
  previous: ThesisStatus | null,
  next: ThesisStatus | undefined,
): string | null | undefined {
  if (next === undefined || next === previous) return undefined;
  if (next === 'open') return null;
  if (previous === null || previous === 'open') return new Date().toISOString();
  return undefined;
}
