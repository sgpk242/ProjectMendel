import { NextResponse } from 'next/server';

import { refreshDisplayNames } from '@/lib/product-aliases';
import { createClient } from '@/lib/supabase/server';

/**
 * DELETE /api/product-ideas/[id]/aliases/[aliasId] — remove a wrong alias
 * from a product, so new mentions of that name no longer match it. The
 * automatic header is re-picked in case it was that alias.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; aliasId: string }> },
) {
  const { id, aliasId } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data, error } = await supabase
    .from('product_aliases')
    .delete()
    .eq('id', aliasId)
    .eq('product_idea_id', id)
    .select('id')
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: `Failed to remove alias: ${error.message}` }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: 'Alias not found' }, { status: 404 });
  }

  try {
    await refreshDisplayNames(supabase, [id]);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }

  return NextResponse.json({ id: data.id }, { status: 200 });
}
