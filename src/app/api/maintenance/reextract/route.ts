import { NextResponse } from 'next/server';

import { runCompoundStage } from '@/lib/pipeline/ingest';
import { createClient } from '@/lib/supabase/server';

// One source per request; a long paper can take minutes under Groq's
// tokens-per-minute limits. On Vercel, 300s needs a plan that allows it.
export const maxDuration = 300;

/**
 * POST /api/maintenance/reextract — re-run full-text compound extraction on
 * one already-ingested source. Body: `{ sourceId }`.
 *
 * Used by the /maintenance backfill, which calls this once per source.
 * Existing compound links on the source are kept; links found again are
 * updated with the new context and chunk.
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

  const { sourceId } = (body ?? {}) as { sourceId?: unknown };
  if (typeof sourceId !== 'string' || !sourceId) {
    return NextResponse.json({ error: 'Field "sourceId" is required' }, { status: 400 });
  }

  // RLS hides other users' sources, so this doubles as the ownership check.
  const { data: source } = await supabase
    .from('sources')
    .select('id')
    .eq('id', sourceId)
    .maybeSingle();
  if (!source) {
    return NextResponse.json({ error: 'Source not found' }, { status: 404 });
  }

  const result = await runCompoundStage(supabase, user.id, sourceId);
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}
