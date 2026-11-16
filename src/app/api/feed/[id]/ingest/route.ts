import { after, NextResponse } from 'next/server';

import { createClient } from '@/lib/supabase/server';
import { classifySignals } from '@/lib/feed/signal';
import { runCompoundStage, runIngestPipeline } from '@/lib/pipeline/ingest';

// Covers the compound stage scheduled with `after()`, which runs within this
// function's duration budget. On Vercel, 300s needs a plan that allows it.
export const maxDuration = 300;

/**
 * POST /api/feed/[id]/ingest — ingest a feed item into the main corpus.
 *
 * 1. Creates a pending source row for the feed item's URL, carrying over the
 *    item's commercial signal (classified now if the refresh hadn't yet)
 * 2. Runs the full ingest pipeline
 * 3. Updates the feed item's status to 'ingested' and links the new source
 * 4. Schedules full-text compound extraction to run after the response
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

  // The signal tag follows the article into the library. Classify now if
  // the refresh didn't get to this item; a Groq failure leaves it untagged
  // rather than blocking the ingest.
  let signalType = feedItem.signal_type;
  let signalNote = feedItem.signal_note;
  if (!signalType) {
    try {
      const result = (await classifySignals([feedItem])).get(feedItem.id);
      if (result) {
        signalType = result.signal;
        signalNote = result.note;
        await supabase
          .from('feed_items')
          .update({ signal_type: signalType, signal_note: signalNote })
          .eq('id', id);
      }
    } catch {
      // Left untagged; it can be set on the source page.
    }
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
      signal_type: signalType,
      signal_note: signalNote,
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
  after(() => runCompoundStage(supabase, user.id, source.id));

  // Update the feed item
  await supabase
    .from('feed_items')
    .update({ status: 'ingested', ingested_source_id: source.id })
    .eq('id', id);

  return NextResponse.json(result, { status: 200 });
}
