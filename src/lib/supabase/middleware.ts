import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

import { PROTECTED_ROUTES } from '@/lib/constants';
import type { Database } from '@/lib/types/database';

/**
 * Refreshes the auth session on every request and guards protected routes.
 *
 * The response-object handling here is load-bearing. `supabaseResponse` must be
 * the object that is ultimately returned, because that is where the refreshed
 * auth cookies are written. Constructing a fresh NextResponse at the end — or
 * returning a different one without copying the cookies across — silently drops
 * the refreshed tokens and logs the user out at random.
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // getUser() revalidates the token with the auth server. Do not swap this for
  // getSession(), which trusts the cookie without verifying it, and do not run
  // any logic between creating the client and this call.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isProtected = PROTECTED_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );

  if (!user && isProtected) {
    const url = request.nextUrl.clone();
    url.pathname = '/';
    // Preserve where they were headed so login can send them back.
    url.searchParams.set('redirectTo', pathname);
    return NextResponse.redirect(url);
  }

  if (user && pathname === '/') {
    const url = request.nextUrl.clone();
    url.pathname = '/dashboard';
    url.search = '';
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
