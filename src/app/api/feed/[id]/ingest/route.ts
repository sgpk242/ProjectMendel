import { NextResponse } from 'next/server';

import { createClient } from '@/lib/supabase/server';
import { runIngestPipeline } from '@/lib/pipeline/ingest';

/**
 * POST /api/feed/[id]/ingest — ingest a feed item into the main corpus.
 *
 * 1. Creates a pending source row for the feed item's URL
 * 2. Runs the full ingest pipeline
 * 3. Updates the feed item's status to 'ingested' and links the new source
 */
export async function POST(
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

  // Fetch the feed item
  const { data: feedItem, error: fetchError } = await supabase
    .from('feed_items')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (fetchError) {
    return NextResponse.json(
      { error: `Failed to fetch feed item: ${fetchError.message}` },
      { status: 500 },
    );
  }

  if (!feedItem) {
    return NextResponse.json({ error: 'Feed item not found' }, { status: 404 });
  }

  if (feedItem.status === 'ingested') {
    return NextResponse.json(
      { error: 'This feed item has already been ingested' },
      { status: 409 },
    );
  }

  // Create a pending source row
  const url = feedItem.url;
  const canonical = url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/+$/, '');

  const { data: source, error: sourceError } = await supabase
    .from('sources')
    .insert({
      user_id: user.id,
      url,
      url_canonical: canonical,
      ingest_status: 'pending',
    })
    .select('id')
    .single();

  if (sourceError) {
    return NextResponse.json(
      { error: `Failed to create source: ${sourceError.message}` },
      { status: 500 },
    );
  }

  // Run the pipeline
  const result = await runIngestPipeline(supabase, user.id, source.id, url);

  // Update the feed item
  await supabase
    .from('feed_items')
    .update({ status: 'ingested', ingested_source_id: source.id })
    .eq('id', id);

  return NextResponse.json(result, { status: 200 });
}
