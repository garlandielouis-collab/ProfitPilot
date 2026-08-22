import { createBrowserClient } from '@supabase/ssr';
import { createBoundedFetch } from './supabaseFetch';

const supabaseUrl  = process.env.NEXT_PUBLIC_SUPABASE_URL  ?? '';
const supabaseKey  = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
const isBrowser    = typeof window !== 'undefined';

function decodeJwtSegment(segment: string): Record<string, unknown> | null {
  try {
    const padded = segment.replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(padded + '='.repeat((4 - (padded.length % 4)) % 4)));
  } catch {
    return null;
  }
}

/**
 * La clé anon est un JWT qui porte le ref du projet dans son payload. Une clé
 * tronquée, brouillée par un copier-coller, ou héritée d'un autre projet échoue
 * au moment de la requête avec des erreurs qui ne mentionnent jamais les
 * identifiants. On la vérifie une fois au chargement pour que la console nomme
 * le vrai problème.
 */
function validateConfig(url: string, key: string) {
  if (!url || !key) return; // géré par le proxy « client non configuré » plus bas

  let host: string;
  try {
    host = new URL(url).host;
  } catch {
    console.error(`[supabase] NEXT_PUBLIC_SUPABASE_URL n'est pas une URL valide : ${url}`);
    return;
  }

  const segments = key.split('.');
  if (segments.length !== 3) {
    console.error(
      `[supabase] NEXT_PUBLIC_SUPABASE_ANON_KEY n'est pas un JWT bien formé ` +
      `(${segments.length} segments séparés par des points, 3 attendus). Elle a sans doute été ` +
      `tronquée ou abîmée à la copie. Recopiez-la depuis Supabase → Project Settings → API.`,
    );
    return;
  }

  const payload = decodeJwtSegment(segments[1]);
  if (!payload) {
    console.error('[supabase] Le payload de NEXT_PUBLIC_SUPABASE_ANON_KEY n\'est pas du base64url JSON décodable.');
    return;
  }

  if (payload.role !== 'anon') {
    console.error(
      `[supabase] NEXT_PUBLIC_SUPABASE_ANON_KEY a role="${String(payload.role)}", "anon" attendu. ` +
      (payload.role === 'service_role'
        ? 'C\'est la clé service role — elle ne doit jamais arriver dans le navigateur. Révoquez-la et utilisez la clé anon.'
        : 'La clé est corrompue ou n\'est pas une clé anon.'),
    );
    return;
  }

  const ref = typeof payload.ref === 'string' ? payload.ref : null;
  if (ref && !host.startsWith(`${ref}.`)) {
    console.error(
      `[supabase] Identifiants incohérents : NEXT_PUBLIC_SUPABASE_URL pointe sur "${host}" mais la clé anon ` +
      `appartient au projet "${ref}". L'URL et la clé doivent venir du même projet.`,
    );
    return;
  }

  const exp = typeof payload.exp === 'number' ? payload.exp : null;
  if (exp && exp * 1000 < Date.now()) {
    console.error(`[supabase] NEXT_PUBLIC_SUPABASE_ANON_KEY a expiré le ${new Date(exp * 1000).toISOString()}.`);
  }
}

// Fetch borné partagé avec proxy.ts : 8 s, une seule nouvelle tentative.
const fetchWithRetry = createBoundedFetch({ timeoutMs: 8_000, retries: 1 });

if (isBrowser) validateConfig(supabaseUrl, supabaseKey);

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
