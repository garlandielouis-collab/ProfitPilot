'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Comparaison mois contre mois — Bonus 7
//
// Le mois précédent dit si on progresse. Le même mois l'an dernier dit si la
// baisse est un problème ou simplement la saison — c'est cette deuxième
// lecture qui évite de paniquer (ou de se rassurer) à tort.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from 'react';
import { CalendarRange, Loader2, Minus, TrendingDown, TrendingUp } from 'lucide-react';
import { getMonthComparison, type MonthComparison } from '../../app/actions/pilotage';

const fmt = (n: number, currency: string): string =>
  `${new Intl.NumberFormat('fr-HT', { maximumFractionDigits: 0 }).format(n)} ${currency}`;

function Delta({ value }: { value: number | null }) {
  if (value === null) {
    return <span className="text-[11px] font-medium text-slate-400">— pa gen istorik</span>;
  }
  const flat = Math.abs(value) < 0.05;
  const up   = value > 0;
  const Icon = flat ? Minus : up ? TrendingUp : TrendingDown;
  const cls  = flat ? 'text-slate-400' : up ? 'text-[#50C878]' : 'text-red-500';

  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-semibold ${cls}`}>
      <Icon className="h-3 w-3" />
      {value > 0 ? '+' : ''}{value.toFixed(1)}%
    </span>
  );
}

const ROWS = [
  { key: 'revenue'     as const, label: 'Lajan antre' },
  { key: 'grossMargin' as const, label: 'Mòj brit' },
  { key: 'netProfit'   as const, label: 'Pwofi nèt' },
];

export function MonthComparisonCard() {
  const [data, setData]       = useState<MonthComparison | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    getMonthComparison()
      .then((res) => { if (!cancelled) setData(res); })
      .catch(() => { /* offre sans comparaison mensuelle */ })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center rounded-2xl border border-slate-200 bg-white py-16 dark:border-slate-800 dark:bg-slate-950">
        <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950">
      <div className="mb-4 flex items-center gap-2">
        <CalendarRange className="h-4 w-4 text-[#001F3F] dark:text-slate-300" />
        <h3 className="text-sm font-bold uppercase tracking-widest text-[#001F3F] dark:text-slate-300">
          Mwa sa a vs anvan
        </h3>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[11px] uppercase tracking-widest text-slate-400">
              <th className="pb-2 text-left font-medium">Endikatè</th>
              <th className="pb-2 text-right font-medium">Mwa sa a</th>
              <th className="pb-2 text-right font-medium">vs mwa pase</th>
              <th className="pb-2 text-right font-medium">vs ane pase</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {ROWS.map((row) => (
              <tr key={row.key}>
                <td className="py-2.5 text-slate-500">{row.label}</td>
                <td className="py-2.5 text-right font-bold text-[#001F3F] dark:text-slate-100">
                  {fmt(data.current[row.key], data.currency)}
                </td>
                <td className="py-2.5 text-right">
                  <Delta value={data.previousMonth ? data.momPercent[row.key] : null} />
                </td>
                <td className="py-2.5 text-right">
                  <Delta value={data.yoyPercent ? data.yoyPercent[row.key] : null} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {!data.yoyPercent && (
        <p className="mt-3 text-[11px] leading-relaxed text-slate-400">
          Nan yon ane, kolòn sa a ap montre ou sezon fò ak sezon fèb yo — pou ou
          prepare yo davans olye pou ou sibi yo.
        </p>
      )}
    </div>
  );
}
