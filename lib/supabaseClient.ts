import { createBrowserClient } from '@supabase/ssr';

const supabaseUrl  = process.env.NEXT_PUBLIC_SUPABASE_URL  ?? '';
const supabaseKey  = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
const isBrowser    = typeof window !== 'undefined';

const RETRY_COUNT = 2;

async function fetchWithRetry(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  let lastErr: Error | null = null;
  for (let attempt = 0; attempt <= RETRY_COUNT; attempt++) {
    try {
      const res = await fetch(input, {
        ...init,
        signal: attempt < RETRY_COUNT
          ? AbortSignal.timeout(10_000)
          : (init?.signal ?? AbortSignal.timeout(15_000)),
      });
      return res;
    } catch (err) {
      lastErr = err as Error;
      if (attempt < RETRY_COUNT) {
        await new Promise(r => setTimeout(r, 1_000 * (attempt + 1)));
      }
    }
  }
  throw lastErr ?? new Error('fetch failed');
}

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
