import { after, NextResponse } from 'next/server';

import { runIngestPipeline } from '@/lib/pipeline/ingest';
import { createClient } from '@/lib/supabase/server';
import { canonicalizeUrl } from '@/lib/url';

// Matches the Vercel Hobby cap. The sync path already ran this long before
// async mode existed — `after()` doesn't change total duration, it just lets
// the response go out first.
export const maxDuration = 60;

/**
 * POST /api/ingest — capture a URL and run it through the full pipeline.
 *
 * By default runs synchronously: fetch → extract → classify → chunk → embed
 * → store → similarity check, then responds with the full `IngestResult`
 * (201). Pass `async: true` in the body (used by the mobile capture page) to
 * insert the row, schedule the pipeline via `after()`, and respond
 * immediately (202) with just the new source id — the pipeline finishes in
 * the background and `ingest_status` on the row tracks its progress.
 */
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
    return NextResponse.json({ error: 'Expected a JSON body' }, { status: 400 });
  }

  const { url, interestRating, userNote, async: asyncMode } = body as {
    url?: unknown;
    interestRating?: unknown;
    userNote?: unknown;
    async?: unknown;
  };

  if (typeof url !== 'string' || url.length === 0) {
    return NextResponse.json({ error: 'Field "url" is required' }, { status: 400 });
  }

  const rating =
    typeof interestRating === 'number' && interestRating >= 1 && interestRating <= 5
      ? Math.round(interestRating)
      : null;
  const note = typeof userNote === 'string' && userNote.trim() ? userNote.trim() : null;

  let urlCanonical: string;
  try {
    urlCanonical = canonicalizeUrl(url);
  } catch {
    return NextResponse.json({ error: 'Not a valid http(s) URL' }, { status: 400 });
  }

  const { data: existing } = await supabase
    .from('sources')
    .select('id, title, ingest_status')
    .eq('url_canonical', urlCanonical)
    .maybeSingle();

  if (existing) {
    return NextResponse.json(
      {
        error: 'This URL has already been captured',
        existingSource: existing,
      },
      { status: 409 },
    );
  }

  const { data: source, error: insertError } = await supabase
    .from('sources')
    .insert({
      user_id: user.id,
      url,
      url_canonical: urlCanonical,
      interest_rating: rating,
      user_note: note,
      ingest_status: 'pending',
    })
    .select('id')
    .single();

  if (insertError) {
    // 23505 = unique_violation — lost a race against another capture of the same URL.
    if (insertError.code === '23505') {
      return NextResponse.json({ error: 'This URL has already been captured' }, { status: 409 });
    }
    return NextResponse.json(
      { error: `Failed to create source: ${insertError.message}` },
      { status: 500 },
    );
  }

  if (asyncMode === true) {
    after(async () => {
      try {
        await runIngestPipeline(supabase, user.id, source.id, url);
      } catch {
        // runIngestPipeline already records the failure on the row.
      }
    });
    return NextResponse.json({ sourceId: source.id, status: 'pending' }, { status: 202 });
  }

  try {
    const result = await runIngestPipeline(supabase, user.id, source.id, url);
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message, sourceId: source.id }, { status: 500 });
  }
}
