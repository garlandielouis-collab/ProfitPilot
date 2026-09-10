'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Les produits les plus vendus — §9, §17, §35
//
// Le §9 fixe trois colonnes : Produit · Unités · Revenue. Kwasans et Elit y
// ajoutent la marge, parce qu'à partir de « je pilote », le produit qui vend le
// plus n'est plus forcément le produit qui rapporte le plus — et c'est
// exactement l'écart qu'il faut voir.
//
// La marge vaut `null` quand le prix d'achat n'a jamais été renseigné. On
// écrit alors « — », jamais « 100 % » : un produit sans coût connu n'a pas une
// marge parfaite, il a une marge inconnue (§51).
//
// Un tableau qui déborde défile DANS son conteneur, jamais avec la page (§47).
// ─────────────────────────────────────────────────────────────────────────────

import Link from 'next/link';
import { Card, Money } from '../../ds';
import type { TopProductRow } from '../../../app/actions/dashboard';

export function TopProducts({
  rows,
  currency = 'HTG',
  showMargin = false,
  labels,
  loading = false,
}: {
  rows: TopProductRow[];
  currency?: string;
  showMargin?: boolean;
  labels: {
    product: string;
    units: string;
    revenue: string;
    margin: string;
    empty: string;
    emptyAction: string;
  };
  loading?: boolean;
}) {
  if (loading) {
    return (
      <Card className="space-y-2 p-4" aria-hidden>
        {[0, 1, 2].map((i) => <span key={i} className="pp-skeleton block h-10 rounded-control" />)}
      </Card>
    );
  }

  if (rows.length === 0) {
    return (
      <Card className="px-4 py-8 text-center">
        <p className="text-body text-text2 dark:text-dark-text2">{labels.empty}</p>
        <Link
          href="/products"
          className="pressable mt-2 inline-flex min-h-touch items-center text-body font-bold text-primary underline underline-offset-4 dark:text-dark-text"
        >
          {labels.emptyAction}
        </Link>
      </Card>
    );
  }

  return (
    <Card>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[22rem] border-collapse">
          <thead>
            <tr className="border-b border-border dark:border-dark-border">
              <th className="px-4 py-2 text-left text-note font-bold uppercase tracking-wide text-muted dark:text-dark-muted">
                {labels.product}
              </th>
              <th className="px-4 py-2 text-right text-note font-bold uppercase tracking-wide text-muted dark:text-dark-muted">
                {labels.units}
              </th>
              <th className="px-4 py-2 text-right text-note font-bold uppercase tracking-wide text-muted dark:text-dark-muted">
                {labels.revenue}
              </th>
              {showMargin && (
                <th className="px-4 py-2 text-right text-note font-bold uppercase tracking-wide text-muted dark:text-dark-muted">
                  {labels.margin}
                </th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-border dark:divide-dark-border">
            {rows.map((row) => (
              <tr key={row.id}>
                <td className="max-w-[12rem] truncate px-4 py-2 text-body text-primary dark:text-dark-text">
                  {row.name}
                </td>
                <td className="amount px-4 py-2 text-right text-body text-text2 dark:text-dark-text2">
                  {row.units}
                </td>
                <td className="px-4 py-2 text-right">
                  <Money value={row.revenue} currency={currency} size="body" />
                </td>
                {showMargin && (
                  <td className="amount px-4 py-2 text-right text-body text-text2 dark:text-dark-text2">
                    {row.marginPct === null ? '—' : `${row.marginPct.toFixed(1)} %`}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
