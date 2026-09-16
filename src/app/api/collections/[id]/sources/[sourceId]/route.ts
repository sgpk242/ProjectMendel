import { NextResponse } from 'next/server';

import { createClient } from '@/lib/supabase/server';

/** DELETE /api/collections/[id]/sources/[sourceId] — remove a source from a collection. */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; sourceId: string }> },
) {
  const { id: collectionId, sourceId } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data, error } = await supabase
    .from('collection_sources')
    .delete()
    .eq('collection_id', collectionId)
    .eq('source_id', sourceId)
    .select('collection_id, source_id')
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { error: `Failed to remove source: ${error.message}` },
      { status: 500 },
    );
  }

  if (!data) {
    return NextResponse.json({ error: 'Membership not found' }, { status: 404 });
  }

  return NextResponse.json({ ok: true }, { status: 200 });
}
