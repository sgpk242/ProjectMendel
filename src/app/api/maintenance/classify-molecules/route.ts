import { NextResponse } from 'next/server';

import { classifyNextMolecules } from '@/lib/molecule-class';
import { createClient } from '@/lib/supabase/server';

export const maxDuration = 120;

const BATCH_SIZE = 40;

/**
 * POST /api/maintenance/classify-molecules — classify the next batch of
 * compounds with no molecule category. Returns `{ classified, remaining }`;
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
    return NextResponse.json(await classifyNextMolecules(supabase, BATCH_SIZE));
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
