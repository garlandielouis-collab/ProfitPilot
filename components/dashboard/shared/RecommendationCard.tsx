'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Une recommandation — §22 (Kwasans), §29 et §32 (Elit)
//
// Le §32 impose quatre parties, et les quatre sont là :
//
//   Insight            ce qu'on a vu           → titre
//   Reason             pourquoi                → détail
//   Potential impact   ce que ça vaut          → impact
//   Action             quoi faire, et où       → bouton
//
// C'est exactement la hiérarchie du §2 (« que se passe-t-il / pourquoi / que
// dois-je faire »), appliquée à une carte. Une recommandation à laquelle il
// manque le « pourquoi » se lit comme un ordre ; il manque le « combien », elle
// se lit comme une opinion.
// ─────────────────────────────────────────────────────────────────────────────

import Link from 'next/link';
import { Card } from '../../ds';
import { cn } from '../../../lib/utils';
import type { Priority } from '../narrative';

const MARK: Record<Priority['tone'], string> = {
  danger: '●', warning: '⚠', success: '↑', info: '→',
};

const MARK_CLASS: Record<Priority['tone'], string> = {
  danger:  'bg-danger-sub text-danger',
  warning: 'bg-warning-sub text-warning',
  success: 'bg-success-sub text-success',
  info:    'bg-surface2 text-muted dark:bg-dark-surface2 dark:text-dark-muted',
};

export function RecommendationCard({
  item,
  impactLabel,
}: {
  item: Priority;
  /** « Impact potentiel » — écrit une fois par l'appelant, dans sa langue. */
  impactLabel?: string;
}) {
  return (
    <Card className="flex h-full flex-col gap-3 p-4">
      <div className="flex items-start gap-3">
        {/* Le symbole porte le ton ; la couleur ne fait que le confirmer (§48). */}
        <span
          className={cn(
            'mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-pill text-note font-bold',
            MARK_CLASS[item.tone],
          )}
          aria-hidden
        >
          {MARK[item.tone]}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-body font-bold text-primary dark:text-dark-text">{item.title}</p>
          <p className="mt-1 text-note text-text2 dark:text-dark-text2">{item.detail}</p>
        </div>
      </div>

      {item.impact && (
        <p className="rounded-control bg-surface2 px-3 py-2 text-note text-text2 dark:bg-dark-surface2 dark:text-dark-text2">
          {impactLabel && (
            <span className="font-bold text-primary dark:text-dark-text">{impactLabel} · </span>
          )}
          {item.impact}
        </p>
      )}

      {/* Une seule action par carte. Un lien, pas un bouton plein : le bouton
          plein d'un écran est ailleurs, et deux appels du même poids n'en font
          plus aucun (§4.5 de la constitution). */}
      <Link
        href={item.href}
        className="pressable mt-auto inline-flex min-h-touch items-center text-note font-bold text-primary underline underline-offset-4 dark:text-dark-text"
      >
        {item.action}
      </Link>
    </Card>
  );
}

/** Une liste de recommandations — la grille du §22 et du §32. */
export function RecommendationList({
  items,
  impactLabel,
  columns = 1,
}: {
  items: Priority[];
  impactLabel?: string;
  columns?: 1 | 2 | 3;
}) {
  if (items.length === 0) return null;
  return (
    <div
      className={cn(
        'grid gap-4',
        columns === 3 ? 'lg:grid-cols-3' : columns === 2 ? 'lg:grid-cols-2' : '',
      )}
    >
      {items.map((item) => (
        <RecommendationCard key={item.id} item={item} impactLabel={impactLabel} />
      ))}
    </div>
  );
}
