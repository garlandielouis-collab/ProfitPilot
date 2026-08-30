'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Les indicateurs — la santé du jour, et rien d'autre en premier (§6.2)
//
// Avant : douze cartes d'indicateurs, chacune avec son halo coloré, son icône
// en pastille teintée et sa courbe. Sur les douze, huit affichaient une courbe
// FABRIQUÉE — `Math.sin(i)` et `Math.random()` déguisés en historique. C'est
// exactement ce que l'audit interdit : « dans un logiciel de gestion, un chiffre
// affiché est une promesse ». Une courbe inventée est une promesse rompue.
//
// Après : trois indicateurs dominants — ventes, marge, trésorerie — avec la
// seule courbe qu'on puisse tracer honnêtement (celle du flux réel de la
// période), puis le reste en une liste compacte. Aucune carte dans une carte
// (§5.5) : le second bloc est UNE carte qui porte des lignes, pas six cartes.
// ─────────────────────────────────────────────────────────────────────────────

import Link from 'next/link';
import { Card, Money, Stat } from '../ds';
import { chartColors } from '../../theme.config';

export type KpiTotals = {
  cashIn: number;
  cashOut: number;
  profit: number;
  debtTotal: number;
};

export type SecondaryRow = {
  label: string;
  /** Un montant en gourdes, ou un simple décompte. */
  value: number;
  currency?: string;
  href: string;
  /** Vrai quand la valeur réclame l'attention — le rouge système, alors (§4.2). */
  alert?: boolean;
};

export function KpiSection({
  totals,
  marginPct,
  currency = 'HTG',
  trend,
  secondary,
  loading,
  labels,
}: {
  totals: KpiTotals;
  marginPct: number;
  currency?: string;
  /** Les trois courbes, tirées du flux réel. Vides tant qu'il n'y a rien. */
  trend: { revenue: number[]; profit: number[]; cash: number[] };
  secondary: SecondaryRow[];
  loading: boolean;
  labels: {
    revenue: string; profit: string; cash: string;
    margin: string; spent: string; rest: string;
  };
}) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {/* La dominante de l'écran : ce qui est entré. Un seul indicateur en
            grande taille — s'il y en avait trois, il n'y en aurait aucun (§4.5). */}
        <Stat
          emphasis
          href="/sales"
          label={labels.revenue}
          value={totals.cashIn}
          currency={currency}
          note={labels.spent}
          loading={loading}
          className="sm:col-span-1"
        />
        <Stat
          href="/rapports"
          label={labels.profit}
          value={totals.profit}
          currency={currency}
          note={`${labels.margin} ${marginPct.toFixed(1)} %`}
          loading={loading}
        />
        <Stat
          href="/rapports"
          label={labels.cash}
          value={totals.cashIn - totals.cashOut}
          currency={currency}
          loading={loading}
        />
      </div>

      {/* La courbe de la période : un seul trait, gris, sans aire ni dégradé.
          Elle dit « ça monte » ou « ça descend » et laisse le montant être la
          vedette (§3.8). Elle n'apparaît que si les points existent vraiment. */}
      {!loading && trend.cash.length > 1 && (
        <Card className="px-4 py-3">
          <TrendLine data={trend.cash} />
        </Card>
      )}

      {/* Le reste : une carte, des lignes. Pas six cartes de plus (§5.5). */}
      {secondary.length > 0 && (
        <Card>
          <p className="px-4 pt-4 text-note font-bold uppercase tracking-wide text-muted dark:text-dark-muted">
            {labels.rest}
          </p>
          <ul className="divide-y divide-border dark:divide-dark-border">
            {secondary.map((row) => (
              <li key={row.label}>
                <Link
                  href={row.href}
                  className="pressable flex min-h-touch items-center justify-between gap-4 px-4 py-2"
                >
                  <span className="min-w-0 truncate text-body text-text2 dark:text-dark-text2">
                    {row.label}
                  </span>
                  {row.currency ? (
                    <Money
                      value={row.value}
                      currency={row.currency}
                      size="body"
                      tone={row.alert ? 'down' : 'default'}
                    />
                  ) : (
                    <span
                      className={`amount text-body font-bold ${
                        row.alert ? 'text-danger' : 'text-primary dark:text-dark-text'
                      }`}
                    >
                      {row.value}
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

/** Un trait, une couleur, pas d'aire. La tendance, pas la décoration (§3.8). */
function TrendLine({ data }: { data: number[] }) {
  const max = Math.max(...data);
  const min = Math.min(...data);
  const span = max - min || 1;
  const points = data
    .map((v, i) => `${(i / (data.length - 1)) * 100},${30 - ((v - min) / span) * 28}`)
    .join(' ');

  return (
    <svg viewBox="0 0 100 32" preserveAspectRatio="none" className="h-8 w-full" aria-hidden>
      <polyline
        points={points}
        fill="none"
        stroke={chartColors.data}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
