import { createClient } from '@supabase/supabase-js'

function _createClientIfPossible() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

  if (!supabaseUrl || !supabaseAnonKey) {
    // Don't throw here — allow import-time without valid envs.
    console.warn('Supabase client not created: NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY missing');
    return null;
  }

  return createClient(supabaseUrl, supabaseAnonKey);
}

let _client: any = null;
export const supabase: any = new Proxy({}, {
  get(_, prop) {
    if (!_client) _client = _createClientIfPossible();
    if (!_client) {
      return () => {
        throw new Error('Supabase client not available. Ensure NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are set.');
      };
    }
    // @ts-ignore
    return _client[prop as keyof typeof _client];
  },
  apply(_, thisArg, args) {
    if (!_client) _client = _createClientIfPossible();
    if (!_client) throw new Error('Supabase client not available. Ensure NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are set.');
    return (_client as any).apply(thisArg, args);
  }
});