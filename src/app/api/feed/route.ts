import { NextResponse } from 'next/server';

import { createClient } from '@/lib/supabase/server';

/**
 * GET /api/feed — list the caller's feed items.
 *
 * Query params:
 *   ?status=new (default) — filter by status
 *   ?page=1               — 1-indexed pagination (20 per page)
 */
export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status') ?? 'new';
  const page = Math.max(1, Number(searchParams.get('page') ?? '1'));
  const perPage = 20;

  let query = supabase
    .from('feed_items')
    .select('*', { count: 'exact' })
    .order('fetched_at', { ascending: false })
    .range((page - 1) * perPage, page * perPage - 1);

  if (status !== 'all') {
    query = query.eq('status', status as 'new' | 'reviewed' | 'dismissed' | 'ingested');
  }

  const { data, error, count } = await query;

  if (error) {
    return NextResponse.json(
      { error: `Failed to list feed items: ${error.message}` },
      { status: 500 },
    );
  }

  return NextResponse.json(
    {
      items: data ?? [],
      total: count ?? 0,
      page,
      perPage,
    },
    { status: 200 },
  );
}
