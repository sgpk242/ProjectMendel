import { NextResponse } from 'next/server';

import { runIngestPipeline } from '@/lib/pipeline/ingest';
import { createClient } from '@/lib/supabase/server';
import { canonicalizeUrl } from '@/lib/url';

/**
 * POST /api/ingest — capture a URL and run it through the full pipeline.
 *
 * Runs synchronously: fetch → extract → classify → chunk → embed → store →
 * similarity check, then responds. Fine for local dev (no timeout) and for
 * Vercel Pro's 300s limit on realistic article lengths. If ingest volume or
 * article length grows past that, this should become a thin enqueue —
 * insert as `pending` and hand off to a background job — polling
 * `ingest_status` instead of blocking the request.
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

  const { url, interestRating, userNote } = body as {
    url?: unknown;
    interestRating?: unknown;
    userNote?: unknown;
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

  try {
    const result = await runIngestPipeline(supabase, user.id, source.id, url);
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message, sourceId: source.id }, { status: 500 });
  }
}
