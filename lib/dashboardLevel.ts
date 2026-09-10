// ─────────────────────────────────────────────────────────────────────────────
// Le niveau de tableau de bord — §57 du document « Dashboards par plan »
//
// « Le plan doit déterminer : dashboard level, available widgets, available
//   analytics, available AI features, available actions. »
//
// Ce fichier est le SEUL endroit qui traduit une offre en niveau. Aucun
// composant ne compare une clé d'offre en dur : il demande son niveau, ou il
// demande si un module lui est ouvert. Sans quoi, renommer une offre casserait
// vingt fichiers — c'est exactement l'erreur que `planFeatures.ts` avait déjà
// évitée pour les fonctionnalités.
//
// ── Trois niveaux, trois questions ──────────────────────────────────────────
//
//   basic     « Que se passe-t-il ? »            comprendre    (Esansyel)
//   advanced  « Pourquoi, et que dois-je gérer ? » piloter     (Kwasans)
//   executive « Où dois-je emmener mon commerce ? » décider    (Elit)
//
// ── Un module s'ouvre à TROIS conditions (§42 + §52) ────────────────────────
//
//   1. l'offre le couvre                    (§57 — le plan)
//   2. le rôle a le droit de le lire        (§52 — « Plan + Permission »)
//   3. l'entreprise a de quoi le remplir    (§42 — « dashboard adaptatif »)
//
// La troisième est la moins évidente et la plus importante : un bloc « Équipe »
// sur un compte sans employé n'est pas une fonctionnalité, c'est un reproche.
// ─────────────────────────────────────────────────────────────────────────────

import { normalizePlanKey, type PlanKey } from './plans';
import type { Feature } from './planFeatures';
import type { Permission } from './rbac';

export type DashboardLevel = 'basic' | 'advanced' | 'executive';

const LEVEL_BY_PLAN: Record<PlanKey, DashboardLevel> = {
  'Ti Machann':     'basic',
  'Business Pilot': 'advanced',
  'Expert':         'executive',
};

/** Le niveau de tableau de bord d'une offre. Repli : le socle. */
export function dashboardLevel(planKey: PlanKey | string | null | undefined): DashboardLevel {
  const key = normalizePlanKey(typeof planKey === 'string' ? planKey : planKey ?? null);
  return key ? LEVEL_BY_PLAN[key] : 'basic';
}

const ORDER: Record<DashboardLevel, number> = { basic: 0, advanced: 1, executive: 2 };

/** `true` si le niveau atteint au moins celui demandé. */
export function levelAtLeast(level: DashboardLevel, minimum: DashboardLevel): boolean {
  return ORDER[level] >= ORDER[minimum];
}

// ─────────────────────────────────────────────────────────────────────────────
// Le registre des modules
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Un module = une section du tableau de bord. Le nom est celui du document,
 * pour qu'on puisse relire les 61 points en tenant le code à côté.
 */
export type DashboardModule =
  // ── Socle, les trois offres ──
  | 'kpi'                 // §5 §14 §27
  | 'sales_chart'         // §6 §15 §30
  | 'quick_actions'       // §7 §23
  | 'attention'           // §8 §29
  | 'top_products'        // §9 §17 §35
  | 'pilot_insight'       // §10 §22 §39
  // ── Kwasans ──
  | 'business_health'     // §16 §28
  | 'goals'               // §21 §38
  | 'inventory_intel'     // §18 §34
  | 'customer_insights'   // §19 §33
  | 'team'                // §20 §37
  | 'performance_compare' // §15
  // ── Elit ──
  | 'executive_summary'   // §27
  | 'financial_center'    // §30
  | 'forecast'            // §31
  | 'opportunities'       // §32
  | 'online_store'        // §36
  | 'daily_brief'         // §40
  | 'ledger';             // les mouvements — le détail, jamais en tête

/** Ce qu'un module exige pour exister. */
type ModuleRule = {
  /** Niveau minimum. */
  level: DashboardLevel;
  /** Permission RBAC de lecture (§52). `undefined` = aucune. */
  permission?: Permission;
  /** Capacité d'offre supplémentaire, quand elle est plus fine que le niveau. */
  feature?: Feature;
};

const MODULES: Record<DashboardModule, ModuleRule> = {
  // Les chiffres du commerce sont des chiffres financiers : un caissier n'y a
  // pas accès, même sur une offre Elit. C'est tout le sens du §52.
  kpi:                 { level: 'basic',     permission: 'reports:read' },
  sales_chart:         { level: 'basic',     permission: 'reports:read' },
  // Enregistrer une vente ne demande aucune offre et aucun droit de lecture
  // financière : c'est le socle du produit.
  quick_actions:       { level: 'basic' },
  attention:           { level: 'basic' },
  // Le §9 fixe les colonnes : Produit · Unités · Revenue. La troisième est un
  // chiffre financier — d'où la double condition. Un caissier a bien
  // `products:read`, mais pas le droit de lire ce que la boutique encaisse.
  top_products:        { level: 'basic',     permission: 'reports:read' },
  pilot_insight:       { level: 'basic' },

  business_health:     { level: 'advanced',  permission: 'reports:read', feature: 'health_score' },
  goals:               { level: 'advanced',  permission: 'reports:read', feature: 'monthly_goals' },
  inventory_intel:     { level: 'advanced',  permission: 'inventory:read' },
  customer_insights:   { level: 'advanced',  permission: 'clients:read' },
  team:                { level: 'advanced',  permission: 'employees:read', feature: 'employees' },
  performance_compare: { level: 'advanced',  permission: 'reports:read', feature: 'month_comparison' },

  executive_summary:   { level: 'executive', permission: 'reports:read' },
  financial_center:    { level: 'executive', permission: 'reports:read' },
  forecast:            { level: 'executive', permission: 'reports:read', feature: 'ai_forecast' },
  opportunities:       { level: 'executive' },
  online_store:        { level: 'executive', feature: 'online_store' },
  daily_brief:         { level: 'executive' },
  ledger:              { level: 'basic',     permission: 'reports:read' },
};

export type ModuleContext = {
  level: DashboardLevel;
  can:    (permission: Permission) => boolean;
  canUse: (feature: Feature) => boolean;
};

/**
 * Le module est-il ouvert à cet utilisateur ? Offre ET permission ET capacité.
 *
 * Ne répond PAS à « y a-t-il des données » : cette troisième condition dépend
 * de la réponse serveur, elle se vérifie donc au moment du rendu, avec
 * `<ModuleSection empty={…}>` qui affiche « pas encore assez de données »
 * plutôt que de faire disparaître la section (§42, §43).
 */
export function moduleEnabled(module: DashboardModule, ctx: ModuleContext): boolean {
  const rule = MODULES[module];
  if (!levelAtLeast(ctx.level, rule.level)) return false;
  if (rule.permission && !ctx.can(rule.permission)) return false;
  if (rule.feature && !ctx.canUse(rule.feature)) return false;
  return true;
}

/** La liste des modules ouverts — sert au serveur pour ne lire que l'utile. */
export function enabledModules(ctx: ModuleContext): DashboardModule[] {
  return (Object.keys(MODULES) as DashboardModule[]).filter((m) => moduleEnabled(m, ctx));
}

/**
 * La profondeur du langage de PilotAI (§58).
 *
 * « Ne pas simplement donner plus de texte. Donner plus de profondeur
 *   décisionnelle. » D'où trois registres, et non trois longueurs :
 *
 *   observation  « Vos ventes augmentent. »
 *   advice       « Votre stock du produit X pourrait être insuffisant. »
 *   strategy     « Votre croissance vient de X, mais la marge perd 3 points… »
 */
export type AiDepth = 'observation' | 'advice' | 'strategy';

export function aiDepth(level: DashboardLevel): AiDepth {
  if (level === 'executive') return 'strategy';
  if (level === 'advanced')  return 'advice';
  return 'observation';
}
