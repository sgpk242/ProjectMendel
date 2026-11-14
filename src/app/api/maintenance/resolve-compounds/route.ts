import { NextResponse } from 'next/server';

import { resolveNextNames } from '@/lib/compound-merge';
import { createClient } from '@/lib/supabase/server';

// 25 names × up to 2 PubChem requests each, spaced ≥220ms apart.
export const maxDuration = 60;

const BATCH_SIZE = 25;

/**
 * POST /api/maintenance/resolve-compounds — look up the next batch of
 * never-looked-up product names in PubChem, filling the lookup cache.
 * Changes no product rows. Returns `{ resolved, remaining }`; the
 * /maintenance page calls this until `remaining` is 0.
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
    return NextResponse.json(await resolveNextNames(supabase, BATCH_SIZE));
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
