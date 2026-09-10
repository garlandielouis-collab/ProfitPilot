'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Le centre d'attention — §8 (Esansyel) et §29 (Elit)
//
// « Afficher uniquement les problèmes importants. Chaque alerte doit être
//   actionnable. » Et, pour Elit : « Ne jamais afficher 10 alertes. Maximum
//   3 priorités. »
//
// Une alerte sans bouton n'est pas une alerte, c'est un reproche. Chaque ligne
// porte donc son action et son lien — la ligne entière est cliquable, et le
// bouton « Voir » nomme la destination plutôt que de répéter le problème.
//
// §48 — le symbole porte l'état autant que la couleur : ⚠ pour ce qui menace,
// ↑ pour ce qui pousse, ● pour ce qui est critique, ✓ quand tout va bien. Le
// document écrit lui-même « ✓ Aucun autre problème urgent ».
// ─────────────────────────────────────────────────────────────────────────────

import Link from 'next/link';
import { Card } from '../../ds';
import { cn } from '../../../lib/utils';

export type AlertTone = 'danger' | 'warning' | 'success' | 'info';

export type AlertItem = {
  id: string;
  tone: AlertTone;
  /** Ce qui se passe. Une ligne, pas un paragraphe. */
  text: string;
  /** Le libellé de l'action. « Voir », « Relancer », « Réapprovisionner ». */
  action?: string;
  href?: string;
};

const MARK: Record<AlertTone, string> = {
  danger: '●', warning: '⚠', success: '✓', info: '↑',
};

const MARK_CLASS: Record<AlertTone, string> = {
  danger:  'text-danger',
  warning: 'text-warning',
  success: 'text-success',
  info:    'text-muted',
};

export function AlertCard({
  items,
  /** Ce qui s'affiche quand il n'y a rien à signaler — le §8 le veut positif. */
  allClearLabel,
  loading = false,
}: {
  items: AlertItem[];
  allClearLabel: string;
  loading?: boolean;
}) {
  if (loading) {
    return (
      <Card className="space-y-3 p-4" aria-hidden>
        {[0, 1].map((i) => <span key={i} className="pp-skeleton block h-10 rounded-control" />)}
      </Card>
    );
  }

  if (items.length === 0) {
    return (
      <Card className="flex items-center gap-3 p-4">
        <span className="text-success" aria-hidden>{MARK.success}</span>
        <p className="text-body text-text2 dark:text-dark-text2">{allClearLabel}</p>
      </Card>
    );
  }

  return (
    <Card>
      <ul className="divide-y divide-border dark:divide-dark-border">
        {items.map((item) => {
          const row = (
            <div className="flex min-h-touch items-center gap-3 px-4 py-3">
              <span className={cn('flex-shrink-0 font-bold', MARK_CLASS[item.tone])} aria-hidden>
                {MARK[item.tone]}
              </span>
              <p className="min-w-0 flex-1 text-body text-text2 dark:text-dark-text2">{item.text}</p>
              {item.action && (
                <span className="flex-shrink-0 text-note font-bold text-primary underline underline-offset-4 dark:text-dark-text">
                  {item.action}
                </span>
              )}
            </div>
          );

          return (
            <li key={item.id}>
              {item.href
                ? <Link href={item.href} className="pressable block">{row}</Link>
                : row}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
