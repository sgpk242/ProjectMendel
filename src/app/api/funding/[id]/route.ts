import { NextResponse } from 'next/server';

import { FUNDING_STATUSES } from '@/lib/constants';
import { createClient } from '@/lib/supabase/server';
import type { TablesUpdate } from '@/lib/types/database';

/** PATCH /api/funding/[id] — update a funding opportunity. */
export async function PATCH(
  request: Request,
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

  const updates: TablesUpdate<'funding_opportunities'> = {};

  if (title !== undefined) {
    if (typeof title !== 'string' || !title.trim()) {
      return NextResponse.json({ error: 'title must be a non-empty string' }, { status: 400 });
    }
    updates.title = title.trim();
  }

  if (organization !== undefined) {
    updates.organization = typeof organization === 'string' ? organization.trim() || null : null;
  }

  if (amount !== undefined) {
    updates.amount = typeof amount === 'string' ? amount.trim() || null : null;
  }

  if (deadline !== undefined) {
    updates.deadline = typeof deadline === 'string' ? deadline : null;
  }

  if (url !== undefined) {
    updates.url = typeof url === 'string' ? url.trim() || null : null;
  }

  if (notes !== undefined) {
    updates.notes = typeof notes === 'string' ? notes.trim() || null : null;
  }

  if (status !== undefined) {
    if (!FUNDING_STATUSES.includes(status as (typeof FUNDING_STATUSES)[number])) {
      return NextResponse.json(
        { error: `status must be one of: ${FUNDING_STATUSES.join(', ')}` },
        { status: 400 },
      );
    }
    updates.status = status as string;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No editable fields in body' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('funding_opportunities')
    .update(updates)
    .eq('id', id)
    .select('*')
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { error: `Failed to update funding opportunity: ${error.message}` },
      { status: 500 },
    );
  }

  if (!data) {
    return NextResponse.json({ error: 'Funding opportunity not found' }, { status: 404 });
  }

  return NextResponse.json(data, { status: 200 });
}

/** DELETE /api/funding/[id] — remove a funding opportunity. */
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
    .from('funding_opportunities')
    .delete()
    .eq('id', id)
    .select('id')
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { error: `Failed to delete funding opportunity: ${error.message}` },
      { status: 500 },
    );
  }

  if (!data) {
    return NextResponse.json({ error: 'Funding opportunity not found' }, { status: 404 });
  }

  return NextResponse.json({ id: data.id }, { status: 200 });
}
