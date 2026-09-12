import { NextResponse } from 'next/server';

import { FEED_SOURCE_TYPES } from '@/lib/constants';
import { createClient } from '@/lib/supabase/server';

/** GET /api/feed/queries — list the caller's feed queries. */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data, error } = await supabase
    .from('feed_queries')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json(
      { error: `Failed to list feed queries: ${error.message}` },
      { status: 500 },
    );
  }

  return NextResponse.json({ queries: data ?? [] }, { status: 200 });
}

/** POST /api/feed/queries — create a new feed query. */
export async function POST(request: Request) {
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

  const { queryText, sourceType } = (body ?? {}) as Record<string, unknown>;

  if (typeof queryText !== 'string' || !queryText.trim()) {
    return NextResponse.json({ error: 'queryText is required' }, { status: 400 });
  }

  if (
    sourceType !== undefined &&
    !FEED_SOURCE_TYPES.includes(sourceType as (typeof FEED_SOURCE_TYPES)[number])
  ) {
    return NextResponse.json(
      { error: `sourceType must be one of: ${FEED_SOURCE_TYPES.join(', ')}` },
      { status: 400 },
    );
  }

  const { data, error } = await supabase
    .from('feed_queries')
    .insert({
      user_id: user.id,
      query_text: queryText.trim(),
      source_type: (sourceType as 'openalex' | 'web') ?? 'openalex',
    })
    .select('*')
    .single();

  if (error) {
    return NextResponse.json(
      { error: `Failed to create feed query: ${error.message}` },
      { status: 500 },
    );
  }

  return NextResponse.json(data, { status: 201 });
}
