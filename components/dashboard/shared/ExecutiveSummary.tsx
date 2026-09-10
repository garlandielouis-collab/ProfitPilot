'use client';

// ─────────────────────────────────────────────────────────────────────────────
// « Business at a glance » — §27, et le Daily Brief du §40
//
// Deux composants, une même intention : donner l'état du commerce en quelques
// secondes.
//
//   ExecutiveSummary  §27 · six indicateurs au plus, « seulement ceux
//                     réellement utiles ». Une carte à lignes, pas six cartes :
//                     six cartes en tête d'écran, c'est déjà la grille de vingt
//                     que le §3 interdit.
//   DailyBrief        §40 · cinq lignes de deux mots. « Le propriétaire doit
//                     pouvoir comprendre l'état du business en 15 secondes. »
//
// Le §44 est la raison d'être de ce fichier : « Elit doit afficher plus
// d'informations grâce à la progressive disclosure », pas grâce à la densité.
// Ce bloc est le niveau 1 ; tout le reste de l'écran en est le drill-down.
// ─────────────────────────────────────────────────────────────────────────────

import Link from 'next/link';
import { Card, Money } from '../../ds';
import { cn } from '../../../lib/utils';
import { DeltaPill } from './KpiCard';
import type { BriefLine } from '../narrative';

export type SummaryItem = {
  key: string;
  label: string;
  value: number;
  unit?: 'money' | 'count' | 'percent';
  currency?: string;
  deltaPercent?: number | null;
  href?: string;
};

export function ExecutiveSummary({
  items,
  loading = false,
}: {
  items: SummaryItem[];
  loading?: boolean;
}) {
  if (loading) {
    return (
      <Card className="divide-y divide-border p-0 dark:divide-dark-border" aria-hidden>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex items-center justify-between gap-4 px-4 py-3">
            <span className="pp-skeleton block h-4 w-24 rounded-control" />
            <span className="pp-skeleton block h-5 w-28 rounded-control" />
          </div>
        ))}
      </Card>
    );
  }

  return (
    <Card>
      <ul className="divide-y divide-border dark:divide-dark-border">
        {items.map((item) => {
          const row = (
            <div className="flex min-h-touch items-center justify-between gap-4 px-4 py-3">
              <span className="min-w-0 truncate text-body text-text2 dark:text-dark-text2">
                {item.label}
              </span>
              <span className="flex flex-shrink-0 items-center gap-2">
                {item.deltaPercent != null && <DeltaPill percent={item.deltaPercent} />}
                {item.unit === 'count' ? (
                  <span className="amount text-body font-semibold text-primary dark:text-dark-text">
                    {new Intl.NumberFormat('fr-HT').format(Math.round(item.value))}
                  </span>
                ) : item.unit === 'percent' ? (
                  <span className="amount text-body font-semibold text-primary dark:text-dark-text">
                    {item.value.toFixed(1)} %
                  </span>
                ) : (
                  <Money value={item.value} currency={item.currency ?? 'HTG'} size="body" />
                )}
              </span>
            </div>
          );
          return (
            <li key={item.key}>
              {item.href ? <Link href={item.href} className="pressable block">{row}</Link> : row}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

const TONE_MARK: Record<BriefLine['tone'], string> = {
  neutral: '·', success: '✓', warning: '⚠', danger: '●',
};

const TONE_CLASS: Record<BriefLine['tone'], string> = {
  neutral: 'text-muted',
  success: 'text-success',
  warning: 'text-warning',
  danger:  'text-danger',
};

/**
 * Le brief du jour. Une rangée de pastilles qui défile horizontalement sur
 * mobile — une seule direction de défilement (§5.3 de la constitution).
 */
export function DailyBrief({ lines, loading = false }: { lines: BriefLine[]; loading?: boolean }) {
  if (loading) {
    return <span className="pp-skeleton block h-10 rounded-surface" aria-hidden />;
  }
  if (lines.length === 0) return null;

  return (
    <div className="scrollbar-none flex gap-2 overflow-x-auto pb-1">
      {lines.map((line) => (
        <span
          key={line.id}
          className="inline-flex flex-shrink-0 items-center gap-2 rounded-pill border border-border bg-white px-3 py-2 text-note dark:border-dark-border dark:bg-dark-surface"
        >
          <span className={cn('font-bold', TONE_CLASS[line.tone])} aria-hidden>
            {TONE_MARK[line.tone]}
          </span>
          <span className="text-muted dark:text-dark-muted">{line.label}</span>
          <span className="amount font-bold text-primary dark:text-dark-text">{line.value}</span>
        </span>
      ))}
    </div>
  );
}
