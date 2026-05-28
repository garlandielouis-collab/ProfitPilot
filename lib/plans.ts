export type PlanKey = 'Ti Machann' | 'Business Pilot' | 'Expert';

export type Plan = {
  key: PlanKey;
  priceG: number;
  priceUsd: number;
  description: string;
  features: string[];
  highlight: string;
  popular?: boolean;
};

export const USD_RATE = 0.012;

export const PLANS: Plan[] = [
  {
    key: 'Ti Machann',
    priceG: 1000,
    priceUsd: 1000 * USD_RATE,
    description: 'Démarrage léger avec gestion des ventes et inventaire.',
    features: ['Ventes en temps réel', 'Suivi des stocks', 'Support de base'],
    highlight: 'Petit commerce',
  },
  {
    key: 'Business Pilot',
    priceG: 2500,
    priceUsd: 2500 * USD_RATE,
    description: 'Pilotez votre business avec rapports avancés et équipe.',
    features: ['Tout Ti Machann', "Dashboard avancé", "Gestion d'équipe", 'Rapports détaillés'],
    highlight: 'Populaire',
    popular: true,
  },
  {
    key: 'Expert',
    priceG: 7500,
    priceUsd: 7500 * USD_RATE,
    description: 'La solution complète avec support premium et automatisation.',
    features: ['Tout Business Pilot', 'Support prioritaire', 'Analyses avancées', 'Automatisation'],
    highlight: 'Premium',
  },
];

export function getPlanByKey(key: string): Plan | undefined {
  return PLANS.find((p) => p.key === key);
}
