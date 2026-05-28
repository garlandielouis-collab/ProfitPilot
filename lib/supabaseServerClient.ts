import { createClient } from '@supabase/supabase-js';

export function getSupabaseServer() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

  // If envs are present, create a real client. Otherwise return a proxy
  // that throws only when used, avoiding build-time crashes during prerender.
  if (supabaseUrl && supabaseKey) {
    return createClient(supabaseUrl, supabaseKey);
  }

  const makeThrow = (msg: string) => () => {
    throw new Error(msg);
  };

  const errMsg = 'Supabase server client not configured. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY in your environment.';

  return new Proxy({}, {
    get() {
      return makeThrow(errMsg);
    },
    apply() {
      return makeThrow(errMsg)();
    },
  }) as any;
}

// Backwards-compatible lazy proxy: existing files that import `supabaseServer`
// can continue to do so. The real client is created on first property access.
let _lazyClient: any = null;
function _ensureClient() {
  if (!_lazyClient) _lazyClient = getSupabaseServer();
  return _lazyClient;
}

export const supabaseServer: any = new Proxy(
  {},
  {
    get(_, prop) {
      const client = _ensureClient();
      // @ts-ignore
      return client[prop as keyof typeof client];
    },
    apply(_, thisArg, args) {
      const client = _ensureClient();
      return (client as any).apply(thisArg, args);
    },
  }
);
