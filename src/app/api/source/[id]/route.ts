import { NextResponse } from 'next/server';

import { SOURCE_STATUSES, SOURCE_TYPES } from '@/lib/constants';
import { createClient } from '@/lib/supabase/server';
import type { TablesUpdate } from '@/lib/types/database';

/**
 * PATCH /api/source/[id] — edit the fields the user controls directly:
 * reading status, source type, interest rating, and their own note. Every
 * quick action on the dashboard and every editable field on the detail page
 * goes through this one handler. RLS ("sources: owner can update") scopes
 * the write to the caller's own row, so a bad id 404s the same way DELETE's
 * does.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (typeof body !== 'object' || body === null) {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { status, source_type, interest_rating, user_note } = body as Record<string, unknown>;
  const updates: TablesUpdate<'sources'> = {};

  if (status !== undefined) {
    if (typeof status !== 'string' || !SOURCE_STATUSES.includes(status as (typeof SOURCE_STATUSES)[number])) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
    }
    updates.status = status as (typeof SOURCE_STATUSES)[number];
  }

  if (source_type !== undefined) {
    if (
      typeof source_type !== 'string' ||
      !SOURCE_TYPES.includes(source_type as (typeof SOURCE_TYPES)[number])
    ) {
      return NextResponse.json({ error: 'Invalid source_type' }, { status: 400 });
    }
    updates.source_type = source_type as (typeof SOURCE_TYPES)[number];
  }

  if (interest_rating !== undefined) {
    if (
      interest_rating !== null &&
      (typeof interest_rating !== 'number' ||
        !Number.isInteger(interest_rating) ||
        interest_rating < 1 ||
        interest_rating > 5)
    ) {
      return NextResponse.json(
        { error: 'interest_rating must be an integer 1-5 or null' },
        { status: 400 },
      );
    }
    updates.interest_rating = interest_rating;
  }

  if (user_note !== undefined) {
    if (user_note !== null && typeof user_note !== 'string') {
      return NextResponse.json({ error: 'user_note must be a string or null' }, { status: 400 });
    }
    updates.user_note = user_note;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No editable fields in body' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('sources')
    .update(updates)
    .eq('id', id)
    .select('id, status, source_type, interest_rating, user_note')
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: `Failed to update source: ${error.message}` }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ error: 'Source not found' }, { status: 404 });
  }

  return NextResponse.json(data, { status: 200 });
}

/**
 * DELETE /api/source/[id] — remove a source.
 *
 * `chunks`, `source_topics`, `source_similarities`, and `collection_sources`
 * all reference `sources` with `ON DELETE CASCADE` (001_initial_schema.sql),
 * so this one delete cleans up everything the ingest pipeline wrote. RLS
 * ("sources: owner can delete") scopes it to the caller's own rows — no
 * explicit user_id check needed here.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data, error } = await supabase
    .from('sources')
    .delete()
    .eq('id', id)
    .select('id')
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { error: `Failed to delete source: ${error.message}` },
      { status: 500 },
    );
  }

  // RLS silently hides rows the caller doesn't own, so a missing id here
  // means either it never existed or it belongs to someone else — the same
  // "not found" from this user's point of view either way.
  if (!data) {
    return NextResponse.json({ error: 'Source not found' }, { status: 404 });
  }

  return NextResponse.json({ id: data.id }, { status: 200 });
}
