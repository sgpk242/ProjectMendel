import { NextResponse } from 'next/server';

import { createClient } from '@/lib/supabase/server';
import { parseThesisFields, resolvedAtFor } from '@/lib/theses';

/** PATCH /api/theses/[id] — update a thesis (any subset of its fields). */
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

  const parsed = parseThesisFields(body, { requireClaim: false });
  if ('error' in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  if (Object.keys(parsed.fields).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
  }

  const { data: current } = await supabase
    .from('theses')
    .select('status')
    .eq('id', id)
    .maybeSingle();
  if (!current) {
    return NextResponse.json({ error: 'Thesis not found' }, { status: 404 });
  }

  const resolvedAt = resolvedAtFor(current.status, parsed.fields.status);
  const updates = resolvedAt === undefined ? parsed.fields : { ...parsed.fields, resolved_at: resolvedAt };

  const { data, error } = await supabase
    .from('theses')
    .update(updates)
    .eq('id', id)
    .select('*')
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: `Failed to update thesis: ${error.message}` }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: 'Thesis not found' }, { status: 404 });
  }

  return NextResponse.json(data, { status: 200 });
}

/** DELETE /api/theses/[id] — delete a thesis and its source links. */
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

  const { error } = await supabase.from('theses').delete().eq('id', id);

  if (error) {
    return NextResponse.json({ error: `Failed to delete thesis: ${error.message}` }, { status: 500 });
  }

  return new NextResponse(null, { status: 204 });
}
