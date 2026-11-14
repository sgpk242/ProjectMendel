import { NextResponse } from 'next/server';

import { tagNextMarkets } from '@/lib/compound-market';
import { createClient } from '@/lib/supabase/server';

export const maxDuration = 120;

const BATCH_SIZE = 40;

/**
 * POST /api/maintenance/tag-markets — tag the next batch of untagged
 * compounds as industrial / pharma / both. Returns `{ tagged, remaining }`;
 * /maintenance calls this until `remaining` is 0.
 */
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    return NextResponse.json(await tagNextMarkets(supabase, BATCH_SIZE));
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
