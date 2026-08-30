'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Stat — la carte « Marge du jour », version §2.4
//
// Ce que la version senior retire par rapport à la version débutante :
//   · le dégradé émeraude sur toute la carte      → aplat neutre
//   · l'ombre dure                                 → un seul token d'ombre
//   · cinq tailles de texte sur une seule carte    → deux
//   · « +12 % versus la journée d'hier »           → « +12 % »
//     la période de comparaison est établie une fois en tête de l'écran
//   · le montant en police proportionnelle         → chasse fixe
//
// Il reste : un titre, un montant qui domine, une pastille de variation.
// Chaque élément a gagné sa place.
// ─────────────────────────────────────────────────────────────────────────────

import Link from 'next/link';
import type { ReactNode } from 'react';
import { Card } from './Surface';
import { Money, Delta } from './Money';
import { cn } from '../../lib/utils';

export function Stat({
  label,
  value,
  currency = 'HTG',
  delta,
  note,
  href,
  loading = false,
  emphasis = false,
  className,
}: {
  /** Le titre. Deux mots. « Marge du jour », pas « Votre marge réalisée aujourd'hui ». */
  label: string;
  value: number;
  currency?: string;
  /** La variation, sans sa période : elle est déjà annoncée en tête d'écran. */
  delta?: number | null;
  /** Une mention. Jamais un montant, jamais une donnée décisionnelle (§4.3). */
  note?: string;
  href?: string;
  loading?: boolean;
  /** L'indicateur qui domine l'écran. Un seul par zone (§4.5). */
  emphasis?: boolean;
  className?: string;
}) {
  const body = (
    <Card interactive={!!href} className={cn('flex flex-col gap-2 p-4', className)}>
      {/* Titre + montant sont LIÉS : 8 px les séparent (§4.4) */}
      <p className="text-note font-bold uppercase tracking-wide text-muted dark:text-dark-muted">
        {label}
      </p>

      {loading ? (
        <span className="pp-skeleton block h-7 w-32 rounded-control" aria-hidden />
      ) : (
        <Money value={value} currency={currency} size={emphasis ? 'amount-lg' : 'amount'} />
      )}

      {(delta != null || note) && (
        <div className="flex items-center gap-2">
          {delta != null && !loading && <Delta percent={delta} />}
          {note && <span className="truncate text-note text-muted dark:text-dark-muted">{note}</span>}
        </div>
      )}
    </Card>
  );

  // La ligne entière est cliquable : pas de chevron pour le redire (§3.6).
  return href ? <Link href={href}>{body}</Link> : body;
}

/**
 * Une rangée d'indicateurs. Sur mobile : deux colonnes, une seule direction de
 * défilement (§5.3). Jamais une carte dans une carte (§5.5).
 */
export function StatRow({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">{children}</div>;
}
