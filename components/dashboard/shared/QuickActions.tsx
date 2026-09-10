'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Les actions rapides — §7 (Esansyel) et §23 (Kwasans)
//
// §7  : Nouvelle vente · Ajouter produit · Ajouter dépense · Ajouter client ·
//       Ajouter fournisseur
// §23 : « Les actions rapides peuvent être secondaires » — cinq entrées, mais
//       plus bas dans l'écran, et sans le poids visuel d'Esansyel.
//
// Elit n'en a pas : son écran répond à « où emmener mon commerce », pas à
// « qu'est-ce que je saisis maintenant ». Les gestes de saisie restent, eux,
// dans la barre du bas, sur toutes les offres — un raccourci retiré d'un écran
// n'est pas un raccourci supprimé du produit.
//
// La première action porte l'accent, les autres sont neutres : deux appels du
// même poids n'en font plus aucun (§4.5 de la constitution).
// ─────────────────────────────────────────────────────────────────────────────

import Link from 'next/link';
import type { ReactNode } from 'react';
import { cn } from '../../../lib/utils';

export type QuickAction = {
  key: string;
  label: string;
  href: string;
  icon?: ReactNode;
  /** L'action principale de la rangée. Une seule. */
  primary?: boolean;
};

export function QuickActions({
  actions,
  compact = false,
}: {
  actions: QuickAction[];
  /** Version §23 : plus discrète, parce qu'elle n'est plus le sujet. */
  compact?: boolean;
}) {
  if (actions.length === 0) return null;

  return (
    <div className="scrollbar-none flex gap-2 overflow-x-auto pb-1 sm:flex-wrap sm:overflow-visible">
      {actions.map((action) => (
        <Link
          key={action.key}
          href={action.href}
          className={cn(
            'pressable inline-flex flex-shrink-0 items-center justify-center gap-2 rounded-surface px-4 font-bold',
            'transition-colors duration-press ease-pp',
            compact ? 'min-h-touch text-note' : 'min-h-action text-body',
            action.primary
              ? 'bg-accent text-accent-ink shadow-card hover:bg-accent-h'
              : 'border border-border bg-white text-primary hover:bg-surface dark:border-dark-border dark:bg-dark-surface dark:text-dark-text',
          )}
        >
          {action.icon}
          {action.label}
        </Link>
      ))}
    </div>
  );
}
