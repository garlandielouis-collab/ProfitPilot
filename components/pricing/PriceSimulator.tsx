'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Simulateur « et si j'augmentais mes prix ? » — Bonus 2
//
// Le blocage n'est pas technique, il est psychologique : le marchand a peur de
// perdre des clients. On montre donc l'impact CHIFFRÉ avant d'agir, en tenant
// compte d'une perte de volume plausible.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Loader2, TrendingUp } from 'lucide-react';
import { toast } from 'sonner';
import { simulateProductPrice, type PriceSimulation } from '../../app/actions/profitability';
import { screenMessage, unwrap } from '../../lib/actionResult';

const fmt = (n: number, currency: string): string =>
  `${new Intl.NumberFormat('fr-HT', { maximumFractionDigits: 0 }).format(n)} ${currency}`;

const ELASTICITIES = [
  { value: 0.2, label: 'Clients fidèles' },
  { value: 0.5, label: 'Réaction moyenne' },
  { value: 1.0, label: 'Très sensibles au prix' },
];

export function PriceSimulator({ productId }: { productId: string }) {
  const [data, setData]             = useState<PriceSimulation | null>(null);
  const [loading, setLoading]       = useState(true);
  const [elasticity, setElasticity] = useState(0.5);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    simulateProductPrice(productId, [0, 5, 10, 15], elasticity)
      .then(unwrap)
      .then((res) => { if (!cancelled) setData(res); })
      .catch((err) => toast.error(screenMessage(err, 'Simulation impossible.')))
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [productId, elasticity]);

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center rounded-2xl border border-slate-200 bg-white py-12 dark:border-slate-800 dark:bg-slate-950">
        <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
      </div>
    );
  }

  if (!data) return null;

  const baseline = data.scenarios.find((s) => s.increasePercent === 0);

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950">
      <div className="flex items-center gap-3 bg-primary px-5 py-4">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent/20">
          <TrendingUp className="h-5 w-5 text-accent" />
        </div>
        <div className="min-w-0">
          <h3 className="truncate text-sm font-bold text-white">
            Et si j'augmentais le prix de « {data.name} » ?
          </h3>
          <p className="text-xs text-slate-300">
            {data.monthlyUnits} unité{data.monthlyUnits > 1 ? 's' : ''} vendue
            {data.monthlyUnits > 1 ? 's' : ''} sur 30 jours
          </p>
        </div>
      </div>

      <div className="space-y-4 p-5">
        <div className="flex flex-wrap gap-1.5">
          {ELASTICITIES.map((e) => (
            <button
              key={e.value}
              type="button"
              onClick={() => setElasticity(e.value)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                elasticity === e.value
                  ? 'bg-primary text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'
              }`}
            >
              {e.label}
            </button>
          ))}
        </div>

        {/* Sans taux saisi, un produit acheté ou vendu dans une autre devise
            que celle de l'entreprise ne se projette pas : aucun scénario. */}
        {(data.unconvertedCount ?? 0) > 0 && (
          <p className="rounded-xl bg-amber-50 px-3 py-2.5 text-xs text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
            Simulation indisponible : taux de change manquant pour ramener ce produit dans la devise de l’entreprise.{' '}
            <Link href="/settings" className="font-semibold underline underline-offset-2">
              Renseigner le taux
            </Link>
          </p>
        )}

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {data.scenarios.map((s) => {
            const isBase   = s.increasePercent === 0;
            const positive = s.marginDelta > 0;

            return (
              <div
                key={s.increasePercent}
                className={`rounded-2xl border p-4 transition ${
                  isBase
                    ? 'border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-900'
                    : positive
                      ? 'border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/30'
                      : 'border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30'
                }`}
              >
                <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
                  {isBase ? 'Aujourd’hui' : `+${s.increasePercent}%`}
                </p>
                <p className="mt-1 text-lg font-black tabular-nums text-primary dark:text-slate-100">
                  {fmt(s.newPrice, data.currency)}
                </p>
                <p className="mt-2 text-xs text-slate-500">Marge du mois</p>
                <p className="text-sm font-bold tabular-nums text-primary dark:text-slate-100">
                  {fmt(s.projectedMonthlyMargin, data.currency)}
                </p>

                {!isBase && (
                  <p
                    className={`mt-2 text-xs font-bold ${
                      positive ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
                    }`}
                  >
                    {positive ? '+' : ''}
                    {fmt(s.marginDelta, data.currency)}
                  </p>
                )}

                <p className="mt-1 text-note text-slate-400">
                  ≈ {s.projectedUnits} unité{s.projectedUnits > 1 ? 's' : ''}
                </p>
              </div>
            );
          })}
        </div>

        {baseline && (
          <p className="rounded-xl bg-slate-50 px-3 py-2.5 text-xs text-slate-600 dark:bg-slate-900 dark:text-slate-400">
            Hypothèse : chaque hausse de 1% fait perdre {(elasticity * 100).toFixed(0)}% de volume
            proportionnel. Même en perdant des clients, une hausse peut rapporter plus —
            c'est ce que montre la colonne « Marge du mois ».
          </p>
        )}
      </div>
    </div>
  );
}
