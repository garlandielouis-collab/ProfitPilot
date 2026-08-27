// ─────────────────────────────────────────────────────────────────────────────
// Objectifs mensuels — vocabulaire partagé (Diagnostic 7)
//
// Ces valeurs vivent ici plutôt que dans `app/actions/goals.ts` pour deux
// raisons : un fichier `'use server'` ne peut exporter que des fonctions
// asynchrones (Next refuse le build sinon), et ces libellés sont lus par un
// composant client autant que par le serveur.
// ─────────────────────────────────────────────────────────────────────────────

export type GoalMetric = 'revenue' | 'margin' | 'customers' | 'sales_count';

export const GOAL_LABELS: Record<GoalMetric, string> = {
  revenue:     'Chiffre d’affaires',
  margin:      'Marge',
  customers:   'Clients',
  sales_count: 'Nombre de ventes',
};
