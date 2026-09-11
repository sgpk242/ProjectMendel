import { NextResponse } from 'next/server';

import { createClient } from '@/lib/supabase/server';
import { canonicalizeUrl } from '@/lib/url';

/**
 * POST /api/ingest — capture a URL.
 *
 * Phase 0 stub: authenticates, validates the URL, and reports what the row
 * would look like. The pipeline itself lands in Phase 1.
 *
 * When it does, this handler should stay a thin enqueue. Fetch → extract →
 * chunk → embed → summarize runs 30–120s on a long article, which exceeds
 * Vercel's serverless limit, so the durable shape is: insert the source with
 * ingest_status 'pending', hand off to a Supabase edge function or background
 * job, and return immediately. The client polls ingest_status.
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

  const url = (body as { url?: unknown })?.url;
  if (typeof url !== 'string' || url.length === 0) {
    return NextResponse.json({ error: 'Field "url" is required' }, { status: 400 });
  }

  let urlCanonical: string;
  try {
    urlCanonical = canonicalizeUrl(url);
  } catch {
    return NextResponse.json({ error: 'Not a valid http(s) URL' }, { status: 400 });
  }

  return NextResponse.json(
    {
      error: 'Ingest pipeline is not implemented yet.',
      received: { url, urlCanonical },
    },
    { status: 501 },
  );
}
