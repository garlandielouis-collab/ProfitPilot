'use client';

// ─────────────────────────────────────────────────────────────────────────────
// L'indicateur — les trois niveaux du §2, dans une carte
//
//   Niveau 1  la valeur          « 1 250 000 HTG »
//   Niveau 2  la variation       « +18 % »            (la période est en tête)
//   Niveau 3  ce qu'on en fait   la carte entière est un lien (§45)
//
// Plus une quatrième chose que le §51 rend obligatoire : la FORMULE. Elle
// voyage en `title` et en texte accessible. Un chiffre de gestion dont on ne
// peut pas retrouver l'origine n'est pas un chiffre, c'est une opinion.
//
// § 48 — « Ne jamais utiliser uniquement une couleur pour indiquer un statut. »
// La variation porte donc un signe (+ / −) autant qu'une teinte, et la flèche
// est doublée d'un libellé lu par les lecteurs d'écran.
// ─────────────────────────────────────────────────────────────────────────────

import Link from 'next/link';
import { useId } from 'react';
import { Card, Money } from '../../ds';
import { cn } from '../../../lib/utils';

export type KpiUnit = 'money' | 'count' | 'percent';

export function KpiCard({
  label,
  value,
  unit = 'money',
  currency = 'HTG',
  deltaPercent,
  note,
  formula,
  href,
  emphasis = false,
  loading = false,
  className,
}: {
  label: string;
  value: number;
  unit?: KpiUnit;
  currency?: string;
  /** `null` quand la comparaison n'a pas de base — jamais « +100 % » (§51). */
  deltaPercent?: number | null;
  /** Une mention courte. Jamais un second montant (§4.3 de la constitution). */
  note?: string;
  /** La formule du §51. Affichée au survol, lue par les lecteurs d'écran. */
  formula?: string;
  href?: string;
  /** L'indicateur qui domine sa zone. Un seul (§4.5). */
  emphasis?: boolean;
  loading?: boolean;
  className?: string;
}) {
  const formulaId = useId();

  const body = (
    <Card
      interactive={Boolean(href)}
      className={cn('flex h-full flex-col gap-2 p-4', className)}
    >
      <p
        className="text-note font-bold uppercase tracking-wide text-muted dark:text-dark-muted"
        title={formula}
      >
        {label}
      </p>

      {loading ? (
        <span className="pp-skeleton block h-7 w-32 rounded-control" aria-hidden />
      ) : unit === 'money' ? (
        <Money
          value={value}
          currency={currency}
          size={emphasis ? 'amount-lg' : 'amount'}
          aria-describedby={formula ? formulaId : undefined}
        />
      ) : (
        <span
          className={cn(
            'amount whitespace-nowrap text-primary dark:text-dark-text',
            emphasis ? 'text-amount-lg font-hero' : 'text-amount font-semibold',
          )}
        >
          {unit === 'percent'
            ? `${value.toFixed(1)} %`
            : new Intl.NumberFormat('fr-HT').format(Math.round(value))}
        </span>
      )}

      {(deltaPercent != null || note) && !loading && (
        <div className="flex flex-wrap items-center gap-2">
          {deltaPercent != null && <DeltaPill percent={deltaPercent} />}
          {note && (
            <span className="truncate text-note text-muted dark:text-dark-muted">{note}</span>
          )}
        </div>
      )}

      {/* La formule n'occupe pas de place à l'écran, elle occupe sa place dans
          l'arbre d'accessibilité : le chiffre reste traçable sans encombrer. */}
      {formula && <span id={formulaId} className="sr-only">{formula}</span>}
    </Card>
  );

  return href ? <Link href={href} className="block h-full">{body}</Link> : body;
}

/**
 * La variation. Signe ET couleur — la couleur seule ne suffit pas (§48).
 * Elle ne répète pas la période : celle-ci est annoncée une fois, en tête.
 */
export function DeltaPill({ percent, className }: { percent: number; className?: string }) {
  if (!Number.isFinite(percent)) return null;
  const up = percent >= 0;
  return (
    <span
      className={cn(
        'amount inline-flex items-center gap-1 rounded-pill px-2 py-0.5 text-note font-bold',
        up ? 'bg-success-sub text-success' : 'bg-danger-sub text-danger',
        className,
      )}
    >
      <span aria-hidden>{up ? '↑' : '↓'}</span>
      {Math.abs(percent).toFixed(1)} %
    </span>
  );
}
