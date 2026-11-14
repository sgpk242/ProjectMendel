import { NextResponse } from 'next/server';

import { createClient } from '@/lib/supabase/server';
import { suggestSources } from '@/lib/thesis-suggestions';

/**
 * GET /api/theses/[id]/suggestions — sources in the caller's library most
 * related to the thesis claim, not yet linked to it. Nothing is linked here;
 * the user picks a stance for each via POST /api/theses/[id]/sources.
 */
export async function GET(
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

  try {
    const suggestions = await suggestSources(supabase, id);
    if (suggestions === null) {
      return NextResponse.json({ error: 'Thesis not found' }, { status: 404 });
    }
    return NextResponse.json({ suggestions }, { status: 200 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
