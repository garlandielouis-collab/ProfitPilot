import { type NextRequest, NextResponse } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { createBoundedFetch } from './lib/supabaseFetch';

// Sans délai maximal, une résolution DNS impossible fait attendre le
// middleware ~25 s AVANT chaque page. 5 s suffisent largement ici.
const boundedFetch = createBoundedFetch({ timeoutMs: 5_000, retries: 0 });

const publicRoutes = [
  '/',
  '/auth/login',
  '/auth/register',
  '/auth/callback',
  // Sans ces deux-là, le lien « Mot de passe oublié » renverrait vers l'écran
  // de connexion : le chemin de récupération serait une impasse (§3.1).
  '/auth/forgot-password',
  '/auth/reset-password',
  '/auth/accept-invitation',
  '/api/invitations',
  '/store',
  // L'atelier des gabarits : un rendu de démonstration des gabarits métier,
  // sans base de données, pour celui qui les fabrique. La PAGE elle-même
  // répond 404 hors développement — l'ouvrir ici ne l'expose donc pas en
  // production, cela évite seulement que `next dev` la renvoie vers l'écran
  // de connexion.
  ...(process.env.NODE_ENV === 'production' ? [] : ['/atelier']),
];

// ═════════════════════════════════════════════════════════════════════════════
// Routage par hôte — sous-domaines et domaines personnalisés des vitrines
//
//   maboutique.profitpilot.app/produits  →  /store/maboutique/produits
//   boutique-du-cap.com/produits         →  /store/<slug résolu>/produits
//   app.profitpilot.app/dashboard        →  inchangé
//
// Ce bloc s'exécute AVANT la logique de session, et sort avec une réécriture
// dès qu'il reconnaît une vitrine. Deux raisons :
//
//   Un acheteur n'a pas de compte ProfitPilot. Lui faire traverser un
//   rafraîchissement de session Supabase, c'est un aller-retour réseau ajouté
//   à chaque page d'une boutique — sur une connexion mobile haïtienne, c'est le
//   temps de chargement qui décide de la vente.
//
//   Et surtout : il ne doit jamais pouvoir être redirigé vers /auth/login. La
//   vitrine du marchand est publique, quoi qu'il arrive plus bas.
//
// Règle d'or : ce bloc ne peut pas rendre un chemin inaccessible. Hôte inconnu,
// recherche de domaine en échec, Supabase en veille — on laisse passer vers
// l'application. Une vitrine qui ne se résout pas dégrade, elle ne casse pas.
// ═════════════════════════════════════════════════════════════════════════════

/** Le domaine sur lequel les sous-domaines de vitrine sont servis. */
const ROOT_DOMAIN = (
  process.env.NEXT_PUBLIC_STORE_ROOT_DOMAIN ??
  process.env.NEXT_PUBLIC_APP_URL?.replace(/^https?:\/\//, '').replace(/\/$/, '') ??
  'localhost:3000'
).toLowerCase();

/**
 * Les hôtes qui servent l'APPLICATION et jamais une vitrine.
 *
 * Le domaine racine nu et `www` en font partie : profitpilot.app doit rester la
 * page d'accueil, pas la boutique d'un marchand.
 */
const APP_HOSTS = new Set(
  [
    ROOT_DOMAIN,
    `www.${ROOT_DOMAIN}`,
    'localhost:3000',
    'localhost',
    '127.0.0.1:3000',
    process.env.NEXT_PUBLIC_APP_URL?.replace(/^https?:\/\//, '').replace(/\/$/, ''),
    process.env.VERCEL_URL,
    process.env.VERCEL_BRANCH_URL,
    process.env.VERCEL_PROJECT_PRODUCTION_URL,
  ]
    .filter((h): h is string => Boolean(h))
    .map((h) => h.toLowerCase()),
);

/**
 * Sous-domaines d'infrastructure. La contrainte SQL les refuse déjà comme slug ;
 * on les refuse aussi ici, pour que les deux barrières soient indépendantes.
 */
const RESERVED_SUBDOMAINS = new Set([
  'www', 'app', 'api', 'admin', 'auth', 'dashboard', 'cdn', 'assets', 'static',
  'mail', 'ftp', 'staging', 'dev', 'test', 'preview', 'vercel',
]);

const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/;

// Cache mémoire, par instance. Il ne garantit rien : il évite un aller-retour
// par requête sur les instances chaudes. Les échecs sont mis en cache aussi,
// plus brièvement — sinon un domaine mal configuré déclenche une requête à
// chaque passage d'un robot.
type CacheEntry = { slug: string | null; expiresAt: number };
const domainCache = new Map<string, CacheEntry>();
const HIT_TTL = 5 * 60 * 1000;
const MISS_TTL = 30 * 1000;

async function resolveCustomDomain(host: string): Promise<string | null> {
  const cached = domainCache.get(host);
  if (cached && cached.expiresAt > Date.now()) return cached.slug;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;

  let slug: string | null = null;
  try {
    // Une FONCTION, pas une lecture de table.
    //
    // La version précédente interrogeait `store_settings` avec la clé anon. Le
    // rôle `anon` n'a jamais reçu de GRANT sur cette table : PostgREST répondait
    // « permission denied for table store_settings » (42501), le `catch`
    // avalait l'échec, et aucun domaine personnalisé n'a jamais résolu — sans
    // une ligne de journal pour le dire.
    //
    // `resolve_store_domain` est SECURITY DEFINER et ne rend qu'un slug : c'est
    // la seule chose dont l'edge a besoin, et la seule qu'un visiteur non
    // authentifié peut en tirer. Les identifiants de passerelle, eux, ont quitté
    // la table (voir 20260904_commerce_integrity.sql).
    const res = await fetch(`${url}/rest/v1/rpc/resolve_store_domain`, {
      method: 'POST',
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ p_host: host }),
      signal: AbortSignal.timeout(2_000),
      cache: 'no-store',
    });
    if (res.ok) {
      const found = (await res.json()) as string | null;
      if (typeof found === 'string' && SLUG_RE.test(found)) slug = found;
    } else if (process.env.NODE_ENV !== 'production') {
      // En développement, un échec ici est presque toujours une migration non
      // jouée. Le dire coûte une ligne et fait gagner une heure.
      console.warn(
        `[proxy] resolve_store_domain a répondu ${res.status} — ` +
          '20260904_commerce_integrity.sql est-elle appliquée ?',
      );
    }
  } catch {
    // Réseau, délai dépassé, projet en veille : on ne résout pas, on n'échoue
    // pas non plus, et on ne met pas en cache — le prochain essai retentera.
    return null;
  }

  domainCache.set(host, { slug, expiresAt: Date.now() + (slug ? HIT_TTL : MISS_TTL) });
  return slug;
}

/** La réécriture vers la vitrine, ou `null` si la requête n'en vise aucune. */
async function resolveStoreRewrite(request: NextRequest): Promise<NextResponse | null> {
  // L'en-tête `host` porte le port en développement (« maboutique.localhost:3000 »)
  // et ROOT_DOMAIN aussi : les deux se comparent tels quels.
  const host = (request.headers.get('host') ?? '').toLowerCase();
  if (!host) return null;

  if (APP_HOSTS.has(host) || host.endsWith('.vercel.app')) return null;

  const { pathname, search } = request.nextUrl;

  // Déjà sur la route de vitrine : ne pas réécrire une réécriture.
  if (pathname.startsWith('/store/')) return null;

  let slug: string | null = null;

  if (host.endsWith(`.${ROOT_DOMAIN}`)) {
    const candidate = host.slice(0, -(ROOT_DOMAIN.length + 1));
    // Un seul niveau : « a.b.profitpilot.app » n'est pas une vitrine.
    if (
      !candidate.includes('.') &&
      SLUG_RE.test(candidate) &&
      !RESERVED_SUBDOMAINS.has(candidate)
    ) {
      slug = candidate;
    } else {
      return null;
    }
  } else {
    slug = await resolveCustomDomain(host);
  }

  if (!slug) return null;

  const url = request.nextUrl.clone();
  url.pathname = `/store/${slug}${pathname === '/' ? '' : pathname}`;
  url.search = search;

  // Les en-têtes vont sur la REQUÊTE, pas sur la réponse : c'est `headers()`
  // dans un composant serveur qui doit les lire. Sans eux, la vitrine ignore
  // sur quel hôte elle est servie et construit ses liens en /store/<slug>/… —
  // faisant fuiter le chemin interne dans la barre d'adresse du client.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-pp-store-host', host);
  requestHeaders.set('x-pp-store-slug', slug);

  return NextResponse.rewrite(url, { request: { headers: requestHeaders } });
}

// ═════════════════════════════════════════════════════════════════════════════

export async function proxy(request: NextRequest) {
  // ── 0. Vitrine ? Alors c'est fini ici. ────────────────────────────────────
  const storeRewrite = await resolveStoreRewrite(request);
  if (storeRewrite) return storeRewrite;

  const pathname = request.nextUrl.pathname;
  const isPublic = publicRoutes.some((r) => pathname === r || pathname.startsWith(r + '/'));

  // Fast path: no auth cookie → skip Supabase entirely
  const allCookies = request.cookies.getAll();
  const hasAuthCookie = allCookies.some(
    (c) => c.name.startsWith('sb-') && c.name.includes('-auth-token')
  );

  if (!hasAuthCookie) {
    if (!isPublic) {
      const loginUrl = request.nextUrl.clone();
      loginUrl.pathname = '/auth/login';
      return NextResponse.redirect(loginUrl);
    }
    return NextResponse.next({ request: { headers: request.headers } });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.next({ request: { headers: request.headers } });
  }

  let supabaseResponse = NextResponse.next({ request: { headers: request.headers } });

  const supabase = createServerClient(supabaseUrl, supabaseKey, {
    global: { fetch: boundedFetch },
    cookies: {
      getAll() { return request.cookies.getAll(); },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options as CookieOptions)
        );
      },
    },
  });

  // getSession() decodes the JWT locally — no Supabase network round-trip.
  // getUser() validates with the server (~200-500ms) — unnecessary on every request.
  const { data: { session } } = await supabase.auth.getSession();
  const user = session?.user ?? null;

  if (!user && !isPublic) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = '/auth/login';
    return NextResponse.redirect(loginUrl);
  }

  if (user && (pathname === '/auth/login' || pathname === '/auth/register')) {
    const dashboardUrl = request.nextUrl.clone();
    dashboardUrl.pathname = '/dashboard';
    return NextResponse.redirect(dashboardUrl);
  }

  return supabaseResponse;
}

export { proxy as middleware };

// ── Ce que le middleware ne doit PAS voir ───────────────────────────────────
//
// `public` dans la liste ne servait à rien : les fichiers de `/public` sont
// servis à la racine (`/ProfitPilot-favicon.png`), pas sous `/public/...`. Ils
// traversaient donc le garde-fou d'authentification et repartaient en 307 vers
// /auth/login pour tout visiteur non connecté — c'est-à-dire pour le client de
// chaque boutique, sur chaque page :
//
//   /ProfitPilot-favicon.png  307 → /auth/login
//   /ProfitPilot-logo.png     307 → /auth/login
//   /manifest.json            307 → /auth/login
//   /sw.js                    307 → /auth/login
//
// Quatre allers-retours inutiles par page sur une connexion mobile, un manifeste
// PWA illisible, et l'enregistrement du service worker en échec (« the script
// resource is behind a redirect »).
//
// Les extensions listées sont celles des fichiers statiques. `sitemap.xml` et
// `robots.txt` restent volontairement DANS le champ du middleware : sur un
// domaine personnalisé, c'est lui qui les réécrit vers la bonne vitrine, et les
// en exclure les ferait répondre 404 chez le marchand.
export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|manifest.json|sw.js|.*\\.(?:png|jpe?g|gif|svg|ico|webp|avif|woff2?|ttf|otf|eot|mp4|webm|css|js\\.map)$).*)',
  ],
};
