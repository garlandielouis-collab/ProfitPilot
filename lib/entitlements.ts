// ─────────────────────────────────────────────────────────────────────────────
// Gating serveur des offres — Diagnostic 8 / structure des offres
//
// Le gating côté client (PermissionGate / usePermissions) est cosmétique :
// il masque l'UI. Toute server action qui expose une fonctionnalité payante
// doit en plus appeler `assertFeature()` — sinon un appel direct contourne
// l'offre. Même logique pour les permissions RBAC via `assertPermission()`.
// ─────────────────────────────────────────────────────────────────────────────

import { cache } from 'react';
import { getSupabaseServer } from './supabaseServerClient';
import { getBusinessContext, isTransportFailure, type SubscriptionRow } from './serverAuth';
import { FALLBACK_PLAN_KEY, normalizePlanKey, getPlanLabel, type PlanKey } from './plans';
import { getPreviewPlanServer } from './planPreviewServer';
import {
  planHasFeature,
  planMaxMembers,
  planMaxStores,
  requiredPlanFor,
  type Feature,
} from './planFeatures';
import { roleHasPermission, type Permission } from './rbac';
import { previewFeatureOverrideEnabled } from './storePreview';

/**
 * Offre appliquée quand aucun abonnement actif n'est trouvé — la même que côté
 * client (`getClientTenantContext()`), parce qu'elle vient du même endroit.
 * Deux replis distincts, et l'écran montrerait une chose pendant que le serveur
 * en jugerait une autre. Passer à `null` pour couper l'accès dès la fin de
 * l'essai.
 */
const TRIAL_FALLBACK_PLAN: PlanKey | null = FALLBACK_PLAN_KEY;

export class FeatureLockedError extends Error {
  constructor(
    public readonly feature: Feature,
    public readonly requiredPlan: PlanKey | null,
  ) {
    super(
      requiredPlan
        ? `Fonctionnalité disponible à partir de l'offre ${getPlanLabel(requiredPlan)}.`
        : 'Fonctionnalité non disponible sur votre offre.',
    );
    this.name = 'FeatureLockedError';
  }
}

/**
 * L'offre vivante parmi les abonnements déjà lus par `getBusinessContext()`.
 *
 * Ces lignes arrivent avec le contexte, lues en parallèle du rôle : demander
 * la table ici coûtait un aller-retour de plus, en série derrière tout le
 * reste, sur chaque action gardée — et la garde est partout.
 *
 * Même critère que la requête qu'elle remplace (`status = 'active'` et
 * `expires_at >= maintenant`, la plus lointaine en premier) : un abonnement
 * annulé ou échu ne compte pas, même s'il est en tête de liste.
 */
function livePlanKey(subscriptions: SubscriptionRow[]): PlanKey | null {
  const now = Date.now();
  const live = subscriptions.find(
    (row) =>
      row.status === 'active' &&
      // Comparées en INSTANTS, pas en texte : la base rend « …+00:00 » et
      // JavaScript « …Z » — deux écritures du même moment qui ne se classent
      // pas pareil caractère par caractère.
      !!row.expires_at &&
      +new Date(row.expires_at) >= now,
  );
  return normalizePlanKey(live?.plan_key ?? undefined) ?? null;
}

/**
 * Offre active de l'utilisateur courant (clé technique normalisée).
 *
 * `cache()` dédoublonne dans une même requête serveur. Sans lui, une action qui
 * appelle `assertFeature()` puis `assertPermission()` — ou deux gardes de suite
 * — refaisait `auth.getUser()`, qui est un **aller-retour réseau** vers l'API
 * Auth de Supabase, pas une lecture locale. C'était le coût caché du gating.
 */
export const getActivePlanKey = cache(async (): Promise<PlanKey | null> => {
  // L'identité vient de `getBusinessContext()`, lui aussi memoïsé sur la
  // requête : toute action payante l'appelle de toute façon. Refaire ici un
  // `auth.getUser()` doublait l'aller-retour vers l'API Auth pour rien.
  // ── « Injoignable » n'est pas « non abonné » ──────────────────────────────
  //
  // Ce `catch` avalait TOUT, échecs de transport compris, et rendait `null` —
  // c'est-à-dire « aucune offre ». `assertFeature` levait alors une
  // `FeatureLockedError` : un à-coup réseau de deux secondes se présentait au
  // marchand comme une invitation à racheter ce qu'il paie déjà.
  //
  // `getBusinessContext` a été corrigé pour NOMMER cet échec (AUTH_UNREACHABLE,
  // voir le commentaire qui décrit la chaîne complète dans lib/serverAuth.ts)
  // — mais la correction s'arrêtait là : le maillon suivant, ici, jetait
  // l'information aussitôt. La chaîne décrite tenait donc toujours, et l'écran
  // « Vitrine et gabarits » en mourait : `getBuilderState` commence par
  // `assertFeature('online_store')`, la server action levait, et Next masque le
  // message des erreurs levées en production — le marchand lisait « An error
  // occurred in the Server Components render » sur son téléphone.
  //
  // On ne conclut plus rien quand on n'a pas pu demander : l'échec remonte tel
  // quel, et l'appelant le distingue avec `isTransportFailure` — c'est déjà ce
  // que fait /apercu, qui propose « Réessayer » au lieu de « passez à Kwasans ».
  let subscriptions: SubscriptionRow[];
  try {
    subscriptions = (await getBusinessContext()).subscriptions;
  } catch (err) {
    if (isTransportFailure(err)) throw err;
    return null;   // non authentifié : aucune offre
  }

  // ── L'aperçu des offres ────────────────────────────────────────────────────
  // Il court-circuite la lecture de l'abonnement pour que les écrans montrent
  // vraiment l'offre demandée — sans quoi l'aperçu ne changerait que deux
  // boutons, tout le reste étant filtré ici.
  //
  // Il n'est honoré que si l'exploitant a posé `PLAN_PREVIEW=1` sur le serveur.
  // En production normale, `getPreviewPlanServer()` renvoie toujours `null` :
  // écrire le cookie à la main ne donne rien. Et l'aperçu ne touche jamais la
  // table `subscriptions` — l'abonnement réel reste intact, on n'écrase rien.
  const preview = await getPreviewPlanServer();
  if (preview) return preview;

  return livePlanKey(subscriptions) ?? TRIAL_FALLBACK_PLAN;
});

/**
 * L'offre RÉELLE du compte, sans jamais tenir compte de l'aperçu.
 * Sert au bandeau « votre offre réelle est … » — et à tout endroit où mentir
 * serait grave : facturation, relances, courriels.
 */
export const getRealPlanKey = cache(async (): Promise<PlanKey | null> => {
  try {
    const { subscriptions } = await getBusinessContext();
    return livePlanKey(subscriptions) ?? TRIAL_FALLBACK_PLAN;
  } catch {
    return null;
  }
});

/** `true` si l'offre active donne accès à la fonctionnalité. */
/**
 * Les droits TEMPORAIRES du compte — ceux qui ne viennent pas de l'offre.
 *
 * Un mois de Rapports gagné par parrainage n'est pas un changement d'offre :
 * le marchand reste sur Esansyel, sa facture ne bouge pas, et à l'échéance il
 * retombe exactement où il était. D'où une source distincte, lue en plus de
 * l'offre — jamais à sa place.
 *
 * `cache()` pour la même raison que le reste : une action qui vérifie deux
 * capacités ne doit pas relire la table deux fois.
 *
 * Table absente (migration non jouée) : aucun droit. Le produit fonctionne,
 * simplement personne n'a de cadeau en cours.
 */
export const getActiveGrants = cache(async (): Promise<Feature[]> => {
  try {
    const { supabase, userId } = await getBusinessContext();

    const { data, error } = await supabase
      .from('feature_grants')
      .select('feature')
      .eq('user_id', userId)
      .gt('expires_at', new Date().toISOString());

    if (error) return [];
    return (data ?? []).map((row) => (row as { feature: string }).feature as Feature);
  } catch {
    return [];
  }
});

/** `true` si l'offre active OU un droit temporaire couvre la fonctionnalité. */
export async function hasFeature(feature: Feature): Promise<boolean> {
  if (feature === 'online_store' && previewFeatureOverrideEnabled()) return true;
  if (planHasFeature(await getActivePlanKey(), feature)) return true;
  return (await getActiveGrants()).includes(feature);
}

/**
 * Lève une `FeatureLockedError` si l'offre ne couvre pas la fonctionnalité.
 * À appeler en première ligne des server actions payantes.
 */
export async function assertFeature(feature: Feature): Promise<void> {
  if (await hasFeature(feature)) return;
  throw new FeatureLockedError(feature, requiredPlanFor(feature));
}

/** Fin du droit temporaire sur une capacité, ou `null` s'il n'y en a pas. */
export async function grantExpiryFor(feature: Feature): Promise<string | null> {
  try {
    const { supabase, userId } = await getBusinessContext();
    const { data } = await supabase
      .from('feature_grants')
      .select('expires_at')
      .eq('user_id', userId)
      .eq('feature', feature)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle();
    return (data as { expires_at?: string } | null)?.expires_at ?? null;
  } catch {
    return null;
  }
}

/** Lève une erreur si le rôle de l'utilisateur n'a pas la permission RBAC. */
export async function assertPermission(permission: Permission): Promise<void> {
  const { role } = await getBusinessContext();
  if (roleHasPermission(role, permission)) return;
  throw new Error(`Action non autorisée pour le rôle "${role}".`);
}

/** Raccourci : offre + rôle vérifiés en une fois. */
export async function assertAccess(
  feature: Feature,
  permission?: Permission,
): Promise<void> {
  await assertFeature(feature);
  if (permission) await assertPermission(permission);
}

// ─────────────────────────────────────────────────────────────────────────────
// Quotas d'offre — sièges et entreprises
//
// « Le business dépend d'une seule personne » (Diagnostic 8) se règle en
// ajoutant des membres ; c'est aussi ce qui distingue les offres. Le compte se
// fait donc côté serveur, sur la même source que `getActivePlanKey()`, sinon
// deux endroits du code répondent différemment à « combien de sièges ? ».
// ─────────────────────────────────────────────────────────────────────────────

export class PlanLimitError extends Error {
  constructor(
    public readonly limit: number,
    public readonly current: number,
    message: string,
  ) {
    super(message);
    this.name = 'PlanLimitError';
  }
}

/**
 * Sièges déjà occupés dans l'entreprise (propriétaire inclus) + invitations en
 * attente : une invitation non acceptée réserve un siège, sinon on peut inviter
 * dix personnes sur une offre à trois places.
 */
export async function countBusinessSeats(businessId: string): Promise<number> {
  const supabase = await getSupabaseServer();

  const [{ count: members }, { count: pending }] = await Promise.all([
    supabase
      .from('business_members')
      .select('id', { count: 'exact', head: true })
      .eq('business_id', businessId)
      .eq('is_active', true)
      .is('deleted_at', null),
    supabase
      .from('employee_invitations')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', businessId)
      .is('accepted_at', null),
  ]);

  return (members ?? 0) + (pending ?? 0);
}

/**
 * Lève une `PlanLimitError` si ajouter un membre dépasserait l'offre.
 * À appeler avant toute invitation ou ajout de membre.
 */
export async function assertSeatAvailable(businessId: string): Promise<void> {
  const planKey = await getActivePlanKey();
  const max     = planMaxMembers(planKey);
  const current = await countBusinessSeats(businessId);

  if (current < max) return;

  throw new PlanLimitError(
    max,
    current,
    max <= 1
      ? `L'offre ${getPlanLabel(planKey)} est mono-utilisateur. Passez à Kwasans pour ajouter votre première personne.`
      : `Limite atteinte : l'offre ${getPlanLabel(planKey)} couvre ${max} membres (sièges occupés : ${current}).`,
  );
}

/** Même logique pour les entreprises/boutiques détenues par un propriétaire. */
export async function assertStoreAvailable(ownerId: string): Promise<void> {
  const supabase = await getSupabaseServer();
  const planKey  = await getActivePlanKey();
  const max      = planMaxStores(planKey);

  const { count } = await supabase
    .from('businesses')
    .select('id', { count: 'exact', head: true })
    .eq('owner_id', ownerId)
    .is('deleted_at', null)
    .is('archived_at', null);

  const current = count ?? 0;
  if (current < max) return;

  throw new PlanLimitError(
    max,
    current,
    `Limite atteinte : l'offre ${getPlanLabel(planKey)} permet ${max} entreprise${max > 1 ? 's' : ''} (vous en avez ${current}).`,
  );
}
