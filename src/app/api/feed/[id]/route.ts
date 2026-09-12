import { NextResponse } from 'next/server';

import { FEED_ITEM_STATUSES } from '@/lib/constants';
import { createClient } from '@/lib/supabase/server';

/** PATCH /api/feed/[id] — update a feed item's status. */
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

  const { status } = (body ?? {}) as Record<string, unknown>;

  if (
    typeof status !== 'string' ||
    !FEED_ITEM_STATUSES.includes(status as (typeof FEED_ITEM_STATUSES)[number])
  ) {
    return NextResponse.json(
      { error: `status must be one of: ${FEED_ITEM_STATUSES.join(', ')}` },
      { status: 400 },
    );
  }

  const { data, error } = await supabase
    .from('feed_items')
    .update({ status: status as 'new' | 'reviewed' | 'dismissed' | 'ingested' })
    .eq('id', id)
    .select('*')
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { error: `Failed to update feed item: ${error.message}` },
      { status: 500 },
    );
  }

  if (!data) {
    return NextResponse.json({ error: 'Feed item not found' }, { status: 404 });
  }

  return NextResponse.json(data, { status: 200 });
}
