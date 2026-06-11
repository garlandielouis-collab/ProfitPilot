import { type NextRequest, NextResponse } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';

const publicRoutes = ['/', '/auth/login', '/auth/register', '/auth/callback'];

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const isPublic = publicRoutes.some((r) => pathname === r || pathname.startsWith(r + '/'));

  // ── LOG ALL COOKIES for diagnostic ───────────────────────────────────────
  const allCookies = request.cookies.getAll();
  const sbCookies  = allCookies.filter(c => c.name.startsWith('sb-'));
  console.log(`[PROXY] path: ${pathname} | isPublic: ${isPublic}`);
  console.log(`[PROXY] total cookies: ${allCookies.length} | sb- cookies: ${sbCookies.length}`);
  if (sbCookies.length > 0) {
    sbCookies.forEach(c => console.log(`[PROXY]   cookie: ${c.name} (len=${c.value.length})`));
  } else {
    console.log('[PROXY]   ⚠️ NO sb- cookies found — session will not be recognized server-side');
  }

  // ── BUG FIX: includes('-auth-token') instead of endsWith('-auth-token') ──
  // When JWT is large (new users with metadata), @supabase/ssr chunks the cookie:
  //   sb-[ref]-auth-token.0, sb-[ref]-auth-token.1, ...
  // The old endsWith('-auth-token') missed these chunks → false hasAuthCookie → redirect to login
  const hasAuthCookie = allCookies.some(
    (c) => c.name.startsWith('sb-') && c.name.includes('-auth-token')
  );
  console.log(`[PROXY] hasAuthCookie: ${hasAuthCookie}`);

  if (!hasAuthCookie) {
    if (!isPublic) {
      console.log(`[REDIRECT] source: proxy.ts | destination: /auth/login | reason: no auth cookie found`);
      const loginUrl = request.nextUrl.clone();
      loginUrl.pathname = '/auth/login';
      return NextResponse.redirect(loginUrl);
    }
    return NextResponse.next({
      request: { headers: request.headers },
    });
  }

  let supabaseResponse = NextResponse.next({
    request: { headers: request.headers },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll(); },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options as CookieOptions)
          );
        },
      },
    }
  );

  const { data: { user }, error: getUserErr } = await supabase.auth.getUser();
  console.log(`[PROXY] auth.getUser(): user=${user?.id ?? 'null'} | error=${getUserErr?.message ?? 'none'}`);

  if (!user && !isPublic) {
    console.log(`[REDIRECT] source: proxy.ts | destination: /auth/login | reason: auth.getUser() returned null (cookie present but session invalid)`);
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = '/auth/login';
    return NextResponse.redirect(loginUrl);
  }

  if (user && (pathname === '/auth/login' || pathname === '/auth/register')) {
    console.log(`[REDIRECT] source: proxy.ts | destination: /dashboard | reason: authenticated user on auth page`);
    const dashboardUrl = request.nextUrl.clone();
    dashboardUrl.pathname = '/dashboard';
    return NextResponse.redirect(dashboardUrl);
  }

  console.log(`[PROXY] ✅ Passing through: ${pathname} | user: ${user?.id ?? 'null (public route)'}`);
  return supabaseResponse;
}

// Next.js requires the middleware to be exported as `middleware` (named) or default.
export { proxy as middleware };

export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|public).*)',
  ],
};
