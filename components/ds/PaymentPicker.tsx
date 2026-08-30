'use client';

// ─────────────────────────────────────────────────────────────────────────────
// PaymentPicker — UN composant, décliné par une icône et un libellé (§3.4)
//
// L'état d'avant : cinq boutons de paiement traités comme cinq composants
// distincts — émeraude, rose #e91e8c, violet, bleu #0056b3, ambre — côte à côte
// sur l'écran le plus utilisé du produit. Cinq couleurs saturées se disputant
// les 10 % de la palette : personne ne sait où regarder.
//
// La règle appliquée ici : la sélection se marque par le CONTRASTE — fond
// marine, texte blanc — jamais par une teinte différente par méthode (§4.2).
// Le rose, proche du rouge, installait une note d'alerte permanente sur le
// moment le plus positif de la journée du marchand.
// ─────────────────────────────────────────────────────────────────────────────

import { cn } from '../../lib/utils';

export type PaymentKey = 'cash' | 'moncash' | 'natcash' | 'card' | 'credit';

type Method = { key: PaymentKey; label: string; hint: string; icon: 'cash' | 'phone' | 'card' | 'clock' };

export const PAYMENT_METHODS: Method[] = [
  { key: 'cash',    label: 'Espèces', hint: 'Encaissé maintenant',  icon: 'cash'  },
  { key: 'moncash', label: 'MonCash', hint: 'Mobile Digicel',       icon: 'phone' },
  { key: 'natcash', label: 'NatCash', hint: 'Mobile Natcom',        icon: 'phone' },
  { key: 'card',    label: 'Carte',   hint: 'Visa ou Mastercard',   icon: 'card'  },
  { key: 'credit',  label: 'Crédit',  hint: 'À encaisser plus tard', icon: 'clock' },
];

export function PaymentPicker({
  value,
  onChange,
  methods = PAYMENT_METHODS,
  className,
}: {
  value: PaymentKey;
  onChange: (key: PaymentKey) => void;
  methods?: Method[];
  className?: string;
}) {
  return (
    <div className={cn('grid grid-cols-2 gap-2', className)} role="radiogroup" aria-label="Mode de paiement">
      {methods.map((m) => {
        const selected = m.key === value;
        return (
          <button
            key={m.key}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(m.key)}
            className={cn(
              // 44 px minimum : la boutique est agitée, le doigt est large (§5.9).
              'pressable flex min-h-13 items-center gap-3 rounded-surface px-3 text-left',
              'transition-colors duration-press ease-pp',
              selected
                ? 'bg-primary text-white'
                : 'bg-surface2 text-primary hover:bg-border dark:bg-dark-surface2 dark:text-dark-text',
            )}
          >
            <MethodIcon name={m.icon} className={cn('h-5 w-5 flex-shrink-0', selected ? 'text-white' : 'text-muted')} />
            <span className="min-w-0">
              <span className="block truncate text-body font-bold">{m.label}</span>
              <span className={cn('block truncate text-note', selected ? 'text-white/70' : 'text-muted')}>
                {m.hint}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

// Une seule bibliothèque, un seul style : contour, épaisseur constante,
// coins cohérents (§3.5). Et chaque icône porte son libellé — aucune n'est
// universelle pour un marchand qui vient du cahier papier.
function MethodIcon({ name, className }: { name: Method['icon']; className?: string }) {
  const common = {
    className,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  };

  if (name === 'cash')
    return (
      <svg {...common}>
        <rect x="2" y="6" width="20" height="12" rx="2" />
        <circle cx="12" cy="12" r="2.5" />
      </svg>
    );

  if (name === 'phone')
    return (
      <svg {...common}>
        <rect x="6" y="2" width="12" height="20" rx="2" />
        <path d="M11 18h2" />
      </svg>
    );

  if (name === 'card')
    return (
      <svg {...common}>
        <rect x="2" y="5" width="20" height="14" rx="2" />
        <path d="M2 10h20" />
      </svg>
    );

  return (
    <svg {...common}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}
