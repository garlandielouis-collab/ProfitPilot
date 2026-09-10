'use client';

// ─────────────────────────────────────────────────────────────────────────────
// La section d'un module — §42, §43, §44, §50
//
// Quatre états, un seul composant, parce que les quatre se ressemblent trop
// pour être écrits vingt fois :
//
//   chargement    un squelette CALQUÉ sur la structure réelle (§50), jamais un
//                 rectangle générique : ce qui apparaît doit occuper la place
//                 de ce qui va arriver, sinon l'écran saute sous l'œil.
//   vide          « pas encore assez de données », avec l'explication (§42)
//   premier jour  la phrase pédagogique et l'action (§43)
//   rempli        le contenu
//
// Et une cinquième capacité, celle du §44 : la section peut être REPLIÉE. C'est
// ce qui permet à Elit d'afficher beaucoup sans être dense — « progressive
// disclosure, drill-down, expandable sections ». Le repli est un état de
// l'interface, pas une donnée : il vit ici, en `useState`.
// ─────────────────────────────────────────────────────────────────────────────

import { useId, useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { Card, Section } from '../../ds';
import { cn } from '../../../lib/utils';

export function ModuleSection({
  title,
  action,
  children,
  loading = false,
  skeleton,
  /** Vrai quand le module n'a rien à montrer — pas quand il n'existe pas. */
  empty = false,
  /** Le §43 : ce qu'il faut faire pour que la section se remplisse. */
  emptyTitle,
  emptyHint,
  emptyAction,
  /** Repliable (§44). `defaultOpen` décide de l'état d'arrivée. */
  collapsible = false,
  defaultOpen = true,
  className,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
  loading?: boolean;
  skeleton?: ReactNode;
  empty?: boolean;
  emptyTitle?: string;
  emptyHint?: string;
  emptyAction?: ReactNode;
  collapsible?: boolean;
  defaultOpen?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const bodyId = useId();

  const body = loading
    ? (skeleton ?? <SkeletonBlock />)
    : empty
      ? <NotEnoughData title={emptyTitle} hint={emptyHint} action={emptyAction} />
      : children;

  if (!collapsible) {
    return <Section title={title} action={action} className={className}>{body}</Section>;
  }

  return (
    <section className={cn('space-y-2', className)}>
      <div className="flex min-h-touch items-center justify-between gap-4">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls={bodyId}
          className="pressable flex min-h-touch flex-1 items-center gap-2 text-left"
        >
          <h2 className="text-card font-bold text-primary dark:text-dark-text">{title}</h2>
          <ChevronDown
            className={cn('h-4 w-4 flex-shrink-0 text-muted transition-transform duration-press ease-pp',
              open && 'rotate-180')}
            aria-hidden
          />
        </button>
        {action}
      </div>
      <div id={bodyId} hidden={!open}>{body}</div>
    </section>
  );
}

/**
 * « Pas encore assez de données » — §42 et §59.
 *
 * « Mauvais : No data. Bon : Commencez par enregistrer vos premières ventes
 *   pour voir apparaître vos performances. » Le titre constate, la phrase
 *   explique POURQUOI c'est vide, et l'action ouvre la porte. Sans le pourquoi,
 *   le marchand croit à une panne.
 */
export function NotEnoughData({
  title,
  hint,
  action,
}: {
  title?: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <Card className="px-4 py-8 text-center">
      <p className="text-body font-bold text-primary dark:text-dark-text">
        {title ?? 'Pas encore assez de données'}
      </p>
      {hint && (
        <p className="mx-auto mt-2 max-w-sm text-note text-text2 dark:text-dark-text2">{hint}</p>
      )}
      {action && <div className="mt-6 flex justify-center">{action}</div>}
    </Card>
  );
}

/** Le squelette générique — trois lignes dans une carte. */
export function SkeletonBlock({ lines = 3 }: { lines?: number }) {
  return (
    <Card className="space-y-3 p-4" aria-hidden>
      {Array.from({ length: lines }, (_, i) => (
        <span key={i} className="pp-skeleton block h-6 rounded-control" />
      ))}
    </Card>
  );
}

/** Le squelette d'une rangée d'indicateurs — la structure réelle, en gris. */
export function SkeletonKpis({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-2 lg:grid-cols-4" aria-hidden>
      {Array.from({ length: count }, (_, i) => (
        <Card key={i} className="space-y-2 p-4">
          <span className="pp-skeleton block h-3 w-20 rounded-control" />
          <span className="pp-skeleton block h-7 w-28 rounded-control" />
          <span className="pp-skeleton block h-4 w-16 rounded-control" />
        </Card>
      ))}
    </div>
  );
}
