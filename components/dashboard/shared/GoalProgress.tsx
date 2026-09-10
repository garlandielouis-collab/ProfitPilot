'use client';

// ─────────────────────────────────────────────────────────────────────────────
// L'objectif — §21 (Kwasans) et §38 (Elit)
//
// Le §21 demande : objectif, réalisé, pourcentage, barre de progression, et un
// bouton « Set goal ». Le §38 ajoute une quatrième colonne : la PRÉVISION —
// « Current / Target / Progress / Forecast ».
//
// La barre ne se colore pas en rouge quand on est en retard. Un objectif est un
// cap, pas une faute : le retard se dit dans la phrase (« il reste 9 jours,
// à ce rythme… »), là où on peut encore agir dessus. Le rouge est réservé à ce
// qui coûte de l'argent maintenant (§4.2 de la constitution).
// ─────────────────────────────────────────────────────────────────────────────

import Link from 'next/link';
import { Card, Money } from '../../ds';
import { cn } from '../../../lib/utils';

export type GoalRow = {
  id: string;
  label: string;
  current: number;
  target: number;
  currency?: string;
  /** Vrai si le rythme actuel projette une atteinte de l'objectif. */
  onTrack?: boolean;
  /** La projection de fin de période (§38). `null` quand on ne sait pas. */
  forecast?: number | null;
  /** Une phrase : « il reste 9 jours, 32 000 HTG par jour ». */
  hint?: string;
};

export function GoalProgress({
  goals,
  emptyLabel,
  emptyAction,
  emptyHref = '/rapports',
  forecastLabel,
  loading = false,
}: {
  goals: GoalRow[];
  emptyLabel: string;
  emptyAction: string;
  emptyHref?: string;
  /** « Prévision » — l'intitulé de la quatrième colonne du §38. */
  forecastLabel?: string;
  loading?: boolean;
}) {
  if (loading) {
    return (
      <Card className="space-y-4 p-4" aria-hidden>
        <span className="pp-skeleton block h-5 w-40 rounded-control" />
        <span className="pp-skeleton block h-3 rounded-pill" />
      </Card>
    );
  }

  if (goals.length === 0) {
    return (
      <Card className="px-4 py-8 text-center">
        <p className="text-body text-text2 dark:text-dark-text2">{emptyLabel}</p>
        <Link
          href={emptyHref}
          className="pressable mt-2 inline-flex min-h-touch items-center text-body font-bold text-primary underline underline-offset-4 dark:text-dark-text"
        >
          {emptyAction}
        </Link>
      </Card>
    );
  }

  return (
    <Card>
      <ul className="divide-y divide-border dark:divide-dark-border">
        {goals.map((goal) => {
          const pct = goal.target > 0 ? Math.round((goal.current / goal.target) * 100) : 0;
          return (
            <li key={goal.id} className="space-y-2 p-4">
              <div className="flex items-baseline justify-between gap-4">
                <span className="min-w-0 truncate text-body text-text2 dark:text-dark-text2">
                  {goal.label}
                </span>
                <span className="amount flex-shrink-0 text-body font-bold text-primary dark:text-dark-text">
                  {pct} %
                </span>
              </div>

              <div className="flex items-baseline gap-2">
                <Money value={goal.current} currency={goal.currency ?? 'HTG'} size="card" />
                <span className="text-note text-muted dark:text-dark-muted">/</span>
                <Money
                  value={goal.target}
                  currency={goal.currency ?? 'HTG'}
                  size="note"
                  tone="muted"
                />
              </div>

              <span
                className="block h-2 overflow-hidden rounded-pill bg-surface2 dark:bg-dark-surface2"
                role="progressbar"
                aria-valuenow={Math.min(pct, 100)}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={goal.label}
              >
                <span
                  className={cn(
                    'block h-full rounded-pill transition-[width] duration-moment ease-pp',
                    goal.onTrack === false ? 'bg-primary/60 dark:bg-dark-text2' : 'bg-accent',
                  )}
                  style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
                />
              </span>

              {(goal.hint || (forecastLabel && goal.forecast != null)) && (
                <p className="text-note text-muted dark:text-dark-muted">
                  {goal.hint}
                  {forecastLabel && goal.forecast != null && (
                    <>
                      {goal.hint ? ' · ' : ''}
                      {forecastLabel}{' '}
                      <Money
                        value={goal.forecast}
                        currency={goal.currency ?? 'HTG'}
                        size="note"
                        tone="muted"
                      />
                    </>
                  )}
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
