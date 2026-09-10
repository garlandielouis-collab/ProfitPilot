// ─────────────────────────────────────────────────────────────────────────────
// Money — tout montant de l'application passe par ici
//
// Audit §4.3 : la chasse fixe n'est pas un caprice d'esthète. Dans un outil où
// l'on compare des colonnes de chiffres — créances, inventaire, rapports — des
// chiffres à largeur fixe s'alignent naturellement et se comparent d'un regard.
// Et la carte ne « saute » plus quand 4 250 devient 12 850.
//
// Audit §6.3 : les montants sont en marine. L'émeraude est l'appel à l'action ;
// la gaspiller sur une donnée répétée, c'est la vider de son sens.
// ─────────────────────────────────────────────────────────────────────────────

import { cn } from '../../lib/utils';

type Size = 'note' | 'body' | 'card' | 'amount' | 'amount-lg';
type Tone = 'default' | 'muted' | 'up' | 'down';

// Masterclass §11 : semibold (600) porte les montants importants ; le 700
// reste au SEUL montant héro — celui qui domine le tableau de bord. Un montant
// de ligne de liste en 700, répété quarante fois, ne hiérarchise plus rien.
const SIZE: Record<Size, string> = {
  note:        'text-note',
  body:        'text-body',
  card:        'text-card font-semibold',
  amount:      'text-amount font-semibold',
  'amount-lg': 'text-amount-lg font-hero',
};

const TONE: Record<Tone, string> = {
  default: 'text-primary dark:text-dark-text',
  muted:   'text-muted dark:text-dark-muted',
  // Le vert et le rouge sont des couleurs système : ils ne disent QUE
  // « ça progresse » et « ça coûte de l'argent » (§4.2).
  up:      'text-success',
  down:    'text-danger',
};

/** Formatage haïtien : séparateur d'espace, pas de décimales sur les gourdes. */
export function formatAmount(value: number, currency = 'HTG', decimals = 0): string {
  const n = Number.isFinite(value) ? value : 0;
  const body = new Intl.NumberFormat('fr-HT', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(n);
  return `${body} ${currency}`;
}

export function Money({
  value,
  currency = 'HTG',
  size = 'body',
  tone = 'default',
  decimals = 0,
  signed = false,
  className,
}: {
  value: number;
  currency?: string;
  size?: Size;
  tone?: Tone;
  decimals?: number;
  /** Préfixe + / − — pour une variation, jamais pour un solde. */
  signed?: boolean;
  className?: string;
}) {
  const sign = signed ? (value > 0 ? '+' : value < 0 ? '−' : '') : '';
  const shown = signed ? Math.abs(value) : value;

  return (
    <span className={cn('amount whitespace-nowrap', SIZE[size], TONE[tone], className)}>
      {sign}
      {formatAmount(shown, currency, decimals)}
    </span>
  );
}

/**
 * Une variation en pourcentage. Elle ne répète PAS la période de comparaison :
 * celle-ci est établie une fois pour toutes en tête de l'écran (§2.4).
 */
export function Delta({ percent, className }: { percent: number; className?: string }) {
  if (!Number.isFinite(percent)) return null;
  const up = percent >= 0;
  return (
    <span
      className={cn(
        'amount inline-flex items-center rounded-pill px-2 py-0.5 text-note font-bold',
        up ? 'bg-success-sub text-success' : 'bg-danger-sub text-danger',
        className,
      )}
    >
      {up ? '+' : '−'}
      {Math.abs(percent).toFixed(0)} %
    </span>
  );
}
