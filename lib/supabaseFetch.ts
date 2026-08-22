// ─────────────────────────────────────────────────────────────────────────────
// Fetch borné + diagnostic réseau pour Supabase
//
// Objectif : ne plus jamais afficher « AuthRetryableFetchError {} » quand le
// backend est injoignable. On distingue trois causes qui n'ont pas du tout le
// même remède :
//
//   1. le navigateur est hors-ligne          → l'utilisateur doit se reconnecter
//   2. l'hôte Supabase ne répond pas / n'existe pas → projet en pause ou supprimé
//   3. la requête a dépassé le délai         → réseau lent
//
// Utilisé par le client navigateur, le client serveur et le middleware, pour
// que les trois échouent vite et avec le même message.
// ─────────────────────────────────────────────────────────────────────────────

export type SupabaseFailureKind = 'offline' | 'unreachable' | 'timeout';

/** Marqueur reconnu par translateError() côté UI. */
export const SUPABASE_UNREACHABLE = 'SUPABASE_UNREACHABLE';

/** Hôte Supabase configuré, pour l'afficher dans les messages d'erreur. */
export function supabaseHost(): string {
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').hostname;
  } catch {
    return 'supabase';
  }
}

/** Codes Node d'une résolution DNS ou d'une connexion impossible. */
const DNS_CODES = new Set([
  'ENOTFOUND',   // le nom de domaine n'existe pas (projet supprimé / pausé)
  'EAI_AGAIN',   // DNS temporairement injoignable
  'ECONNREFUSED',
  'ECONNRESET',
  'EHOSTUNREACH',
  'ENETUNREACH',
]);

function nodeErrorCode(err: unknown): string | null {
  const cause = (err as { cause?: { code?: string } } | undefined)?.cause;
  return cause?.code ?? (err as { code?: string } | undefined)?.code ?? null;
}

/**
 * Classe un échec de `fetch`.
 * Côté navigateur, DNS mort et Wi-Fi coupé donnent le même `TypeError:
 * Failed to fetch` : on lève l'ambiguïté avec `navigator.onLine`.
 */
export function classifyFailure(err: unknown): SupabaseFailureKind {
  const name = (err as Error | undefined)?.name ?? '';
  if (name === 'TimeoutError' || name === 'AbortError') return 'timeout';

  const code = nodeErrorCode(err);
  if (code && DNS_CODES.has(code)) return 'unreachable';

  if (typeof navigator !== 'undefined' && navigator.onLine === false) return 'offline';

  return 'unreachable';
}

/** Message actionnable, en français, prêt à être affiché à l'utilisateur. */
export function failureMessage(kind: SupabaseFailureKind): string {
  switch (kind) {
    case 'offline':
      return 'Pas de connexion internet. Reconnectez-vous et réessayez.';
    case 'timeout':
      return `Le serveur ${supabaseHost()} met trop de temps à répondre. Réessayez dans un instant.`;
    case 'unreachable':
    default:
      return (
        `${SUPABASE_UNREACHABLE}: le backend ${supabaseHost()} est injoignable. ` +
        `Le projet Supabase est probablement en pause ou supprimé — ` +
        `vérifiez sur supabase.com/dashboard, puis mettez à jour NEXT_PUBLIC_SUPABASE_URL ` +
        `et NEXT_PUBLIC_SUPABASE_ANON_KEY dans .env.local.`
      );
  }
}

let warnedOnce = false;

/**
 * `fetch` avec délai maximal et une seule nouvelle tentative.
 *
 * En cas d'échec réseau, renvoie une réponse 503 synthétique dont le corps
 * porte le message dans TOUS les champs lus par @supabase/auth-js
 * (`msg`, `message`, `error`, `error_description`) : c'est ce qui remonte
 * jusqu'à `error.message` au lieu d'un objet vide.
 */
export function createBoundedFetch(options?: {
  timeoutMs?: number;
  retries?: number;
}): typeof fetch {
  const timeoutMs = options?.timeoutMs ?? 8_000;
  const retries   = options?.retries   ?? 1;

  return async function boundedFetch(input: RequestInfo | URL, init?: RequestInit) {
    let lastErr: unknown = null;

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        return await fetch(input, {
          ...init,
          signal: init?.signal ?? AbortSignal.timeout(timeoutMs),
        });
      } catch (err) {
        lastErr = err;

        // Inutile de réessayer si le nom de domaine n'existe pas.
        if (classifyFailure(err) === 'unreachable' && nodeErrorCode(err) === 'ENOTFOUND') break;
        if (attempt < retries) await new Promise((r) => setTimeout(r, 150));
      }
    }

    const kind    = classifyFailure(lastErr);
    const message = failureMessage(kind);

    if (!warnedOnce) {
      warnedOnce = true;
      console.error(`[Supabase] ${message}`);
    }

    return new Response(
      JSON.stringify({
        error:             kind === 'offline' ? 'offline' : 'service_unavailable',
        error_description: message,
        message,
        msg:               message,
        code:              kind,
      }),
      { status: 503, headers: { 'Content-Type': 'application/json' } },
    );
  } as typeof fetch;
}
