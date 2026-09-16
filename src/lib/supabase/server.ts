import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';

import type { Database } from '@/lib/types/database';

/**
 * Supabase client for Server Components, Server Actions, and Route Handlers.
 *
 * Must be created per request — never hoisted to a module-level singleton, or
 * one user's session would leak into another's request.
 *
 * `cookies()` is async as of Next 15, hence the await.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Server Components cannot set cookies. This is safe to swallow so
            // long as proxy.ts is refreshing the session on every request,
            // which is what keeps the tokens from going stale.
          }
        },
      },
    },
  );
}
