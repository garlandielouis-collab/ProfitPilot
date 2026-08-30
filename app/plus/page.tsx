'use client';

// ─────────────────────────────────────────────────────────────────────────────
// « Plus » — la page qui absorbe les vingt entrées sorties de la barre (§5.1)
//
// Ce n'est pas un placard. C'est une page structurée en sections avec en-têtes,
// chaque entrée portant une icône, un libellé et une description d'une ligne.
// L'ancienne barre latérale de 25 liens est devenue une page d'accueil-sommaire :
// on y trouve ce qu'on cherche par le sens, pas par la mémoire d'une position.
//
// Une seule direction de défilement : vertical (§5.3). Une seule tâche : choisir
// où aller (§5.6). Les groupes sont séparés par l'espace, pas par des cadres
// imbriqués (§5.5) — la carte est réservée au niveau qui porte l'information.
// ─────────────────────────────────────────────────────────────────────────────

import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { ProtectedRoute } from '../../components/ProtectedRoute';
import { useLanguage } from '../../components/LanguageWrapper';
import { MORE_SECTIONS, ROUTE_FEATURE, type Entry } from '../../components/nav';
import { PlanTag, useIsLocked } from '../../components/PlanLock';
import { ScreenHeader, Stack } from '../../components/ds';

function PlusInner() {
  const { t } = useLanguage();

  return (
    <div className="pp-enter mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
      <ScreenHeader
        title={t({ fr: 'Plus', ht: 'Plis' })}
        subtitle={t({
          fr: 'Tout ce qui ne se fait pas entre deux clients.',
          ht: 'Tout sa ou pa fè ant de kliyan.',
        })}
      />

      <Stack className="mt-6">
        {MORE_SECTIONS.map((section) => (
          <section key={section.title.fr} className="space-y-2">
            {/* L'en-tête est du TEXTE, pas un conteneur : c'est l'espace qui
                groupe (§5.5). */}
            <h2 className="px-1 text-note font-bold uppercase tracking-wide text-muted dark:text-dark-muted">
              {t(section.title)}
            </h2>

            <ul className="overflow-hidden rounded-surface border border-border bg-white dark:border-dark-border dark:bg-dark-surface">
              {section.entries.map((entry, i) => (
                <Row key={entry.href} entry={entry} first={i === 0} />
              ))}
            </ul>
          </section>
        ))}
      </Stack>
    </div>
  );
}

function Row({ entry, first }: { entry: Entry; first: boolean }) {
  const { t } = useLanguage();
  const Icon = entry.icon;

  // Verrouillée, la ligne garde sa place et son libellé : ce qui change, c'est
  // le chevron — remplacé par le nom de l'offre qui l'ouvre. Le marchand lit
  // « Kwasans » et sait quoi faire ; un cadenas seul ne dit que « non ».
  const feature = ROUTE_FEATURE[entry.href];
  const locked  = useIsLocked(feature);

  return (
    <li>
      <Link
        href={entry.href}
        className={[
          // La ligne entière est cliquable, et fait plus de 44 px de haut (§5.9).
          'pressable flex min-h-13 items-center gap-3 px-4 py-3',
          'hover:bg-surface dark:hover:bg-white/5',
          first ? '' : 'border-t border-border dark:border-dark-border',
        ].join(' ')}
      >
        <Icon className="h-5 w-5 flex-shrink-0 text-muted dark:text-dark-muted" strokeWidth={1.8} aria-hidden />

        <span className="min-w-0 flex-1">
          <span className="block truncate text-body font-bold text-primary dark:text-dark-text">
            {t(entry.label)}
          </span>
          <span className="block truncate text-note text-muted dark:text-dark-muted">
            {t(entry.hint)}
          </span>
        </span>

        {/* Le chevron survit à la question « que perd-on si on le retire ? » :
            dans une liste de NAVIGATION, il annonce un départ vers une autre
            page. Sur une ligne de données déjà cliquable, il ne survivrait
            pas — et il a été retiré partout ailleurs (§3.6). */}
        {locked ? (
          <PlanTag feature={feature} />
        ) : (
          <ChevronRight className="h-4 w-4 flex-shrink-0 text-border dark:text-dark-border" aria-hidden />
        )}
      </Link>
    </li>
  );
}

export default function PlusPage() {
  return (
    <ProtectedRoute>
      <PlusInner />
    </ProtectedRoute>
  );
}
