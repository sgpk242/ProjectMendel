import { NextResponse } from 'next/server';

import { createClient } from '@/lib/supabase/server';

/**
 * POST /api/feed/queries/import-topics
 *
 * Bulk-create `openalex` feed queries from the caller's existing topic names.
 * Skips topics that already have a matching query (case-insensitive).
 */
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Load existing topics
  const { data: topics, error: topicsError } = await supabase
    .from('topics')
    .select('name')
    .eq('user_id', user.id);

  if (topicsError) {
    return NextResponse.json(
      { error: `Failed to load topics: ${topicsError.message}` },
      { status: 500 },
    );
  }

  if (!topics || topics.length === 0) {
    return NextResponse.json({ imported: 0, message: 'No topics to import' }, { status: 200 });
  }

  // Load existing feed queries to dedup
  const { data: existingQueries, error: queriesError } = await supabase
    .from('feed_queries')
    .select('query_text')
    .eq('user_id', user.id);

  if (queriesError) {
    return NextResponse.json(
      { error: `Failed to load existing queries: ${queriesError.message}` },
      { status: 500 },
    );
  }

  const existingLower = new Set(
    (existingQueries ?? []).map((q) => q.query_text.toLowerCase()),
  );

  const toImport = topics.filter((t) => !existingLower.has(t.name.toLowerCase()));

  if (toImport.length === 0) {
    return NextResponse.json(
      { imported: 0, message: 'All topics already have feed queries' },
      { status: 200 },
    );
  }

  const { error: insertError } = await supabase.from('feed_queries').insert(
    toImport.map((t) => ({
      user_id: user.id,
      query_text: t.name,
      source_type: 'openalex' as const,
    })),
  );

  if (insertError) {
    return NextResponse.json(
      { error: `Failed to import topics as feed queries: ${insertError.message}` },
      { status: 500 },
    );
  }

  return NextResponse.json(
    { imported: toImport.length, message: `Imported ${toImport.length} topic(s) as feed queries` },
    { status: 201 },
  );
}
