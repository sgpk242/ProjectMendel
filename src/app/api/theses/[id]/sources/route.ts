import { NextResponse } from 'next/server';

import { THESIS_STANCES, type ThesisStance } from '@/lib/constants';
import { createClient } from '@/lib/supabase/server';

/**
 * POST /api/theses/[id]/sources — link a source to a thesis, or update an
 * existing link. Body: `{ sourceId, stance, note? }`.
 */
export async function POST(
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

  const { sourceId, stance, note } = (body ?? {}) as Record<string, unknown>;

  if (typeof sourceId !== 'string' || !sourceId) {
    return NextResponse.json({ error: 'sourceId is required' }, { status: 400 });
  }
  if (!THESIS_STANCES.includes(stance as ThesisStance)) {
    return NextResponse.json(
      { error: `stance must be one of: ${THESIS_STANCES.join(', ')}` },
      { status: 400 },
    );
  }
  if (note !== undefined && note !== null && typeof note !== 'string') {
    return NextResponse.json({ error: 'note must be a string or null' }, { status: 400 });
  }

  // RLS rejects the write unless both the thesis and the source are the caller's.
  const { error } = await supabase.from('thesis_sources').upsert(
    {
      thesis_id: id,
      source_id: sourceId,
      stance: stance as ThesisStance,
      note: typeof note === 'string' ? note.trim() || null : null,
    },
    { onConflict: 'thesis_id,source_id' },
  );

  if (error) {
    return NextResponse.json({ error: `Failed to link source: ${error.message}` }, { status: 500 });
  }

  return NextResponse.json({ ok: true }, { status: 200 });
}

/** DELETE /api/theses/[id]/sources?sourceId=… — unlink a source from a thesis. */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const sourceId = new URL(request.url).searchParams.get('sourceId');

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!sourceId) {
    return NextResponse.json({ error: 'sourceId is required' }, { status: 400 });
  }

  const { error } = await supabase
    .from('thesis_sources')
    .delete()
    .eq('thesis_id', id)
    .eq('source_id', sourceId);

  if (error) {
    return NextResponse.json({ error: `Failed to unlink source: ${error.message}` }, { status: 500 });
  }

  return new NextResponse(null, { status: 204 });
}
