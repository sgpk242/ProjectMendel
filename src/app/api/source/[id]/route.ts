import { NextResponse } from 'next/server';

import { createClient } from '@/lib/supabase/server';

/**
 * DELETE /api/source/[id] — remove a source.
 *
 * `chunks`, `source_topics`, `source_similarities`, and `collection_sources`
 * all reference `sources` with `ON DELETE CASCADE` (001_initial_schema.sql),
 * so this one delete cleans up everything the ingest pipeline wrote. RLS
 * ("sources: owner can delete") scopes it to the caller's own rows — no
 * explicit user_id check needed here.
 */
export async function DELETE(
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

  const { data, error } = await supabase
    .from('sources')
    .delete()
    .eq('id', id)
    .select('id')
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { error: `Failed to delete source: ${error.message}` },
      { status: 500 },
    );
  }

  // RLS silently hides rows the caller doesn't own, so a missing id here
  // means either it never existed or it belongs to someone else — the same
  // "not found" from this user's point of view either way.
  if (!data) {
    return NextResponse.json({ error: 'Source not found' }, { status: 404 });
  }

  return NextResponse.json({ id: data.id }, { status: 200 });
}
