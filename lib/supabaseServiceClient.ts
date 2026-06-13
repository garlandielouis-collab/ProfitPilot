import { createClient } from '@supabase/supabase-js';

/**
 * Service Client — uses SERVICE KEY (admin access)
 * ⚠️ ONLY for server-side operations like seeding
 * This BYPASSES RLS policies but is needed for admin operations
 */
export function getSupabaseService() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!serviceKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY not configured in .env.local');
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) {
    throw new Error(
      `Missing Supabase environment variables:\n` +
      `  NEXT_PUBLIC_SUPABASE_URL=${!!supabaseUrl}\n` +
      `  SUPABASE_SERVICE_ROLE_KEY=${!!serviceKey}\n` +
      `  cwd=${process.cwd()}`
    );
  }

  return createClient(
    supabaseUrl,
    serviceKey,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}
