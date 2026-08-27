'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Bande de pilotage du dashboard
//
// Rassemble en un seul endroit ce que le marchand doit voir AVANT les
// tableaux : ce qui coûte de l'argent maintenant (alerte taux), où il en est
// (score, objectif, comparaison), et quoi faire (recommandations).
//
// Chaque bloc se charge et échoue indépendamment : une offre qui ne donne pas
// droit à la comparaison mensuelle ne doit pas faire disparaître les objectifs.
//
// Le score de santé n'est PAS ici : le dashboard porte déjà sa propre jauge,
// alimentée par la même source (`getHealthScore`). Deux scores sur un écran,
// c'est un score de moins auquel le marchand fait confiance.
// ─────────────────────────────────────────────────────────────────────────────

import { MonthComparisonCard } from './MonthComparisonCard';
import { RateAlertBanner } from './RateAlertBanner';
import { MonthlyGoalCard } from '../goals/MonthlyGoalCard';
import { InsightsFeed } from '../insights/InsightsFeed';

export function PilotageBand() {
  return (
    <section className="space-y-4">
      <RateAlertBanner />

      <div className="grid gap-4 lg:grid-cols-2">
        <MonthlyGoalCard metric="revenue" />
        <MonthComparisonCard />
      </div>

      <InsightsFeed limit={5} />
    </section>
  );
}
