// Module d'aide côté serveur, et NON un fichier « use server » : il exporte un
// contrat (AUTH_UNREACHABLE) et un prédicat synchrone (isTransportFailure), que
// la directive interdit — elle n'admet que des fonctions asynchrones, et un seul
// export non conforme fait disparaître TOUS les exports du module (62 erreurs de
// build pour cette seule ligne). Aucun composant client ne l'importe : la
// directive n'apportait rien. Ne pas la remettre.

import { cache } from 'react';
import { cookies } from 'next/headers';
import { getSupabaseServer } from './supabaseServerClient';
import { type Role, type Permission, roleHasPermission, getPermissionsForRole } from './rbac';
import { isExchangeRateSet } from './currency';

const ACTIVE_STORE_COOKIE = 'pp_active_store';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function validUuid(v: string | null | undefined): string | null {
  return v && UUID_RE.test(v) ? v : null;
}

export type BusinessContext = {
  supabase:        Awaited<ReturnType<typeof getSupabaseServer>>;
  userId:          string;
  businessId:      string;
  /**
   * 1 USD = `exchangeRate` HTG : la valeur réelle de `businesses.exchange_rate`,
   * 1 quand elle est NULL. Plus aucun repli à 130 : ce nombre n'avait jamais été
   * saisi par le marchand. Ne JAMAIS l'utiliser sans consulter `exchangeRateSet`
   * — pour écrire un taux (vente, achat, dépense), refuser quand il est faux ;
   * pour convertir un total, passer par `makeToReport` (lib/currency.ts).
   */
  exchangeRate:    number;
  /**
   * Vrai seulement si `businesses.exchange_rate` est un nombre > 1. Ni NULL,
   * ni 1 (valeur par défaut de la colonne).
   */
  exchangeRateSet: boolean;
  defaultCurrency: 'HTG' | 'USD';
  role:            Role;
  can:             (permission: Permission) => boolean;
  /**
   * Les cinq derniers abonnements du compte, échéance la plus lointaine d'abord.
   *
   * Ils sont lus ICI, en parallèle du rôle, parce que presque toute action
   * gardée finit par demander l’offre (`getActivePlanKey`). Lue là-bas, la
   * table `subscriptions` coûtait un aller-retour de PLUS, en série derrière
   * l'identité, le commerce et le rôle — sur une connexion haïtienne, autant
   * d'attente pour une requête qui pouvait partir en même temps que les autres.
   *
   * Brut, non normalisé : `lib/entitlements.ts` décide ce qu’est une offre
   * vivante. Tableau vide si la table est illisible — l’appelant retombe sur
   * son repli habituel, comme avant.
   */
  subscriptions:   SubscriptionRow[];
};

/** Une ligne d’abonnement, telle qu’elle est en base. */
export type SubscriptionRow = {
  plan_key:   string | null;
  status:     string | null;
  expires_at: string | null;
};

/**
 * Le nom porté par l'erreur quand le service d'authentification est
 * injoignable — par opposition à « cette personne n'a pas de session ».
 *
 * Exporté parce que c'est un contrat : un écran qui veut distinguer les deux
 * cas compare ce nom, il ne lit pas un message de formulaire.
 */
export const AUTH_UNREACHABLE = 'AuthUnreachableError';

/** Cette erreur est-elle un échec de TRANSPORT et non un refus d'identité ? */
export function isTransportFailure(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const name = String((err as Error).name ?? '');
  const msg  = String((err as Error).message ?? '');
  return (
    name === AUTH_UNREACHABLE
    || name === 'SupabaseTimeoutError'
    || name === 'SupabaseUnreachableError'
    || name === 'AuthRetryableFetchError'
    || name === 'TimeoutError'
    || name === 'AbortError'
    // Les messages en dernier recours : le SDK n'habille pas toujours l'échec
    // réseau d'un nom, et un « fetch failed » nu ne doit pas devenir un refus
    // d'identité.
    || /timeout|aborted|fetch failed|network|ENOTFOUND|ECONNREFUSED|EAI_AGAIN/i.test(msg)
  );
}

// cache() deduplicates within a single server request.
export const getBusinessContext = cache(async (): Promise<BusinessContext> => {
  const supabase = await getSupabaseServer();
  let user;
  // Robust getUser with a small retry on transient failures/timeouts
  let attempts = 0;
  let lastErr: unknown = null;
  while (attempts < 2) {
    attempts += 1;
    try {
      const { data: authData, error: authErr } = await supabase.auth.getUser();
      if (authErr) {
        console.error(`[getBusinessContext] auth.getUser error (attempt ${attempts}):`, authErr.message);
        lastErr = authErr;
        user = null;
      } else {
        user = authData?.user ?? null;
      }
      if (user) break;
    } catch (err) {
      console.error(`[getBusinessContext] auth.getUser threw (attempt ${attempts}):`, (err as Error).message);
      lastErr = err;
      user = null;
    }
    // short backoff
    if (!user && attempts < 2) await new Promise((r) => setTimeout(r, 150));
  }

  // ── « Non authentifié » et « injoignable » ne sont PAS la même chose ───────
  //
  // Les deux finissaient dans le même `Error('Non authentifié.')`, et le produit
  // en tirait une conclusion commerciale fausse. Le chemin observé, en entier :
  //
  //   `auth.getUser()` expire (projet Supabase en veille, réseau irrégulier)
  //     → getBusinessContext lève « Non authentifié »
  //       → `getActivePlanKey()` l'attrape et rend `null` — « aucune offre »
  //         → `assertFeature('online_store')` lève FeatureLockedError
  //           → l'écran dit « passez à l'offre Kwasans »
  //
  // … à un marchand dont l'abonnement Elit est actif et payé. Un à-coup réseau
  // de deux secondes se présentait comme une invitation à racheter ce qu'il a
  // déjà. C'est la pire forme du défaut : le message est faux ET il parle
  // d'argent.
  //
  // `lib/supabaseFetch.ts` nomme déjà ses échecs de transport
  // (`SupabaseTimeoutError`, `SupabaseUnreachableError`). Il suffisait de ne pas
  // jeter cette information. Le nom est conservé pour que l'appelant puisse
  // trancher ; aucun appelant n'est obligé de le faire, et ceux qui ne le font
  // pas se comportent exactement comme avant.
  if (!user) {
    if (isTransportFailure(lastErr)) {
      const e = new Error(
        (lastErr as Error).message
        || 'Votre compte est momentanément injoignable. Réessayez dans un instant.',
      );
      e.name = AUTH_UNREACHABLE;
      throw e;
    }
    throw new Error('Non authentifié.');
  }
  const userId = user.id;

  // Respect active store cookie (multi-store)
  const jar = await cookies();
  const activeStoreId = validUuid(jar.get(ACTIVE_STORE_COOKIE)?.value);

  // ── Quelle entreprise, quand le cookie ne le dit pas ? ─────────────────────
  //
  // Un même compte peut posséder plusieurs commerces — c'est tout l'objet du
  // sélecteur d'entreprise. Le cookie `pp_active_store` tranche presque
  // toujours ; les trois fonctions ci-dessous ne servent que lorsqu'il est
  // absent : nouvel appareil, cookies effacés, première connexion.
  //
  // Le critère retenu est **la plus ancienne**. Deux raisons :
  //
  //   C'est le commerce principal. Celui qu'on a créé en s'inscrivant, celui
  //   qui porte l'historique. Le second est une extension, pas un remplacement.
  //
  //   C'est stable. Prendre la plus récente ferait basculer par défaut TOUTE
  //   l'application vers la dernière boutique ouverte, à chaque session neuve —
  //   un marchand qui ouvre un second point de vente verrait son commerce
  //   principal disparaître de son écran d'accueil sans avoir rien demandé.
  //
  // Et surtout : `limit(1)`. Sans lui, `maybeSingle()` ne renvoie pas la
  // première ligne, il LÈVE — « JSON object requested, multiple (or no) rows
  // returned ». Un marchand avec deux commerces ne pouvait plus ouvrir
  // l'application du tout.

  type MemberRow = { id: string; role: string | null; is_active: boolean | null };
  /** La ligne de membre déjà lue en résolvant le commerce actif, s'il y en a une. */
  let knownMember: MemberRow | null = null;

  async function getActiveStoreBusiness(storeId: string) {
    const { data, error } = await supabase
      .from('businesses')
      .select('id, owner_id, exchange_rate, default_currency')
      .eq('id', storeId)
      // Un commerce supprimé ne redevient pas actif parce qu'un vieux cookie
      // le désigne encore.
      .is('deleted_at', null)
      // Ni un commerce archivé : l'écran (company.ts) l'écarte déjà. Sans ce
      // filtre, la page affichait une entreprise et les actions écrivaient
      // dans celle, archivée, que désignait encore le cookie.
      .is('archived_at', null)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return null;
    if (data.owner_id === userId) return data;
    // `role` et `is_active` en plus de `id` : c’est la MÊME ligne que
    // `resolveMembership` relisait juste après. Deux allers-retours pour une
    // seule réponse — le second disparaît en réutilisant celle-ci.
    const { data: member } = await supabase
      .from('business_members')
      .select('id, role, is_active')
      .eq('business_id', storeId)
      .eq('user_id', userId)
      .eq('is_active', true)
      .is('deleted_at', null)
      .maybeSingle();
    if (!member) return null;
    knownMember = member as MemberRow;
    return data;
  }

  async function getOwnedBusiness() {
    const { data, error } = await supabase
      .from('businesses')
      .select('id, owner_id, exchange_rate, default_currency')
      .eq('owner_id', userId)
      .is('deleted_at', null)
      // Les commerces actifs d'abord. Un compte dont TOUS les commerces sont
      // archivés retombe sur l'un d'eux plutôt que de s'en voir créer un
      // nouveau en silence (plus bas, `!biz` crée une entreprise).
      .order('archived_at', { ascending: true, nullsFirst: true })
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data;
  }

  async function getMemberBusiness() {
    const { data, error } = await supabase
      .from('business_members')
      .select('businesses (id, owner_id, exchange_rate, default_currency, archived_at, deleted_at)')
      .eq('user_id', userId)
      .eq('is_active', true)
      .is('deleted_at', null)
      // Même critère que pour les commerces possédés : l'adhésion la plus
      // ancienne. Sans tri, `limit(1)` renvoyait une ligne au hasard — et donc
      // potentiellement un commerce différent d'une session à l'autre.
      .order('joined_at', { ascending: true })
      // Quelques adhésions au plus : on les lit pour préférer un commerce actif
      // (non archivé, non supprimé), et ne retomber sur un archivé qu'à défaut.
      .limit(20);
    if (error) throw new Error(error.message);
    const joined = (data ?? [])
      .map((m: any) => (Array.isArray(m.businesses) ? m.businesses[0] : m.businesses))
      .filter((b: any) => b && !b.deleted_at);
    const pick = joined.find((b: any) => !b.archived_at) ?? joined[0] ?? null;
    if (!pick) return null;
    const { archived_at: _a, deleted_at: _d, ...biz } = pick;
    return biz as { id: string; owner_id: string; exchange_rate: number | null; default_currency: string | null };
  }

  /**
   * Les abonnements du compte. Cinq lignes, échéance la plus lointaine d’abord :
   * un abonnement annulé à échéance lointaine ne doit pas masquer l’actif —
   * même règle que `lib/trial.ts`, qui lit la même table pour ouvrir un essai.
   */
  async function readSubscriptions(): Promise<SubscriptionRow[]> {
    const { data, error } = await supabase
      .from('subscriptions')
      .select('plan_key, status, expires_at')
      .eq('user_id', userId)
      // NULLS LAST : en DESC, Postgres remonte les échéances vides en tête, et
      // cinq lignes sans date pousseraient l'abonnement réel hors de la liste.
      .order('expires_at', { ascending: false, nullsFirst: false })
      .limit(5);
    // Table illisible : aucune offre connue. L’appelant retombe sur son repli.
    if (error) return [];
    return (data ?? []) as SubscriptionRow[];
  }

  let biz = null;
  if (activeStoreId) {
    biz = await getActiveStoreBusiness(activeStoreId);
  }
  if (!biz) {
    biz = await getOwnedBusiness();
  }
  if (!biz) {
    biz = await getMemberBusiness();
  }

  /**
   * Appartenance et rôle en UNE lecture.
   *
   * Le chemin précédent en faisait trois, à chaque server action : vérifier la
   * ligne `business_members`, puis redemander à `businesses` si l'utilisateur
   * en est propriétaire, puis relire `business_members` pour le rôle. Or
   * `owner_id` est déjà là — l'entreprise vient d'être lue avec — et la même
   * ligne de membre répond aux deux autres questions.
   *
   * La ligne de propriétaire reste créée si elle manque : les politiques RLS
   * s'appuient sur `business_members`, sans elle le propriétaire perdrait
   * l'accès à ses propres données.
   */
  async function resolveMembership(businessId: string, ownerId: string | undefined): Promise<Role> {
    const isOwner = ownerId === userId;

    // Déjà lue en résolvant le commerce actif : on ne la redemande pas.
    const member = knownMember ?? (await supabase
      .from('business_members')
      .select('id, role, is_active')
      .eq('business_id', businessId)
      .eq('user_id', userId)
      .maybeSingle()).data;

    if (!member && isOwner) {
      await supabase.from('business_members').insert({
        business_id: businessId,
        user_id:     userId,
        role:        'owner',
        is_active:   true,
      });
    }

    if (isOwner) return 'owner';
    return member?.is_active ? ((member.role as Role) ?? 'viewer') : 'viewer';
  }

  if (!biz) {
    const { data: newBiz, error: createErr } = await supabase
      .from('businesses')
      .insert({
        owner_id:         userId,
        name:             user.user_metadata?.business_name ?? user.user_metadata?.full_name ?? 'Mon Entreprise',
        default_currency: 'HTG',
        // Pas de exchange_rate : la colonne vaut 1 par défaut, soit « non
        // renseigné ». Écrire 130 ici le faisait passer pour un taux saisi.
      })
      .select('id, exchange_rate, default_currency')
      .single();

    if (createErr || !newBiz) throw new Error(createErr?.message ?? 'Impossible de créer le business.');
    const id = (newBiz as any).id as string;
    const [, newSubs] = await Promise.all([
      resolveMembership(id, userId),   // entreprise qu'on vient de créer : propriétaire
      readSubscriptions(),
    ]);
    return buildContext(supabase, userId, id, newBiz as any, 'owner', newSubs);
  }

  const id = (biz as any).id as string;
  // Le rôle et l'offre ne dépendent pas l'un de l'autre : en série, c'était un
  // aller-retour de plus avant la moindre lecture utile.
  const [role, subs] = await Promise.all([
    resolveMembership(id, (biz as any).owner_id),
    readSubscriptions(),
  ]);
  return buildContext(supabase, userId, id, biz as any, role, subs);
});

function buildContext(
  supabase:   any,
  userId:     string,
  businessId: string,
  biz:        { exchange_rate?: number; default_currency?: string },
  role:       Role,
  subscriptions: SubscriptionRow[],
): BusinessContext {
  return {
    supabase,
    userId,
    businessId,
    exchangeRate:    Number(biz.exchange_rate ?? 1),
    exchangeRateSet: isExchangeRateSet(biz.exchange_rate),
    defaultCurrency: (biz.default_currency ?? 'HTG') as 'HTG' | 'USD',
    role,
    can: (permission: Permission) => roleHasPermission(role, permission),
    subscriptions,
  };
}

/**
 * Throws 403 if the current user lacks the given permission.
 * Use at the top of any sensitive server action.
 */
export async function requirePermission(permission: Permission): Promise<BusinessContext> {
  const ctx = await getBusinessContext();
  if (!ctx.can(permission)) {
    throw new Error(`Permission refusée : ${permission}`);
  }
  return ctx;
}

/**
 * Vérifie qu'un utilisateur est membre actif d'un business spécifique.
 */
export async function verifyBusinessAccess(businessId: string): Promise<BusinessContext> {
  if (!validUuid(businessId)) throw new Error('ID entreprise invalide.');

  const supabase = await getSupabaseServer();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) throw new Error('Non authentifié.');

  const { data: member, error: mErr } = await supabase
    .from('business_members')
    .select('business_id, role')
    .eq('business_id', businessId)
    .eq('user_id', user.id)
    .eq('is_active', true)
    .is('deleted_at', null)
    .maybeSingle();

  if (mErr) throw new Error(mErr.message);
  if (!member) throw new Error("Vous n'êtes pas membre de cette entreprise.");

  // Le commerce et les abonnements ne dépendent pas l'un de l'autre : les lire
  // en série ajoutait un aller-retour à chaque appel.
  const [{ data: biz }, { data: subs }] = await Promise.all([
    supabase
      .from('businesses')
      .select('exchange_rate, default_currency')
      .eq('id', businessId)
      .maybeSingle(),
    supabase
      .from('subscriptions')
      .select('plan_key, status, expires_at')
      .eq('user_id', user.id)
      .order('expires_at', { ascending: false, nullsFirst: false })
      .limit(5),
  ]);

  const role = (member.role as Role) ?? 'viewer';
  return buildContext(supabase, user.id, businessId, biz ?? {}, role, (subs ?? []) as SubscriptionRow[]);
}

/**
 * Le taux saisi de l'entreprise (1 USD = X HTG), ou `null` s'il ne l'a jamais
 * été (NULL, ou 1, la valeur par défaut de la colonne). Jamais de repli : à
 * l'appelant de refuser, ou d'exclure et compter le montant.
 */
export async function getBusinessExchangeRate(supabase: any, businessId: string): Promise<number | null> {
  try {
    const ctx = await getBusinessContext();
    if (ctx.businessId === businessId) return ctx.exchangeRateSet ? ctx.exchangeRate : null;
  } catch { /* fall through */ }

  const { data } = await supabase
    .from('businesses')
    .select('exchange_rate')
    .eq('id', businessId)
    .maybeSingle();
  return isExchangeRateSet(data?.exchange_rate) ? Number(data.exchange_rate) : null;
}
