import { createBrowserClient } from '@supabase/ssr';

const supabaseUrl  = process.env.NEXT_PUBLIC_SUPABASE_URL  ?? '';
const supabaseKey  = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
const isBrowser    = typeof window !== 'undefined';

/**
 * Client-side Supabase client.
 * Uses createBrowserClient from @supabase/ssr so the session is stored in
 * cookies (not localStorage), making it readable by server actions that use
 * createServerClient from the same package.
 */
export const supabase = isBrowser && supabaseUrl && supabaseKey
  ? createBrowserClient(supabaseUrl, supabaseKey)
  : (() => {
      const warn = () => {
        console.warn('Supabase client not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.');
        return Promise.resolve({ data: { user: null, session: null }, error: null });
      };
      // Minimal proxy so the app doesn't crash at render time
      return new Proxy({} as any, {
        get: (_t, prop) => {
          if (prop === 'auth') return new Proxy({} as any, { get: () => warn });
          return warn;
        },
      });
    })();
