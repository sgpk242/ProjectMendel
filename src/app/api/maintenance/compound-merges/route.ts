import { NextResponse } from 'next/server';

import { applyMergePlan, type DelistChoice } from '@/lib/compound-merge';
import { createClient } from '@/lib/supabase/server';

/**
 * POST /api/maintenance/compound-merges — apply the reviewed compound
 * merges. Body: `{ choices: { [cid]: 'delist' | 'rating' } }`, one entry per
 * group with a de-list conflict. The plan itself is rebuilt server-side
 * from current data rather than taken from the request.
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

  const raw = (body as { choices?: unknown } | null)?.choices;
  const choices: Record<string, DelistChoice> = {};
  if (raw && typeof raw === 'object') {
    for (const [cid, choice] of Object.entries(raw)) {
      if (choice === 'delist' || choice === 'rating') choices[cid] = choice;
    }
  }

  try {
    return NextResponse.json(await applyMergePlan(supabase, choices));
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
