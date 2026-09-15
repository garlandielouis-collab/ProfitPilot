import { createClient } from '@supabase/supabase-js';

/**
 * Service Client — uses SERVICE KEY (admin access)
 * ⚠️ ONLY for server-side operations like seeding
 * This BYPASSES RLS policies but is needed for admin operations
 */
export function getSupabaseService() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!serviceKey) {
    // Le message nommait `.env.local` quoi qu'il arrive. Sur un serveur
    // déployé, ce fichier n'existe pas : le marchand — et celui qui l'aide —
    // partaient chercher une variable dans le mauvais endroit. On dit où l'on
    // tourne, donc où la poser.
    throw new Error(
      process.env.VERCEL
        ? 'SUPABASE_SERVICE_ROLE_KEY absente de cet environnement Vercel '
          + `(${process.env.VERCEL_ENV ?? 'inconnu'}) — à ajouter dans Settings → `
          + 'Environment Variables, puis redéployer.'
        : 'SUPABASE_SERVICE_ROLE_KEY absente de .env.local — le serveur a-t-il '
          + 'été démarré depuis la racine du dépôt ?',
    );
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
