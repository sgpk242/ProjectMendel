import { NextResponse } from 'next/server';

import { createClient } from '@/lib/supabase/server';

/** GET /api/collections — list the caller's collections, alphabetically. */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data, error } = await supabase
    .from('collections')
    .select('id, name, description, created_at')
    .order('name', { ascending: true });

  if (error) {
    return NextResponse.json(
      { error: `Failed to list collections: ${error.message}` },
      { status: 500 },
    );
  }

  return NextResponse.json({ collections: data ?? [] }, { status: 200 });
}

/** POST /api/collections — create a collection owned by the caller. */
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

  const { name, description } = (body ?? {}) as Record<string, unknown>;
  if (typeof name !== 'string' || !name.trim()) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 });
  }
  if (description !== undefined && description !== null && typeof description !== 'string') {
    return NextResponse.json({ error: 'description must be a string or null' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('collections')
    .insert({ user_id: user.id, name: name.trim(), description: (description as string) ?? null })
    .select('id, name, description, created_at')
    .single();

  if (error) {
    return NextResponse.json(
      { error: `Failed to create collection: ${error.message}` },
      { status: 500 },
    );
  }

  return NextResponse.json(data, { status: 201 });
}
