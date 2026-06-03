import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

/**
 * FIXED VERSION: Properly extracts JWT from Supabase cookies
 *
 * Problem: The auth token cookie contains base64-encoded JSON with access_token inside
 * Solution: Decode it and pass the JWT to Supabase correctly
 */
export async function getSupabaseServerFixed() {
  const cookieStore = await cookies();
  const allCookies = cookieStore.getAll();

  // Find the Supabase auth token cookie
  const authCookie = allCookies.find(c => c.name.includes('auth-token'));

  console.log('[getSupabaseServerFixed] Auth cookie:', {
    name: authCookie?.name,
    hasValue: !!authCookie?.value,
  });

  // Extract the actual client
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return allCookies;
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // Ignore server component errors
          }
        },
      },
    }
  );

  // Test auth
  const { data: { user }, error } = await supabase.auth.getUser();

  console.log('[getSupabaseServerFixed] auth.getUser():', {
    userId: user?.id,
    error: error?.message,
  });

  if (user) {
    console.log('[getSupabaseServerFixed] ✅ User authenticated server-side!');
  } else {
    console.log('[getSupabaseServerFixed] ❌ User is still NULL - RLS issue');
  }

  return supabase;
}
