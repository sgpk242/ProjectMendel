import { createBrowserClient } from '@supabase/ssr';

import type { Database } from '@/lib/types/database';

/**
 * Supabase client for Client Components.
 *
 * Safe to call repeatedly — `createBrowserClient` memoizes the underlying
 * client, so this returns the same instance within a browser session.
 */
export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
