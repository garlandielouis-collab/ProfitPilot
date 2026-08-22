// ─────────────────────────────────────────────────────────────────────────────
// Offres ProfitPilot — Esansyel (1 000 HTG) / Kwasans (2 500) / Elit (7 500)
//
// Les clés techniques ('Ti Machann' | 'Business Pilot' | 'Expert') restent
// celles stockées en base (subscriptions.plan_key, plans.key) pour ne rien
// casser. Les noms commerciaux du document de vente sont exposés comme
// libellés + acceptés en alias par `normalizePlanKey()`.
// ─────────────────────────────────────────────────────────────────────────────

export type PlanKey = 'Ti Machann' | 'Business Pilot' | 'Expert';

/** Nom commercial affiché au marchand (créole). */
export type PlanLabel = 'Esansyel' | 'Kwasans' | 'Elit';

export type Plan = {
  key: PlanKey;
  /** Nom commercial affiché (Esansyel / Kwasans / Elit). */
  label: PlanLabel;
  priceG: number;
  priceUsd: number;
  description: string;
  /** Profil de marchand ciblé, repris du script de vente. */
  audience: string;
  features: string[];
  highlight: string;
  popular?: boolean;
};

export const USD_RATE = 0.012;

export const PLANS: Plan[] = [
  {
    key: 'Ti Machann',
    label: 'Esansyel',
    priceG: 1000,
    priceUsd: 1000 * USD_RATE,
    description: 'Sortir du cahier papier et voir enfin ses chiffres.',
    audience: 'Marchand qui démarre son suivi',
    features: [
      'Vente enregistrée en 10 secondes',
      'Calculateur de marge (achat + frais)',
      'Tableau de bord simple',
      'Dépenses business / personnel',
      'Mode hors-ligne',
    ],
    highlight: 'Petit commerce',
  },
  {
    key: 'Business Pilot',
    label: 'Kwasans',
    priceG: 2500,
    priceUsd: 2500 * USD_RATE,
    description: 'Structurer une activité régulière et la faire grandir.',
    audience: 'Marchand avec une activité régulière',
    features: [
      'Tout Esansyel',
      'Registre de créances + relances',
      'Classement des produits par rentabilité',
      'Objectifs mensuels et comparaison mois/mois',
      'Rapport hebdomadaire WhatsApp',
      'Alerte taux de change',
    ],
    highlight: 'Populaire',
    popular: true,
  },
  {
    key: 'Expert',
    label: 'Elit',
    priceG: 7500,
    priceUsd: 7500 * USD_RATE,
    description: 'Déléguer, piloter et aller chercher du financement.',
    audience: 'Marchand prêt à déléguer et à financer sa croissance',
    features: [
      'Tout Kwasans',
      'Accès multi-utilisateurs avec rôles',
      'Export prêt pour crédit / microfinance',
      'Score de santé financière complet',
      'Recommandations automatiques avancées',
      'Support prioritaire',
    ],
    highlight: 'Premium',
  },
];

/** Clé technique → nom commercial. */
export const PLAN_LABELS: Record<PlanKey, PlanLabel> = {
  'Ti Machann':     'Esansyel',
  'Business Pilot': 'Kwasans',
  'Expert':         'Elit',
};

/** Alias acceptés (noms commerciaux, anciens noms, casse libre). */
const PLAN_ALIASES: Record<string, PlanKey> = {
  'ti machann':     'Ti Machann',
  'esansyel':       'Ti Machann',
  'essentiel':      'Ti Machann',
  'business pilot': 'Business Pilot',
  'kwasans':        'Business Pilot',
  'croissance':     'Business Pilot',
  'expert':         'Expert',
  'elit':           'Expert',
  'elite':          'Expert',
};

/**
 * Normalise n'importe quelle écriture d'offre vers la clé stockée en base.
 * Retourne `null` si la valeur est vide ou inconnue (= pas d'abonnement).
 */
export function normalizePlanKey(value: string | null | undefined): PlanKey | null {
  if (!value) return null;
  return PLAN_ALIASES[value.trim().toLowerCase()] ?? null;
}

export function getPlanByKey(key: string): Plan | undefined {
  const normalized = normalizePlanKey(key);
  return normalized ? PLANS.find((p) => p.key === normalized) : undefined;
}

/** Libellé commercial à afficher, avec repli propre si le plan est inconnu. */
export function getPlanLabel(key: string | null | undefined): string {
  const normalized = normalizePlanKey(key);
  return normalized ? PLAN_LABELS[normalized] : 'Essai gratuit';
}
