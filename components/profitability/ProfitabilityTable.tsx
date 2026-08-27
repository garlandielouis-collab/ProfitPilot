'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Classement des produits par rentabilité — Diagnostic 5
//
// « J'ai beaucoup de produits, mais je ne sais pas lesquels me rapportent. »
// Le tri se fait sur la MARGE TOTALE générée, jamais sur le volume vendu :
// c'est le seul classement qui réoriente le capital vers ce qui rapporte.
//
// Les produits en stock jamais vendus apparaissent aussi (verdict « dormant ») —
// c'est du capital immobilisé que le marchand ne voit nulle part ailleurs.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ArrowUpRight, Loader2, PackageX, TrendingDown, TrendingUp, AlertTriangle,
} from 'lucide-react';
import {
  getProductProfitability,
  type ProductRanking,
  type ProfitabilityReport,
} from '../../app/actions/profitability';

const fmt = (n: number, currency: string): string =>
  `${new Intl.NumberFormat('fr-HT', { maximumFractionDigits: 0 }).format(n)} ${currency}`;

const VERDICT: Record<
  ProductRanking['verdict'],
  { label: string; hint: string; className: string; icon: React.ReactNode }
> = {
  pousser: {
    label: 'Pouse l',
    hint: 'Bon mòj — mete plis kapital ladan l',
    className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400',
    icon: <TrendingUp className="h-3 w-3" />,
  },
  surveiller: {
    label: 'Siveye',
    hint: 'Mòj mwayen — kenbe je sou li',
    className: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400',
    icon: <AlertTriangle className="h-3 w-3" />,
  },
  reduire: {
    label: 'Redwi',
    hint: 'Mòj twò fèb — ogmante pri a oswa sispann',
    className: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400',
    icon: <TrendingDown className="h-3 w-3" />,
  },
  dormant: {
    label: 'Kapital dòmi',
    hint: 'Nan stock men pa janm vann — lajan bloke',
    className: 'bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
    icon: <PackageX className="h-3 w-3" />,
  },
};

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950">
      <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">{label}</p>
      <p className="mt-1 text-xl font-black text-[#001F3F] dark:text-slate-100">{value}</p>
      {sub && <p className="mt-0.5 text-[11px] leading-relaxed text-slate-400">{sub}</p>}
    </div>
  );
}

export function ProfitabilityTable() {
  const [report, setReport]   = useState<ProfitabilityReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');

  useEffect(() => {
    let cancelled = false;
    getProductProfitability()
      .then((res) => { if (!cancelled) setReport(res); })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : 'Chajman enposib.'); })
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

  if (error) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-800">
        {error}
      </div>
    );
  }

  if (!report || report.items.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center dark:border-slate-700 dark:bg-slate-950">
        <p className="text-sm font-semibold text-[#001F3F] dark:text-slate-200">
          Pa gen ase vant pou klase pwodwi yo ankò.
        </p>
        <p className="mt-1 text-sm text-slate-500">
          Anrejistre kèk vant : klasman an ap parèt otomatikman.
        </p>
        <Link
          href="/sales"
          className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-[#001F3F] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#002D5B]"
        >
          Ale nan vant yo
          <ArrowUpRight className="h-4 w-4" />
        </Link>
      </div>
    );
  }

  const dormant = report.items.filter((i) => i.verdict === 'dormant');
  const toCut   = report.items.filter((i) => i.verdict === 'reduire');

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat
          label="Mòj total"
          value={fmt(report.totalMargin, report.currency)}
          sub="Sa tout pwodwi yo rapòte ansanm"
        />
        <Stat
          label="Konsantrasyon"
          value={`${report.top3SharePercent.toFixed(0)}%`}
          sub="Pati 3 premye pwodwi yo nan mòj la"
        />
        <Stat
          label="Kapital dòmi"
          value={String(dormant.length)}
          sub={dormant.length > 0 ? 'Pwodwi nan stock ki pa janm vann' : 'Anyen bloke nan stock la'}
        />
      </div>

      {toCut.length > 0 && (
        <div className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 dark:border-red-900 dark:bg-red-950/30">
          <TrendingDown className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
          <p className="text-sm text-red-800 dark:text-red-300">
            <b>{toCut.length} pwodwi</b> gen yon mòj twò fèb. Lajan ou mete ladan yo
            ta rapòte plis nan pwodwi ki make « Pouse l ».
          </p>
        </div>
      )}

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-[#001F3F] text-white">
            <tr className="text-[11px] uppercase tracking-widest">
              <th className="px-4 py-3 text-left font-semibold">Pwodwi</th>
              <th className="px-4 py-3 text-right font-semibold">Inite vandi</th>
              <th className="px-4 py-3 text-right font-semibold">Lajan antre</th>
              <th className="px-4 py-3 text-right font-semibold">Mòj total</th>
              <th className="px-4 py-3 text-right font-semibold">Mòj %</th>
              <th className="px-4 py-3 text-left font-semibold">Sa pou fè</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {report.items.map((item) => {
              const v = VERDICT[item.verdict];
              return (
                <tr key={item.productId} className="transition hover:bg-slate-50 dark:hover:bg-slate-900">
                  <td className="px-4 py-3">
                    <p className="font-semibold text-[#001F3F] dark:text-slate-100">{item.name}</p>
                    <p className="text-[11px] text-slate-400">
                      {item.stockQuantity} an stock
                      {item.stockQuantity > 0 && item.stockQuantity <= item.reorderPoint && ' · sèy rekòmand rive'}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-slate-600 dark:text-slate-300">
                    {item.unitsSold}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-slate-600 dark:text-slate-300">
                    {fmt(item.revenue, report.currency)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums font-bold text-[#001F3F] dark:text-slate-100">
                    {fmt(item.grossMargin, report.currency)}
                  </td>
                  <td className={item.marginPct < 0
                    ? 'px-4 py-3 text-right tabular-nums font-semibold text-red-600'
                    : 'px-4 py-3 text-right tabular-nums font-semibold text-slate-600 dark:text-slate-300'}
                  >
                    {item.marginPct.toFixed(1)}%
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${v.className}`}>
                      {v.icon}
                      {v.label}
                    </span>
                    <p className="mt-0.5 text-[10.5px] text-slate-400">{v.hint}</p>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
