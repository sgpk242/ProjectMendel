import { NextResponse } from 'next/server';

import { createClient } from '@/lib/supabase/server';
import type { TablesUpdate } from '@/lib/types/database';

/** PATCH /api/collections/[id] — rename or re-describe a collection. */
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

  const { name, description } = (body ?? {}) as Record<string, unknown>;
  const updates: TablesUpdate<'collections'> = {};

  if (name !== undefined) {
    if (typeof name !== 'string' || !name.trim()) {
      return NextResponse.json({ error: 'name must be a non-empty string' }, { status: 400 });
    }
    updates.name = name.trim();
  }

  if (description !== undefined) {
    if (description !== null && typeof description !== 'string') {
      return NextResponse.json({ error: 'description must be a string or null' }, { status: 400 });
    }
    updates.description = description;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No editable fields in body' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('collections')
    .update(updates)
    .eq('id', id)
    .select('id, name, description, created_at')
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { error: `Failed to update collection: ${error.message}` },
      { status: 500 },
    );
  }

  if (!data) {
    return NextResponse.json({ error: 'Collection not found' }, { status: 404 });
  }

  return NextResponse.json(data, { status: 200 });
}

/**
 * DELETE /api/collections/[id] — remove a collection. `collection_sources`
 * references `collections` with `ON DELETE CASCADE`, so memberships are
 * cleaned up automatically; the member sources themselves are untouched.
 */
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
    .from('collections')
    .delete()
    .eq('id', id)
    .select('id')
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { error: `Failed to delete collection: ${error.message}` },
      { status: 500 },
    );
  }

  if (!data) {
    return NextResponse.json({ error: 'Collection not found' }, { status: 404 });
  }

  return NextResponse.json({ id: data.id }, { status: 200 });
}
