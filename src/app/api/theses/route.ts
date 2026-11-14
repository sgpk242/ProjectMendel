import { NextResponse } from 'next/server';

import { createClient } from '@/lib/supabase/server';
import { parseThesisFields, resolvedAtFor } from '@/lib/theses';

/** GET /api/theses — the caller's theses, soonest review date first. */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data, error } = await supabase
    .from('theses')
    .select('*')
    .order('review_date', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: `Failed to list theses: ${error.message}` }, { status: 500 });
  }

  return NextResponse.json({ theses: data ?? [] }, { status: 200 });
}

/** POST /api/theses — record a new thesis. */
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
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = parseThesisFields(body, { requireClaim: true });
  if ('error' in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('theses')
    .insert({
      ...parsed.fields,
      claim: parsed.fields.claim!,
      user_id: user.id,
      resolved_at: resolvedAtFor(null, parsed.fields.status) ?? null,
    })
    .select('*')
    .single();

  if (error) {
    return NextResponse.json({ error: `Failed to create thesis: ${error.message}` }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
