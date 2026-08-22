import { createBrowserClient } from '@supabase/ssr';
import { createBoundedFetch } from './supabaseFetch';

const supabaseUrl  = process.env.NEXT_PUBLIC_SUPABASE_URL  ?? '';
const supabaseKey  = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
const isBrowser    = typeof window !== 'undefined';

// Échec borné (8 s, 1 tentative) qui renvoie un 503 porteur d'un message
// explicite — sinon auth-js remonte un « AuthRetryableFetchError {} » muet.
const fetchWithRetry = createBoundedFetch({ timeoutMs: 8_000, retries: 1 });

export const supabase = isBrowser && supabaseUrl && supabaseKey
  ? createBrowserClient(supabaseUrl, supabaseKey, {
      global: { fetch: fetchWithRetry },
    })
  : (() => {
      const warn = () => {
        console.warn('Supabase client not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.');
        return Promise.resolve({ data: { user: null, session: null }, error: null });
      };
      return new Proxy({} as any, {
        get: (_t, prop) => {
          if (prop === 'auth') return new Proxy({} as any, { get: () => warn });
          return warn;
        },
      });
    })();
