'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Button — les trois états obligatoires (§3.7)
//
//   enfoncé      immédiat, sous 100 ms — via .pressable
//   chargement   roue + bouton désactivé, pour interdire le double envoi
//   confirmation coche animée, brièvement, avant retour à l'état normal
//
// « Le marchand qui appuie sur Enregistrer la vente sans retour immédiat
//   appuiera une deuxième fois — et créera une vente en double dans sa
//   comptabilité. » Sur un réseau irrégulier, le retour interactif n'est pas du
//   polish : c'est de l'intégrité comptable.
//
// Audit §4.5 : les deux appels à l'action d'un écran ne pèsent jamais le même
// poids. « Enregistrer la vente » est un bouton plein ; « Annuler » est un lien.
// ─────────────────────────────────────────────────────────────────────────────

import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '../../lib/utils';

type Variant = 'primary' | 'accent' | 'soft' | 'quiet' | 'outline' | 'danger' | 'link';
type Size = 'sm' | 'md' | 'lg';

const VARIANT: Record<Variant, string> = {
  // L'action structurante — 30 % de la palette.
  primary: 'bg-primary text-white hover:bg-primary-h active:bg-primary-a shadow-card',
  // L'action principale de l'écran — les 10 %. Une seule par zone.
  //
  // Le texte est MARINE, pas blanc (masterclass §31). Le blanc sur l'émeraude
  // de marque donne 2,1:1 : c'est invisible sur un Android à midi, dehors —
  // exactement le bouton qui porte un montant, exactement le client de
  // ProfitPilot. Le marine sur la même émeraude donne 7,7:1 (AAA), et la
  // couleur de marque reste intacte.
  accent:  'bg-accent text-accent-ink hover:bg-accent-h active:bg-accent-a shadow-card',
  // La paire du §21 : le secondaire est la MÊME teinte, montée en luminosité.
  // Pas un bouton fantôme (bordure seule) — lisible en maquette, invisible au
  // soleil.
  soft:    'bg-accent-sub text-primary hover:bg-accent/20 active:bg-accent/30',
  quiet:   'bg-surface2 text-primary hover:bg-border dark:bg-dark-surface2 dark:text-dark-text dark:hover:bg-dark-border',
  outline: 'border border-border bg-white text-primary hover:bg-surface dark:border-dark-border dark:bg-transparent dark:text-dark-text dark:hover:bg-white/5',
  // Le rouge n'apparaît que pour supprimer. Jamais pour se déconnecter (§4.2).
  danger:  'bg-danger text-white hover:brightness-95 shadow-card',
  // Le second appel à l'action d'un écran : un lien, pas un bouton.
  link:    'text-primary underline underline-offset-4 hover:text-primary-h dark:text-dark-text',
};

// Trois hauteurs, jamais plus (masterclass §8) — 44 pour un contrôle
// contextuel, 48 pour une action secondaire, 56 pour l'action principale de
// l'écran. Toute cible fait au moins 44 px de côté (§5.9).
//
// Les marges latérales suivent la règle des W (§19) : deux « W » de chaque côté
// du libellé. Le texte est centré par le layout — jamais par des marges figées,
// sinon « Anrejistre vant lan » décentre ce que « Ankese » avait bien placé.
const SIZE: Record<Size, string> = {
  sm: 'min-h-touch px-4 text-note rounded-control gap-2',
  md: 'min-h-action px-5 text-body rounded-surface gap-2',
  lg: 'min-h-hero px-6 text-body rounded-surface gap-2',
};

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  variant?: Variant;
  size?: Size;
  /** L'attente réelle : la roue remplace le libellé, le bouton se verrouille. */
  loading?: boolean;
  /** L'après : la coche se dessine, le marchand voit que c'est passé. */
  confirmed?: boolean;
  /** Texte affiché pendant l'attente. Court : « Enregistrement… ». */
  loadingLabel?: string;
  block?: boolean;
  icon?: ReactNode;
};

export function Button({
  children,
  className,
  variant = 'primary',
  size = 'md',
  loading = false,
  confirmed = false,
  loadingLabel,
  block = false,
  icon,
  disabled,
  ...props
}: ButtonProps) {
  const busy = loading || confirmed;

  return (
    <button
      {...props}
      disabled={disabled || busy}
      aria-busy={loading || undefined}
      className={cn(
        'pressable inline-flex items-center justify-center font-bold',
        'transition-colors duration-press ease-pp',
        'disabled:cursor-not-allowed',
        // Un bouton en cours d'écriture n'est pas « grisé » : il est verrouillé
        // mais reste lisible, sinon le marchand croit l'action perdue.
        busy ? 'opacity-100' : 'disabled:opacity-45',
        variant !== 'link' && SIZE[size],
        VARIANT[variant],
        block && 'w-full',
        className,
      )}
    >
      {confirmed ? (
        <>
          <CheckMark />
          {children}
        </>
      ) : loading ? (
        <>
          <Spinner />
          {loadingLabel ?? children}
        </>
      ) : (
        <>
          {icon}
          {children}
        </>
      )}
    </button>
  );
}

function Spinner() {
  return (
    <span
      className="h-4 w-4 flex-shrink-0 animate-spin rounded-pill border-2 border-current border-t-transparent opacity-70"
      aria-hidden
    />
  );
}

function CheckMark() {
  return (
    <svg className="pp-check h-4 w-4 flex-shrink-0" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M4 12.5l5.5 5.5L20 7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
