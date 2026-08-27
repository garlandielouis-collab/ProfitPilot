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
import { getBusinessContext } from './serverAuth';
import { normalizePlanKey, getPlanLabel, type PlanKey } from './plans';
import {
  planHasFeature,
  planMaxMembers,
  planMaxStores,
  requiredPlanFor,
  type Feature,
} from './planFeatures';
import { roleHasPermission, type Permission } from './rbac';

/**
 * Offre appliquée quand aucun abonnement actif n'est trouvé.
 * Aligné sur le comportement d'essai actuel de `getClientTenantContext()`.
 * Passer à `null` pour couper l'accès dès la fin de l'essai.
 */
const TRIAL_FALLBACK_PLAN: PlanKey | null = 'Expert';

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
  let userId: string;
  let supabase: Awaited<ReturnType<typeof getSupabaseServer>>;
  try {
    const ctx = await getBusinessContext();
    userId   = ctx.userId;
    supabase = ctx.supabase;
  } catch {
    return null;   // non authentifié : aucune offre
  }

  const { data: sub } = await supabase
    .from('subscriptions')
    .select('plan_key')
    .eq('user_id', userId)
    .eq('status', 'active')
    .gte('expires_at', new Date().toISOString())
    .order('expires_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return normalizePlanKey(sub?.plan_key as string | undefined) ?? TRIAL_FALLBACK_PLAN;
});

/** `true` si l'offre active donne accès à la fonctionnalité. */
export async function hasFeature(feature: Feature): Promise<boolean> {
  return planHasFeature(await getActivePlanKey(), feature);
}

/**
 * Lève une `FeatureLockedError` si l'offre ne couvre pas la fonctionnalité.
 * À appeler en première ligne des server actions payantes.
 */
export async function assertFeature(feature: Feature): Promise<void> {
  if (await hasFeature(feature)) return;
  throw new FeatureLockedError(feature, requiredPlanFor(feature));
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
