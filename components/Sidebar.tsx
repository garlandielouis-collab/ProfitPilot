'use client';

// ─────────────────────────────────────────────────────────────────────────────
// La barre latérale de bureau — la même hiérarchie que sur mobile
//
// Le bureau a de la place, mais pas le droit de contredire le mobile : les
// quatre destinations quotidiennes restent en tête, l'action « + Vente » reste
// mise en avant, et les vingt autres entrées gardent leurs trois sections.
// Un même produit, deux tailles d'écran, une seule carte mentale.
//
// La sélection se marque par le contraste et un filet d'accent — pas par une
// pastille de couleur pleine qui volerait les 10 % dus au contenu (§4.5).
// ─────────────────────────────────────────────────────────────────────────────

import Link from 'next/link';
import { Plus } from 'lucide-react';
import { BOTTOM_BAR, MORE_SECTIONS, ROUTE_FEATURE, type Entry } from './nav';
import { PlanTag, useIsLocked } from './PlanLock';
import { useLanguage } from './LanguageWrapper';
import { cn } from '../lib/utils';

export function Sidebar({
  pathname,
  onNewSale,
}: {
  pathname: string | null;
  onNewSale: () => void;
}) {
  const { t } = useLanguage();
  const [home, sales, receivables] = BOTTOM_BAR;

  return (
    <aside className="hidden w-64 flex-shrink-0 border-r border-border bg-white dark:border-dark-border dark:bg-dark-surface lg:block">
      <div className="sticky top-14 flex max-h-[calc(100vh-3.5rem)] flex-col overflow-y-auto p-4">
        {/* L'action principale, en tête et en émeraude : un seul accent visible
            dans toute la colonne. */}
        <button
          type="button"
          onClick={onNewSale}
          className="pressable mb-6 flex min-h-13 w-full items-center justify-center gap-2 rounded-surface bg-accent text-body font-bold text-white shadow-card hover:bg-accent-h"
        >
          <Plus className="h-5 w-5" strokeWidth={2.5} aria-hidden />
          {t({ fr: 'Nouvelle vente', ht: 'Nouvo vant' })}
        </button>

        <nav className="space-y-6" aria-label={t({ fr: 'Navigation', ht: 'Navigasyon' })}>
          <ul className="space-y-1">
            {[home, sales, receivables].map((entry) => (
              <Item key={entry.href} entry={entry} pathname={pathname} />
            ))}
          </ul>

          {MORE_SECTIONS.map((section) => (
            <div key={section.title.fr}>
              <h2 className="mb-2 px-3 text-note font-bold uppercase tracking-wide text-muted dark:text-dark-muted">
                {t(section.title)}
              </h2>
              <ul className="space-y-1">
                {section.entries.map((entry) => (
                  <Item key={entry.href} entry={entry} pathname={pathname} />
                ))}
              </ul>
            </div>
          ))}
        </nav>
      </div>
    </aside>
  );
}

function Item({ entry, pathname }: { entry: Entry; pathname: string | null }) {
  const { t } = useLanguage();
  const Icon = entry.icon;
  const active = pathname === entry.href || (!!pathname && pathname.startsWith(`${entry.href}/`));

  // Une destination hors offre reste VISIBLE et cliquable : elle mène à l'écran
  // qui explique ce qu'elle apporte. Cacher une fonctionnalité, c'est renoncer
  // à la vendre — personne n'achète ce qu'il n'a jamais vu.
  const feature = ROUTE_FEATURE[entry.href];
  const locked  = useIsLocked(feature);

  return (
    <li className="relative">
      {active && (
        <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-pill bg-accent" aria-hidden />
      )}
      <Link
        href={entry.href}
        aria-current={active ? 'page' : undefined}
        className={cn(
          'flex min-h-touch items-center gap-3 rounded-surface px-3 text-body transition-colors duration-press',
          active
            ? 'bg-nav-active font-bold text-primary dark:bg-white/10 dark:text-dark-text'
            : 'text-text2 hover:bg-surface dark:text-dark-text2 dark:hover:bg-white/5',
        )}
      >
        <Icon
          className={cn('h-5 w-5 flex-shrink-0', active ? 'text-primary dark:text-accent' : 'text-muted')}
          strokeWidth={1.8}
          aria-hidden
        />
        <span className={cn('min-w-0 flex-1 truncate', locked && 'text-muted dark:text-dark-muted')}>
          {t(entry.label)}
        </span>

        <PlanTag feature={feature} />
      </Link>
    </li>
  );
}
