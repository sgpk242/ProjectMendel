import { NextResponse } from 'next/server';

import { FEED_SOURCE_TYPES } from '@/lib/constants';
import { createClient } from '@/lib/supabase/server';
import type { TablesUpdate } from '@/lib/types/database';

/** PATCH /api/feed/queries/[id] — update a feed query. */
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

  const { queryText, sourceType, enabled } = (body ?? {}) as Record<string, unknown>;

  const updates: TablesUpdate<'feed_queries'> = {};

  if (queryText !== undefined) {
    if (typeof queryText !== 'string' || !queryText.trim()) {
      return NextResponse.json({ error: 'queryText must be a non-empty string' }, { status: 400 });
    }
    updates.query_text = queryText.trim();
  }

  if (sourceType !== undefined) {
    if (!FEED_SOURCE_TYPES.includes(sourceType as (typeof FEED_SOURCE_TYPES)[number])) {
      return NextResponse.json(
        { error: `sourceType must be one of: ${FEED_SOURCE_TYPES.join(', ')}` },
        { status: 400 },
      );
    }
    updates.source_type = sourceType as 'openalex' | 'web';
  }

  if (enabled !== undefined) {
    if (typeof enabled !== 'boolean') {
      return NextResponse.json({ error: 'enabled must be a boolean' }, { status: 400 });
    }
    updates.enabled = enabled;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No editable fields in body' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('feed_queries')
    .update(updates)
    .eq('id', id)
    .select('*')
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { error: `Failed to update feed query: ${error.message}` },
      { status: 500 },
    );
  }

  if (!data) {
    return NextResponse.json({ error: 'Feed query not found' }, { status: 404 });
  }

  return NextResponse.json(data, { status: 200 });
}

/** DELETE /api/feed/queries/[id] — remove a feed query. */
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
    .from('feed_queries')
    .delete()
    .eq('id', id)
    .select('id')
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { error: `Failed to delete feed query: ${error.message}` },
      { status: 500 },
    );
  }

  if (!data) {
    return NextResponse.json({ error: 'Feed query not found' }, { status: 404 });
  }

  return NextResponse.json({ id: data.id }, { status: 200 });
}
