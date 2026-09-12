import { NextResponse } from 'next/server';

import { FUNDING_STATUSES } from '@/lib/constants';
import { createClient } from '@/lib/supabase/server';

/** GET /api/funding — list the caller's funding opportunities. */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data, error } = await supabase
    .from('funding_opportunities')
    .select('*')
    .order('deadline', { ascending: true, nullsFirst: false });

  if (error) {
    return NextResponse.json(
      { error: `Failed to list funding opportunities: ${error.message}` },
      { status: 500 },
    );
  }

  return NextResponse.json({ opportunities: data ?? [] }, { status: 200 });
}

/** POST /api/funding — create a funding opportunity. */
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

  const { title, organization, amount, deadline, url, notes, status } = (body ?? {}) as Record<
    string,
    unknown
  >;

  if (typeof title !== 'string' || !title.trim()) {
    return NextResponse.json({ error: 'title is required' }, { status: 400 });
  }

  if (status !== undefined && !FUNDING_STATUSES.includes(status as (typeof FUNDING_STATUSES)[number])) {
    return NextResponse.json(
      { error: `status must be one of: ${FUNDING_STATUSES.join(', ')}` },
      { status: 400 },
    );
  }

  const { data, error } = await supabase
    .from('funding_opportunities')
    .insert({
      user_id: user.id,
      title: title.trim(),
      organization: typeof organization === 'string' ? organization.trim() || null : null,
      amount: typeof amount === 'string' ? amount.trim() || null : null,
      deadline: typeof deadline === 'string' ? deadline : null,
      url: typeof url === 'string' ? url.trim() || null : null,
      notes: typeof notes === 'string' ? notes.trim() || null : null,
      status: (status as string) ?? 'open',
    })
    .select('*')
    .single();

  if (error) {
    return NextResponse.json(
      { error: `Failed to create funding opportunity: ${error.message}` },
      { status: 500 },
    );
  }

  return NextResponse.json(data, { status: 201 });
}
