import { normalizePlanKey, type PlanKey } from './plans';

// ─────────────────────────────────────────────────────────────────────────────
// Feature flags par offre — Esansyel / Kwasans / Elit
//
// Une feature = une capacité produit vendable, telle qu'elle est présentée au
// téléphone. Le gating se fait toujours via `planHasFeature()` (client) ou
// `assertFeature()` côté serveur — jamais en dur dans les composants.
//
// ── Les trois stades ────────────────────────────────────────────────────────
//
//   Esansyel · « Kite kaye a »            remplacer le cahier, ne plus rien perdre
//   Kwasans  · « Konprann pou grandi »    transformer les chiffres en décisions
//   Elit     · « Dirije tankou yon patron » déléguer, se multiplier, prévoir
//
// ── Ce qui ne se verrouille JAMAIS ──────────────────────────────────────────
//
// Enregistrer une vente, une dépense ou une créance ; travailler hors ligne ;
// séparer l'argent de la maison de celui du commerce ; exporter ses propres
// données. Ces capacités sont dans le socle des trois offres. Une limite posée
// là ne ferait pas monter le marchand d'une offre : elle le renverrait au
// cahier, et le produit serait mort le lendemain.
// ─────────────────────────────────────────────────────────────────────────────

export type Feature =
  // ── Socle (Esansyel) — le cahier, en mieux ──
  | 'quick_sale'
  | 'offline_mode'
  | 'sale_discount'
  | 'whatsapp_receipt'
  | 'manual_fx_sale'
  | 'expense_scopes'
  | 'receivables'
  | 'customer_credit_history'
  | 'basic_dashboard'
  | 'low_stock_badge'
  | 'data_export'
  | 'ai_taster'
  // ── Croissance (Kwasans) — comprendre pour grandir ──
  | 'unlimited_products'
  | 'fx_rate_of_day'
  | 'rate_alerts'
  | 'branded_receipt'
  | 'margin_calculator'
  | 'price_simulator'
  | 'low_stock_alerts'
  | 'stock_count'
  | 'custom_expense_categories'
  | 'recurring_expenses'
  | 'receipt_photo'
  | 'receivable_reminders'
  | 'credit_limit'
  | 'product_profitability'
  | 'monthly_reports'
  | 'month_comparison'
  | 'health_score'
  | 'report_export'
  | 'weekly_whatsapp_report'
  | 'monthly_goals'
  | 'ai_assistant'
  | 'advanced_reports'
  | 'advanced_dashboard'
  | 'online_store'
  | 'employees'
  | 'activity_log'
  // ── Élite (Elit) — diriger comme un patron ──
  | 'multi_stores'
  | 'multi_user_roles'
  | 'activity_log_full'
  | 'auto_reminders'
  | 'customer_reliability_score'
  | 'restock_suggestions'
  | 'multi_store_reports'
  | 'ai_unlimited'
  | 'ai_forecast'
  | 'ai_price_recommendations'
  | 'ai_daily_digest'
  | 'credit_export'
  | 'auto_recommendations'
  | 'priority_support'
  | 'advanced_analytics'
  | 'automation'
  | 'api_access';

/**
 * Esansyel — le socle. Tout ce qui remplace le cahier papier pour UN marchand,
 * UNE boutique. Complet, sinon il ne monte pas d'un cran : il redescend au
 * cahier.
 */
const ESANSYEL: Feature[] = [
  'quick_sale',
  'offline_mode',
  // Le marchandage est la norme au marché : sans remise, les chiffres saisis
  // seraient faux, et un chiffre faux vaut moins qu'un cahier.
  'sale_discount',
  'whatsapp_receipt',
  // Un client paie 20 USD. S'il ne peut pas l'inscrire, la vente sort du
  // système : c'est une limite sur l'intégrité comptable déguisée en limite de
  // fonctionnalité. Ce qui se paie, c'est le taux du jour — pas le droit
  // d'inscrire la somme reçue.
  'manual_fx_sale',
  'expense_scopes',
  // Le cahier de crédit est souvent la vraie raison d'installer l'application :
  // liste, montants, marquer payé, remboursement partiel — complet dès ici.
  'receivables',
  'customer_credit_history',
  'basic_dashboard',
  // Voir « stock bas » en ouvrant la fiche est gratuit ; être prévenu sans
  // avoir rien demandé est le service qui se paie (`low_stock_alerts`).
  'low_stock_badge',
  // Ses chiffres lui appartiennent : l'export survit même à la résiliation.
  'data_export',
  // L'IA se dose par quota, jamais par interdiction — trois questions offertes
  // valent mieux qu'une porte fermée : personne n'achète une fonction qu'il n'a
  // jamais vue tourner sur ses propres chiffres.
  'ai_taster',
];

/** Kwasans = Esansyel + les chiffres deviennent des décisions. */
const KWASANS: Feature[] = [
  ...ESANSYEL,
  'unlimited_products',
  'fx_rate_of_day',
  'rate_alerts',
  'branded_receipt',
  // Il achète en dollars et vend en gourdes sans savoir ce qui lui reste :
  // c'est la promesse même de Kwasans, donc pas avant.
  'margin_calculator',
  'price_simulator',
  'low_stock_alerts',
  'stock_count',
  'custom_expense_categories',
  'recurring_expenses',
  // Second poste, après l'IA, à coûter de l'argent réel par marchand : il se
  // dose comme elle. Le montant, lui, reste saisissable partout.
  'receipt_photo',
  // Réclamer sans se fâcher : la fonction la plus rentable de l'offre, elle
  // ramène de l'argent le jour même.
  'receivable_reminders',
  'credit_limit',
  'product_profitability',
  'monthly_reports',
  'month_comparison',
  'health_score',
  'report_export',
  'weekly_whatsapp_report',
  'monthly_goals',
  'ai_assistant',
  'advanced_reports',
  'advanced_dashboard',
  'online_store',
  // Trois personnes sur le compte : le couple, le petit frère du samedi. Les
  // rôles et les permissions, eux, attendent Elit.
  'employees',
  'activity_log',
];

/** Elit = Kwasans + déléguer, se multiplier, prévoir. */
const ELIT: Feature[] = [
  ...KWASANS,
  // Kwasans plafonne à une boutique (PLAN_MAX_STORES) : le multi-boutique
  // n'existe qu'ici, sans quoi le drapeau contredirait le quota.
  'multi_stores',
  'multi_user_roles',
  'activity_log_full',
  'auto_reminders',
  'customer_reliability_score',
  'restock_suggestions',
  'multi_store_reports',
  'ai_unlimited',
  'ai_forecast',
  'ai_price_recommendations',
  'ai_daily_digest',
  'credit_export',
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

/** `Infinity` = pas de plafond. `formatQuota()` l'écrit « illimité ». */
export const UNLIMITED = Infinity;

/** Nombre maximum d'entreprises/boutiques détenues par offre. */
export const PLAN_MAX_STORES: Record<PlanKey, number> = {
  'Ti Machann':     1,
  'Business Pilot': 1,
  // Trois, comme annoncé sur la page de prix. Au-delà, la relation devient
  // commerciale et se négocie de vive voix.
  'Expert':         3,
};

/** Nombre maximum de membres actifs (propriétaire inclus) par offre. */
export const PLAN_MAX_MEMBERS: Record<PlanKey, number> = {
  'Ti Machann':     1,
  'Business Pilot': 3,
  'Expert':         UNLIMITED,
};

/**
 * Fiches produits actives par offre. Un produit archivé ne compte plus : c'est
 * la sortie gratuite du 51ᵉ produit, et une limite sans sortie serait un mur.
 */
export const PLAN_MAX_PRODUCTS: Record<PlanKey, number> = {
  'Ti Machann':     50,
  'Business Pilot': UNLIMITED,
  'Expert':         UNLIMITED,
};

/** Questions à l'assistant IA, par mois. Chaque question coûte de l'argent. */
export const PLAN_AI_QUESTIONS: Record<PlanKey, number> = {
  'Ti Machann':     0,
  'Business Pilot': 30,
  'Expert':         UNLIMITED,
};

/** Questions offertes une seule fois, à la découverte (Esansyel). */
export const PLAN_AI_TASTER: Record<PlanKey, number> = {
  'Ti Machann':     3,
  'Business Pilot': 0,
  'Expert':         0,
};

/**
 * Profondeur des rapports, en mois.
 *
 * Elle limite l'ANALYSE, jamais la conservation : les listes de ventes, de
 * dépenses et de créances restent consultables sur toute la durée, et
 * `data_export` sort l'intégralité dans les trois offres.
 */
export const PLAN_HISTORY_MONTHS: Record<PlanKey, number> = {
  'Ti Machann':     3,
  'Business Pilot': 12,
  'Expert':         UNLIMITED,
};

/** Un quota, écrit pour un marchand : un nombre, ou « illimité ». */
export function formatQuota(value: number): string {
  return Number.isFinite(value) ? value.toLocaleString('fr-FR') : 'illimité';
}

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

export function planMaxProducts(planKey: PlanKey | string | null | undefined): number {
  const key = normalizePlanKey(typeof planKey === 'string' ? planKey : planKey ?? null);
  return key ? PLAN_MAX_PRODUCTS[key] : PLAN_MAX_PRODUCTS['Ti Machann'];
}

export function planAiQuestions(planKey: PlanKey | string | null | undefined): number {
  const key = normalizePlanKey(typeof planKey === 'string' ? planKey : planKey ?? null);
  return key ? PLAN_AI_QUESTIONS[key] : 0;
}

export function planHistoryMonths(planKey: PlanKey | string | null | undefined): number {
  const key = normalizePlanKey(typeof planKey === 'string' ? planKey : planKey ?? null);
  return key ? PLAN_HISTORY_MONTHS[key] : PLAN_HISTORY_MONTHS['Ti Machann'];
}

export function featuresForPlan(planKey: PlanKey | string | null | undefined): Feature[] {
  const key = normalizePlanKey(typeof planKey === 'string' ? planKey : planKey ?? null);
  return key ? [...PLAN_FEATURES[key]] : [];
}

/**
 * Offres qui incluent la fonctionnalité — utile là où le filtre doit se faire
 * en base (`.in('plan_key', …)`) plutôt qu'en mémoire, sans recopier la liste
 * des offres dans la requête et la laisser diverger du registre.
 */
export function plansWithFeature(feature: Feature): PlanKey[] {
  return (Object.keys(PLAN_FEATURES) as PlanKey[]).filter((key) =>
    PLAN_FEATURES[key].includes(feature),
  );
}
