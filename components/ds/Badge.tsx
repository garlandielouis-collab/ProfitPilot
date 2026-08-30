// ─────────────────────────────────────────────────────────────────────────────
// Badge — une pastille reprend la taille « mention ». Zéro style nouveau (§2.4).
//
// Les tons sont sémantiques, pas décoratifs (§4.2) :
//   danger  une erreur, une créance en retard, une trésorerie en baisse
//   warning une échéance qui approche — pas encore une alerte
//   success une confirmation, un paiement reçu, un objectif atteint
//   neutral tout le reste
//   accent  l'unique élément à remarquer dans une zone
// ─────────────────────────────────────────────────────────────────────────────

import type { ReactNode } from 'react';
import { cn } from '../../lib/utils';

export type BadgeTone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger' | 'info';

const TONE: Record<BadgeTone, string> = {
  neutral: 'bg-surface2 text-text2 dark:bg-dark-surface2 dark:text-dark-text2',
  accent:  'bg-accent-sub text-primary dark:bg-accent/15 dark:text-accent',
  success: 'bg-success-sub text-success dark:bg-success/15 dark:text-success',
  warning: 'bg-warning-sub text-warning dark:bg-warning/15 dark:text-warning',
  danger:  'bg-danger-sub text-danger dark:bg-danger/15 dark:text-danger',
  info:    'bg-info-sub text-info dark:bg-info/15 dark:text-info',
};

export function Badge({
  children,
  tone = 'neutral',
  className,
}: {
  children: ReactNode;
  tone?: BadgeTone;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-pill px-2 py-0.5 text-note font-bold',
        TONE[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/**
 * Un filtre en pastille. La sélection se marque par le CONTRASTE — fond marine,
 * texte blanc — jamais par une teinte différente par filtre (§3.4).
 */
export function FilterPill({
  label,
  count,
  selected,
  onClick,
}: {
  label: string;
  count?: number;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        'pressable inline-flex min-h-touch flex-shrink-0 items-center gap-2 rounded-pill px-4 text-note font-bold',
        'transition-colors duration-press ease-pp',
        selected
          ? 'bg-primary text-white'
          : 'bg-surface2 text-text2 hover:bg-border dark:bg-dark-surface2 dark:text-dark-text2',
      )}
    >
      {label}
      {count !== undefined && (
        <span className={cn('amount', selected ? 'text-white/70' : 'text-muted')}>{count}</span>
      )}
    </button>
  );
}
