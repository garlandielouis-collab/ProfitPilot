'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Les recommandations — quatre fonds pastel de moins (§4.1)
//
// Avant : chaque ligne portait son propre fond coloré, sa bordure teintée, sa
// pastille et son émoji. Quatre couleurs de plus sur un écran qui en comptait
// déjà cinq, et un style d'icônes (émoji) mélangé aux icônes de trait du reste
// de l'application (§3.5).
//
// Après : une carte, des lignes séparées par un filet, et un point de couleur
// SYSTÈME en tête de ligne — rouge quand ça coûte de l'argent, ambre quand une
// échéance approche, vert quand un objectif est tenu. Le reste est en marine.
// Trois couleurs sur l'écran, chacune avec un sens.
// ─────────────────────────────────────────────────────────────────────────────

import Link from 'next/link';
import { Card } from '../ds';
import { cn } from '../../lib/utils';

export type InsightTone = 'success' | 'warning' | 'info' | 'danger';

export type Insight = {
  tone: InsightTone;
  text: string;
  /** Le libellé nomme l'action, il ne répète pas le texte (§4.5). */
  action?: string;
  href?: string;
};

const DOT: Record<InsightTone, string> = {
  success: 'bg-success',
  warning: 'bg-warning',
  danger:  'bg-danger',
  // L'information neutre ne mérite pas une couleur : elle prend le gris.
  info:    'bg-muted',
};

export function InsightsCard({
  insights,
  loading,
  title,
}: {
  insights: Insight[];
  loading: boolean;
  title: string;
}) {
  return (
    <Card className="p-4">
      <p className="text-note font-bold uppercase tracking-wide text-muted dark:text-dark-muted">
        {title}
      </p>

      {loading ? (
        <div className="mt-4 space-y-3" aria-hidden>
          {[0, 1, 2].map((i) => (
            <span key={i} className="pp-skeleton block h-10 rounded-control" />
          ))}
        </div>
      ) : (
        <ul className="mt-2 divide-y divide-border dark:divide-dark-border">
          {insights.map((insight, i) => (
            <li key={i} className="flex gap-3 py-3">
              <span
                className={cn('mt-2 h-2 w-2 flex-shrink-0 rounded-pill', DOT[insight.tone])}
                aria-hidden
              />
              <div className="min-w-0">
                <p className="text-body text-text2 dark:text-dark-text2">{insight.text}</p>
                {insight.action && insight.href && (
                  <Link
                    href={insight.href}
                    className="pressable mt-1 inline-flex min-h-touch items-center text-note font-bold text-primary underline underline-offset-4 dark:text-dark-text"
                  >
                    {insight.action}
                  </Link>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
