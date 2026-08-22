import { normalizePlanKey, type PlanKey } from './plans';

// ─────────────────────────────────────────────────────────────────────────────
// Feature flags par offre — Esansyel / Kwasans / Elit
//
// Une feature = une capacité produit vendable, telle qu'elle est présentée au
// téléphone. Le gating se fait toujours via `planHasFeature()` (client) ou
// `assertFeature()` côté serveur — jamais en dur dans les composants.
// ─────────────────────────────────────────────────────────────────────────────

export type Feature =
  // ── Socle (Esansyel) ──
  | 'quick_sale'
  | 'margin_calculator'
  | 'basic_dashboard'
  | 'expense_scopes'
  | 'offline_mode'
  // ── Croissance (Kwasans) ──
  | 'receivables'
  | 'receivable_reminders'
  | 'product_profitability'
  | 'monthly_goals'
  | 'month_comparison'
  | 'weekly_whatsapp_report'
  | 'rate_alerts'
  | 'price_simulator'
  | 'low_stock_alerts'
  | 'ai_assistant'
  | 'advanced_reports'
  | 'advanced_dashboard'
  | 'online_store'
  | 'multi_stores'
  // ── Élite (Elit) ──
  | 'employees'
  | 'multi_user_roles'
  | 'credit_export'
  | 'health_score'
  | 'auto_recommendations'
  | 'priority_support'
  | 'advanced_analytics'
  | 'automation'
  | 'api_access';

/** Fonctionnalités incluses dans Esansyel — le socle de tout compte payant. */
const ESANSYEL: Feature[] = [
  'quick_sale',
  'margin_calculator',
  'basic_dashboard',
  'expense_scopes',
  'offline_mode',
];

/** Kwasans = Esansyel + structuration de la croissance. */
const KWASANS: Feature[] = [
  ...ESANSYEL,
  'receivables',
  'receivable_reminders',
  'product_profitability',
  'monthly_goals',
  'month_comparison',
  'weekly_whatsapp_report',
  'rate_alerts',
  'price_simulator',
  'low_stock_alerts',
  'ai_assistant',
  'advanced_reports',
  'advanced_dashboard',
  'online_store',
  'multi_stores',
  'employees',
];

/** Elit = Kwasans + délégation et accès au financement. */
const ELIT: Feature[] = [
  ...KWASANS,
  'multi_user_roles',
  'credit_export',
  'health_score',
  'auto_recommendations',
  'priority_support',
  'advanced_analytics',
  'automation',
  'api_access',
];

const PLAN_FEATURES: Record<PlanKey, Feature[]> = {
  'Ti Machann':     ESANSYEL,
  'Business Pilot': KWASANS,
  'Expert':         ELIT,
};

/** Nombre maximum d'entreprises/boutiques détenues par offre. */
export const PLAN_MAX_STORES: Record<PlanKey, number> = {
  'Ti Machann':     1,
  'Business Pilot': 1,
  'Expert':         3,
};

/** Nombre maximum de membres actifs (owner inclus) par offre. */
export const PLAN_MAX_MEMBERS: Record<PlanKey, number> = {
  'Ti Machann':     1,
  'Business Pilot': 3,
  'Expert':         25,
};

/** Offre minimale requise pour une feature — sert aux messages d'upsell. */
export function requiredPlanFor(feature: Feature): PlanKey | null {
  if (ESANSYEL.includes(feature)) return 'Ti Machann';
  if (KWASANS.includes(feature))  return 'Business Pilot';
  if (ELIT.includes(feature))     return 'Expert';
  return null;
}

export function planHasFeature(
  planKey: PlanKey | string | null | undefined,
  feature: Feature,
): boolean {
  const key = normalizePlanKey(typeof planKey === 'string' ? planKey : planKey ?? null);
  if (!key) return false;
  return PLAN_FEATURES[key]?.includes(feature) ?? false;
}

export function planMaxStores(planKey: PlanKey | string | null | undefined): number {
  const key = normalizePlanKey(typeof planKey === 'string' ? planKey : planKey ?? null);
  return key ? PLAN_MAX_STORES[key] : 1;
}

export function planMaxMembers(planKey: PlanKey | string | null | undefined): number {
  const key = normalizePlanKey(typeof planKey === 'string' ? planKey : planKey ?? null);
  return key ? PLAN_MAX_MEMBERS[key] : 1;
}

export function featuresForPlan(planKey: PlanKey | string | null | undefined): Feature[] {
  const key = normalizePlanKey(typeof planKey === 'string' ? planKey : planKey ?? null);
  return key ? [...PLAN_FEATURES[key]] : [];
}
