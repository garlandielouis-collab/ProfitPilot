import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

/**
 * ✅ CORRECT PATTERN for Next.js 15/16 + Supabase SSR
 *
 * How it works:
 * 1. createServerClient's cookie handler is async-safe
 * 2. getAll/setAll are called DURING request (lazy evaluation)
 * 3. cookies() is awaited only when actually needed
 * 4. Session is correctly injected into every request
 *
 * Usage in server actions:
 *   const supabase = await getSupabaseServer();
 *   const { data: { user } } = await supabase.auth.getUser();
 */
export async function getSupabaseServer() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: {
        fetch: (input, init) =>
          fetch(input, { ...init, signal: AbortSignal.timeout(10_000) }),
      },
      cookies: {
        getAll() {
          // ✅ This runs DURING request when cookies are available
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            // ✅ Set session cookies back on response
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // Server Components cannot set cookies, which is fine
          }
        },
      },
    }
  );
}
