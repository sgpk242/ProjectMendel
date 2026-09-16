import { NextResponse } from 'next/server';

import { createClient } from '@/lib/supabase/server';

/**
 * POST /api/chat — answer a question against the user's corpus.
 *
 * Phase 0 stub. Phase 2 fills this in as: embed the question, call the
 * `match_chunks` RPC for context, then stream a grounded answer with citations
 * back to the client. The RPC runs as the caller so RLS scopes retrieval to
 * this user's chunks — do not switch it to the service key.
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

  const message = (body as { message?: unknown })?.message;
  if (typeof message !== 'string' || message.trim().length === 0) {
    return NextResponse.json({ error: 'Field "message" is required' }, { status: 400 });
  }

  return NextResponse.json(
    { error: 'Chat is not implemented yet.' },
    { status: 501 },
  );
}
