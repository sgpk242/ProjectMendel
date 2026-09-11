import type { NextRequest } from 'next/server';

import { updateSession } from '@/lib/supabase/middleware';

/**
 * Next 16 renamed the `middleware` file convention to `proxy`. This runs before
 * every matched request to refresh the Supabase session and gate protected
 * routes.
 */
export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Everything except static assets and image files. Auth cookies only need
     * refreshing on requests that can render or read data.
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
