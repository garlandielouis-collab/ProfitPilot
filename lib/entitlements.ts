// ─────────────────────────────────────────────────────────────────────────────
// Gating serveur des offres — Diagnostic 8 / structure des offres
//
// Le gating côté client (PermissionGate / usePermissions) est cosmétique :
// il masque l'UI. Toute server action qui expose une fonctionnalité payante
// doit en plus appeler `assertFeature()` — sinon un appel direct contourne
// l'offre. Même logique pour les permissions RBAC via `assertPermission()`.
// ─────────────────────────────────────────────────────────────────────────────

import { getSupabaseServer } from './supabaseServerClient';
import { getBusinessContext } from './serverAuth';
import { normalizePlanKey, getPlanLabel, type PlanKey } from './plans';
import { planHasFeature, requiredPlanFor, type Feature } from './planFeatures';
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

/** Offre active de l'utilisateur courant (clé technique normalisée). */
export async function getActivePlanKey(): Promise<PlanKey | null> {
  const supabase = await getSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: sub } = await supabase
    .from('subscriptions')
    .select('plan_key')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .gte('expires_at', new Date().toISOString())
    .order('expires_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return normalizePlanKey(sub?.plan_key as string | undefined) ?? TRIAL_FALLBACK_PLAN;
}

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
