import { NextResponse } from 'next/server';

import { createClient } from '@/lib/supabase/server';
import type { TablesUpdate } from '@/lib/types/database';

/** PATCH /api/product-ideas/[id] — update a product idea (rating, notes, description). */
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

  const { interest_rating, notes, description } = (body ?? {}) as Record<string, unknown>;

  const updates: TablesUpdate<'product_ideas'> = {};

  if (interest_rating !== undefined) {
    if (interest_rating === null) {
      updates.interest_rating = null;
    } else if (
      typeof interest_rating === 'number' &&
      Number.isInteger(interest_rating) &&
      interest_rating >= 1 &&
      interest_rating <= 5
    ) {
      updates.interest_rating = interest_rating;
    } else {
      return NextResponse.json(
        { error: 'interest_rating must be an integer 1-5 or null' },
        { status: 400 },
      );
    }
  }

  if (notes !== undefined) {
    updates.notes = typeof notes === 'string' ? notes.trim() || null : null;
  }

  if (description !== undefined) {
    updates.description = typeof description === 'string' ? description.trim() || null : null;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No editable fields in body' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('product_ideas')
    .update(updates)
    .eq('id', id)
    .select('*')
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { error: `Failed to update product idea: ${error.message}` },
      { status: 500 },
    );
  }

  if (!data) {
    return NextResponse.json({ error: 'Product idea not found' }, { status: 404 });
  }

  return NextResponse.json(data, { status: 200 });
}

/** DELETE /api/product-ideas/[id] — remove a product idea. */
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
    .from('product_ideas')
    .delete()
    .eq('id', id)
    .select('id')
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { error: `Failed to delete product idea: ${error.message}` },
      { status: 500 },
    );
  }

  if (!data) {
    return NextResponse.json({ error: 'Product idea not found' }, { status: 404 });
  }

  return NextResponse.json({ id: data.id }, { status: 200 });
}
