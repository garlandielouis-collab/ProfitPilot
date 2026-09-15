'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Dossier de crédit / microfinance — Bonus 5
//
// L'accès au financement est l'un des plus gros obstacles des marchands
// informels. Ce document ne cherche pas à être joli : il doit être LISIBLE par
// un agent de crédit — historique mensuel, marge, et surtout la mention
// explicite que les dépenses personnelles sont exclues du résultat.
//
// Rendu papier via react-to-print : le PDF sort de la boîte d'impression du
// navigateur, sans dépendance serveur ni police à embarquer.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState } from 'react';
import { useReactToPrint } from 'react-to-print';
import { FileText, Loader2, Printer } from 'lucide-react';
import { getCreditFile, type CreditFile } from '../../app/actions/pilotage';
import { screenMessage } from '../../lib/actionResult';

const fmt = (n: number, currency: string): string =>
  `${new Intl.NumberFormat('fr-HT', { maximumFractionDigits: 0 }).format(n)} ${currency}`;

const monthLabel = (iso: string): string =>
  new Date(`${iso.slice(0, 7)}-01T00:00:00`).toLocaleDateString('fr-FR', {
    month: 'long',
    year: 'numeric',
  });

export function CreditFileReport({ months = 12 }: { months?: number }) {
  const [file, setFile]       = useState<CreditFile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');
  const sheetRef              = useRef<HTMLDivElement>(null);

  const print = useReactToPrint({
    contentRef: sheetRef,
    documentTitle: file ? `ProfitPilot — ${file.businessName}` : 'ProfitPilot',
  });

  useEffect(() => {
    let cancelled = false;
    getCreditFile(months)
      .then((res) => { if (!cancelled) setFile(res); })
      .catch((e) => { if (!cancelled) setError(screenMessage(e, 'Chajman enposib.')); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [months]);

  if (loading) {
    return (
      <div className="flex items-center justify-center rounded-2xl border border-slate-200 bg-white py-16 dark:border-slate-800 dark:bg-slate-950">
        <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
      </div>
    );
  }

  if (error || !file) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-800">
        {error || 'Dosye a pa disponib.'}
      </div>
    );
  }

  const { totals } = file;

  return (
    <div className="space-y-4">
      <button
        onClick={() => print()}
        className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-primary-h active:scale-95 print:hidden"
      >
        <Printer className="h-4 w-4" />
        Enprime / Sove an PDF
      </button>

      {/* La feuille imprimée : fond blanc et texte noir quel que soit le thème. */}
      <div
        ref={sheetRef}
        className="rounded-2xl border border-slate-200 bg-white p-8 text-slate-900 print:rounded-none print:border-0 print:p-0 print:shadow-none"
      >
        <header className="flex items-start justify-between border-b-2 border-primary pb-4">
          <div>
            <p className="text-note font-bold uppercase tracking-[0.3em] text-primary/60">
              Dosye finansye
            </p>
            <h2 className="mt-1 text-2xl font-black text-primary">{file.businessName}</h2>
            {file.ownerName && (
              <p className="mt-0.5 text-sm text-slate-600">Responsab : {file.ownerName}</p>
            )}
          </div>
          <div className="text-right text-xs text-slate-500">
            <p className="flex items-center justify-end gap-1.5 font-semibold text-primary">
              <FileText className="h-3.5 w-3.5" />
              ProfitPilot
            </p>
            <p className="mt-1">
              Jenere {new Date(file.generatedAt).toLocaleDateString('fr-FR', {
                day: '2-digit', month: 'long', year: 'numeric',
              })}
            </p>
            <p>{file.months.length} mwa istorik</p>
          </div>
        </header>

        {/* Synthèse */}
        <section className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[
            { label: 'Chif dafè total',    value: fmt(totals.revenue, file.currency) },
            { label: 'Mòj brit',           value: fmt(totals.grossMargin, file.currency) },
            { label: 'Mwayèn pa mwa',      value: fmt(totals.averageMonthlyRevenue, file.currency) },
            { label: 'To mòj',             value: `${totals.marginPercent.toFixed(1)}%` },
          ].map((s) => (
            <div key={s.label} className="rounded-xl border border-slate-200 p-3">
              <p className="text-note font-semibold uppercase tracking-widest text-slate-400">
                {s.label}
              </p>
              <p className="mt-1 text-lg font-black text-primary">{s.value}</p>
            </div>
          ))}
        </section>

        {/* Historique mensuel */}
        <section className="mt-6">
          <h3 className="mb-2 text-sm font-bold uppercase tracking-widest text-primary">
            Istorik mansyèl
          </h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-300 text-note uppercase tracking-widest text-slate-500">
                <th className="py-2 text-left font-semibold">Mwa</th>
                <th className="py-2 text-right font-semibold">Chif dafè</th>
                <th className="py-2 text-right font-semibold">Mòj brit</th>
                <th className="py-2 text-right font-semibold">Depans biznis</th>
                <th className="py-2 text-right font-semibold">Rezilta nèt</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {file.months.map((m) => (
                <tr key={m.periodStart}>
                  <td className="py-2 capitalize text-slate-700">{monthLabel(m.periodStart)}</td>
                  <td className="py-2 text-right tabular-nums">{fmt(m.revenue, file.currency)}</td>
                  <td className="py-2 text-right tabular-nums">{fmt(m.grossMargin, file.currency)}</td>
                  <td className="py-2 text-right tabular-nums">{fmt(m.businessExpenses, file.currency)}</td>
                  <td className="py-2 text-right font-semibold tabular-nums">
                    {fmt(m.netProfit, file.currency)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-primary font-bold text-primary">
                <td className="py-2">Total</td>
                <td className="py-2 text-right tabular-nums">{fmt(totals.revenue, file.currency)}</td>
                <td className="py-2 text-right tabular-nums">{fmt(totals.grossMargin, file.currency)}</td>
                <td className="py-2 text-right tabular-nums">{fmt(totals.businessExpenses, file.currency)}</td>
                <td className="py-2 text-right tabular-nums">{fmt(totals.netProfit, file.currency)}</td>
              </tr>
            </tfoot>
          </table>
        </section>

        {/* Créances + score */}
        <section className="mt-6 grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl border border-slate-200 p-4">
            <h4 className="text-note font-bold uppercase tracking-widest text-slate-500">
              Kredi kliyan
            </h4>
            <p className="mt-2 text-sm text-slate-700">
              Ann atant : <b>{fmt(file.receivables.open, file.currency)}</b>
            </p>
            <p className="text-sm text-slate-700">
              An reta : <b>{fmt(file.receivables.overdue, file.currency)}</b>
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 p-4">
            <h4 className="text-note font-bold uppercase tracking-widest text-slate-500">
              Skò sante finansye
            </h4>
            <p className="mt-2 text-2xl font-black text-primary">
              {file.healthScore === null ? '—' : `${file.healthScore} / 100`}
            </p>
          </div>
        </section>

        <footer className="mt-6 border-t border-slate-200 pt-3 text-note leading-relaxed text-slate-500">
          Chif sa yo soti dirèkteman nan vant ak depans ki anrejistre nan ProfitPilot.
          <b> Depans pèsonèl yo pa konte nan rezilta biznis la</b> — se sèlman aktivite
          antrepriz la ki parèt isit.
        </footer>
      </div>
    </div>
  );
}
