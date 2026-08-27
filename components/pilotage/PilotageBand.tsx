'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Bande de pilotage du dashboard
//
// Rassemble en un seul endroit ce que le marchand doit voir AVANT les
// tableaux : ce qui coûte de l'argent maintenant (alerte taux), où il en est
// (score, objectif, comparaison), et quoi faire (recommandations).
//
// Un seul aller-retour pour les quatre blocs. Chacun se chargeait auparavant
// de son côté : quatre server actions, mises en file par Next.js, refaisant
// chacune l'authentification. Le lot est calculé côté serveur avec
// `Promise.allSettled`, donc un bloc auquel l'offre ne donne pas droit
// n'efface toujours pas les autres — il arrive simplement vide.
//
// Le score de santé n'est PAS affiché ici : le dashboard porte déjà sa propre
// jauge, alimentée par la même source. Deux scores sur un écran, c'est un
// score de moins auquel le marchand fait confiance.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from 'react';
import { MonthComparisonCard } from './MonthComparisonCard';
import { RateAlertBanner } from './RateAlertBanner';
import { MonthlyGoalCard } from '../goals/MonthlyGoalCard';
import { InsightsFeed } from '../insights/InsightsFeed';
import { getPilotageBundle, type PilotageBundle } from '../../app/actions/pilotage';

/**
 * `initial` : le dashboard a besoin du score de santé du même lot pour sa
 * jauge. Il charge donc le lot lui-même et le passe ici, ce qui évite que la
 * bande refasse le trajet pour les mêmes données.
 */
export function PilotageBand({ initial }: { initial?: PilotageBundle | null }) {
  const [data, setData] = useState<PilotageBundle | null>(initial ?? null);

  useEffect(() => {
    if (initial !== undefined) { setData(initial); return; }

    let cancelled = false;
    getPilotageBundle(5)
      .then((res) => { if (!cancelled) setData(res); })
      .catch(() => { /* les blocs restent sur leur état vide */ });
    return () => { cancelled = true; };
  }, [initial]);

  // Tant que le lot n'est pas là, les enfants restent en chargement : on ne
  // leur passe `initial` qu'une fois la réponse arrivée, sinon ils partiraient
  // chercher les données eux-mêmes et on aurait fait le trajet deux fois.
  if (!data) {
    return (
      <section className="space-y-4">
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="h-40 animate-pulse rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950" />
          <div className="h-40 animate-pulse rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950" />
        </div>
        <div className="h-32 animate-pulse rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950" />
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <RateAlertBanner initial={data.rateAlert} />

      <div className="grid gap-4 lg:grid-cols-2">
        <MonthlyGoalCard metric="revenue" initial={data.goals} />
        <MonthComparisonCard initial={data.comparison} />
      </div>

      <InsightsFeed limit={5} initial={data.insights} />
    </section>
  );
}
