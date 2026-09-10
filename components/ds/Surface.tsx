// ─────────────────────────────────────────────────────────────────────────────
// Card / Section — le groupement se fait par l'ESPACE, pas par un cadre
//
// Audit §5.5 : jamais deux niveaux de cartes. Une carte dans une carte crée du
// padding sur du padding ; l'espace utile fond. La carte est réservée au niveau
// le plus profond, celui qui porte la donnée. Le groupement extérieur — une
// section — se fait avec un en-tête en texte et de l'espace.
//
// Audit §3.2 : une seule ombre officielle pour les cartes, une seconde pour les
// éléments flottants. Aucun dégradé sur une surface porteuse de données.
// ─────────────────────────────────────────────────────────────────────────────

import type { ReactNode } from 'react';
import { cn } from '../../lib/utils';

/**
 * La carte : le niveau le plus profond, celui qui porte la donnée.
 * Ne jamais imbriquer une Card dans une Card — utiliser Section au-dessus.
 */
export function Card({
  children,
  className,
  as: Tag = 'div',
  interactive = false,
}: {
  children: ReactNode;
  className?: string;
  as?: 'div' | 'li' | 'article' | 'section';
  /** Rend la carte cliquable : retour au doigt sous 100 ms (§3.7). */
  interactive?: boolean;
}) {
  return (
    <Tag
      className={cn(
        // Ombre OU bordure, jamais les deux (masterclass §24) : « une ombre
        // douce plus une bordure claire créent une ligne floue ». La carte de
        // ProfitPilot porte des chiffres sur des écrans denses — le cours pose
        // le style plat à bordures pour ce cas. L'ombre reste au flottant.
        'rounded-surface border border-border bg-white',
        'dark:border-dark-border dark:bg-dark-surface',
        interactive && 'pressable cursor-pointer hover:border-slate-300 dark:hover:border-slate-600',
        className,
      )}
    >
      {children}
    </Tag>
  );
}

/**
 * Une section : un en-tête en texte, ses éléments à 8 px, puis 24 px avant la
 * section suivante. Pas de conteneur — l'espace suffit à grouper.
 */
export function Section({
  title,
  action,
  children,
  className,
}: {
  title?: string;
  /** Un lien texte à droite du titre. Jamais un deuxième bouton plein. */
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('space-y-2', className)}>
      {(title || action) && (
        <div className="flex min-h-touch items-center justify-between gap-4">
          {title && (
            <h2 className="text-card font-bold text-primary dark:text-dark-text">{title}</h2>
          )}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

/**
 * La pile d'un écran : 24 px entre sections distinctes (§4.4).
 */
export function Stack({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('space-y-6', className)}>{children}</div>;
}

/**
 * L'en-tête d'écran : UN titre par écran, en 22 px. Le sous-titre explique,
 * il ne répète pas le titre (§4.5).
 */
export function ScreenHeader({
  title,
  subtitle,
  action,
  live,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  /** Le point « en direct » — le même motif que la période en cours du graphique. */
  live?: boolean;
}) {
  return (
    <header className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <h1 className="truncate text-screen font-bold text-primary dark:text-dark-text">{title}</h1>
          {live && <span className="pp-live h-2 w-2 flex-shrink-0 rounded-pill bg-accent" aria-hidden />}
        </div>
        {subtitle && <p className="mt-1 text-note text-muted dark:text-dark-muted">{subtitle}</p>}
      </div>
      {action}
    </header>
  );
}
