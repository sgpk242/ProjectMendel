import { NextResponse } from 'next/server';

import { createClient } from '@/lib/supabase/server';

/**
 * POST /api/collections/[id]/sources — add a source to a collection.
 *
 * `collection_sources` has no `user_id` column of its own; RLS proves
 * ownership through subqueries against `collections` and `sources`, so
 * adding someone else's source (or to someone else's collection) is
 * rejected by the database itself, not just this handler.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: collectionId } = await params;

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

  const { sourceId } = (body ?? {}) as Record<string, unknown>;
  if (typeof sourceId !== 'string' || !sourceId) {
    return NextResponse.json({ error: 'sourceId is required' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('collection_sources')
    .upsert(
      { collection_id: collectionId, source_id: sourceId },
      { onConflict: 'collection_id,source_id', ignoreDuplicates: true },
    )
    .select('collection_id, source_id, added_at')
    .maybeSingle();

  if (error) {
    // RLS rejects a collection_id/source_id the caller doesn't own with a
    // permission-denied error rather than a normal "no rows" result.
    const status = error.code === '42501' ? 404 : 500;
    const message = status === 404 ? 'Collection or source not found' : `Failed to add source: ${error.message}`;
    return NextResponse.json({ error: message }, { status });
  }

  // ignoreDuplicates skips the write (and the select) when the row already
  // exists — that's success from the caller's point of view, just with no
  // row to echo back.
  return NextResponse.json(data ?? { collection_id: collectionId, source_id: sourceId }, {
    status: 201,
  });
}
