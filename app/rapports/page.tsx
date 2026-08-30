'use client';

/**
 * /rapports — Premium Financial Reports Hub
 * ProfitPilot · Apple × QuickBooks × Stripe aesthetic
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { WeeklyDigestCard } from '../../components/reports/WeeklyDigestCard';
import { ProtectedRoute } from '../../components/ProtectedRoute';
import { useLanguage } from '../../components/LanguageWrapper';
import { getReportsDataAction, type ReportPeriod } from '../actions/reports';
import { Button, FirstRun, NoResult } from '../../components/ds';

import IncomeStatement,   { type IncomeStatementData }  from '../../components/reports/IncomeStatement';
import BalanceSheet,      { type BalanceSheetData }      from '../../components/reports/BalanceSheet';
import CashFlowStatement, { type CashFlowData }          from '../../components/reports/CashFlowStatement';
import EquityStatement,   { type EquityStatementData }   from '../../components/reports/EquityStatement';
import { CalendarDays } from 'lucide-react';
import ReportActions, {
  ReportTypeSelector,
  PeriodPicker,
  type ReportType,
  type PeriodType,
} from '../../components/reports/ReportActions';

// ─────────────────────────────────────────────────────────────────
// Aucune donnée de démonstration ici — et c'est délibéré (audit §1.1, §5.10).
//
// Cet écran affichait quatre états financiers complets fabriqués de toutes
// pièces — 1 285 400 HTG de ventes, 245 800 HTG en banque — dès que la période
// choisie ne renvoyait rien. Un badge « Données démo » censé prévenir. Sauf que
// ces états s'impriment : le marchand pouvait sortir un PDF A4 « qualité
// comptable » de chiffres qui ne sont pas les siens et le porter à sa banque.
//
// « Dans un logiciel de gestion, un chiffre affiché est une promesse. »
//
// Les états sont donc nuls tant qu'ils n'existent pas — `null`, pas zéro : un
// bilan à zéro reste un bilan, et un exercice sans écriture n'en a pas. À la
// place, l'un des deux états vides du système, selon ce qui manque vraiment.
// ─────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────
// KPI card
// ─────────────────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  sub,
  trend,
  color,
}: {
  label: string;
  value: string;
  sub?: string;
  trend?: string;
  color: 'green' | 'red' | 'navy' | 'blue';
}) {
  const bg  = color === 'green' ? 'bg-accent-sub border-emerald-200' :
              color === 'red'   ? 'bg-danger-sub border-red-200' :
              color === 'blue'  ? 'bg-info-sub border-info-sub' :
                                  'bg-surface border-border';
  const vc  = color === 'green' ? 'text-accent-a' :
              color === 'red'   ? 'text-danger' :
              color === 'blue'  ? 'text-info' : 'text-anthracite';

  return (
    <div className={`rounded-xl md:rounded-2xl border-2 p-3 md:p-4 ${bg}`}>
      <p className="text-note md:text-note font-semibold uppercase tracking-[0.1em] text-muted line-clamp-2">{label}</p>
      <p className={`text-lg md:text-amount font-bold tabular-nums mt-1 md:mt-2 break-words ${vc}`}>{value}</p>
      {sub && <p className="text-note md:text-note text-slate-400 mt-1 md:mt-1 line-clamp-1">{sub}</p>}
      {trend && (
        <p className={`text-note md:text-note font-semibold mt-1 ${trend.startsWith('+') ? 'text-accent' : 'text-danger'}`}>
          {trend}
        </p>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────

function htg(v: number, currency: 'HTG' | 'USD' = 'HTG') {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(v);
}

function getCurrencyName(currency: 'HTG' | 'USD'): string {
  return currency === 'USD' ? 'Dollars Américains (USD)' : 'Gourdes Haïtiennes (HTG)';
}

// ─────────────────────────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────────────────────────

function RapportsPage() {
  const { t } = useLanguage();
  const currentYear = new Date().getFullYear();

  const [reportType, setReportType] = useState<ReportType>('income');
  const [period,     setPeriod]     = useState<PeriodType>('FY');
  const [year,       setYear]       = useState(currentYear);
  const [loading,    setLoading]    = useState(true);

  // ── Real data state ─────────────────────────────────────────────────────────
  const [companyName,  setCompanyName]  = useState('Mon Entreprise');
  const [companyPhone,  setCompanyPhone]  = useState('');
  const [companyAddress, setCompanyAddress] = useState('');
  const [companySector, setCompanySector] = useState('');
  const [companyTaxId, setCompanyTaxId] = useState('');
  const [periodLabel,  setPeriodLabel]  = useState(`Annuel ${currentYear}`);
  const [currency,     setCurrency]     = useState<'HTG' | 'USD'>('HTG');
  // `null` tant que la période n'a rien à montrer : voir l'encadré plus haut.
  const [incomeData,   setIncomeData]   = useState<IncomeStatementData  | null>(null);
  const [balanceData,  setBalanceData]  = useState<BalanceSheetData     | null>(null);
  const [cashflowData, setCashflowData] = useState<CashFlowData         | null>(null);
  const [equityData,   setEquityData]   = useState<EquityStatementData  | null>(null);
  const [kpi, setKpi] = useState({ caNet: 0, cogs: 0, netProfit: 0, cashTotal: 0 });

  // Les deux états vides (§5.10) : `hasAny` distingue le compte neuf — qui n'a
  // jamais rien enregistré — de l'exercice sans activité, où il suffit de
  // changer d'année. Deux écrans vides, deux messages, deux sorties.
  const [hasAny, setHasAny] = useState(true);

  // ── Print portal always mounted — no race condition ────────────────────────
  // Portal is a direct <body> child (#pp-print-root) so the CSS rule
  // body > *:not(#pp-print-root) { display:none } works reliably in print.
  // No state change needed on print click — window.print() fires immediately.
  const [isMounted, setIsMounted] = useState(false);
  useEffect(() => { setIsMounted(true); }, []);
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  const handleBeforePrint = useCallback(() => {}, []);

  // ── Re-fetch every time period or year changes ──────────────────────────────
  useEffect(() => {
    setLoading(true);
    getReportsDataAction(period as ReportPeriod, year)
      .then((d) => {
        if (!d) return;
        setCompanyName(d.businessName || 'Mon Entreprise');
        setPeriodLabel(d.periodLabel);
        setCurrency(d.currency);

        // Always set company info from the business profile
        setCompanyPhone(  d.businessPhone   ?? '');
        setCompanyAddress(d.businessAddress ?? '');
        setCompanySector( d.businessSector  ?? '');
        setCompanyTaxId(  d.businessTaxId   ?? '');

        setHasAny(d.hasAnyData);

        if (d.hasRealData) {
          setIncomeData(d.income);
          setBalanceData(d.balance);
          setCashflowData(d.cashflow);
          setEquityData(d.equity);
          setKpi(d.kpi);
        } else {
          // Rien sur la période : on ne remplit pas le vide, on le dit.
          setIncomeData(null);
          setBalanceData(null);
          setCashflowData(null);
          setEquityData(null);
          setKpi({ caNet: 0, cogs: 0, netProfit: 0, cashTotal: 0 });
        }
      })
      .catch(() => {
        // Une requête qui échoue ne prouve pas que le compte est vide : on
        // n'invente rien, on ne conclut rien, on n'affiche aucun état.
        setIncomeData(null);
        setBalanceData(null);
        setCashflowData(null);
        setEquityData(null);
        setKpi({ caNet: 0, cogs: 0, netProfit: 0, cashTotal: 0 });
      })
      .finally(() => setLoading(false));
  }, [period, year]); // ← refetch whenever period or year changes

  // Un état financier existe ou n'existe pas. Il n'y a pas d'entre-deux, et
  // surtout pas de version « pour donner une idée ».
  const hasReport = incomeData !== null && balanceData !== null
                 && cashflowData !== null && equityData !== null;

  const marge = kpi.caNet > 0
    ? (((kpi.caNet - kpi.cogs) / kpi.caNet) * 100).toFixed(1)
    : '0.0';

  const meta = useMemo(() => ({
    companyName,
    reportTitle: '',
    reportSubtitle: periodLabel,
    currency,
    phone:   companyPhone   || undefined,
    address: companyAddress || undefined,
    sector:  companySector  || undefined,
    taxId:   companyTaxId   || undefined,
    currentYear: year,
    previousYear: year - 1,
  }), [companyName, periodLabel, currency, companyPhone, companyAddress, companySector, companyTaxId, year]);

  if (loading) {
    return (
      <main className="min-h-screen bg-surface px-4 py-6">
        <div className="max-w-6xl mx-auto space-y-4 animate-pulse">
          <div className="h-28 bg-white rounded-3xl border border-border" />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[...Array(4)].map((_, i) => <div key={i} className="h-24 bg-white rounded-2xl border border-border" />)}
          </div>
          <div className="h-[600px] bg-white rounded-3xl border border-border" />
        </div>
      </main>
    );
  }

  return (
    <>
      <main className="min-h-screen bg-surface2 no-print">
        <div className="w-full max-w-full lg:max-w-[1160px] mx-auto px-3 md:px-4 py-4 md:py-6 space-y-4 md:space-y-6">

          {/* ── Page header ── */}
          <header className="bg-white rounded-2xl md:rounded-3xl border border-border p-4 md:p-6 flex flex-col gap-4 md:gap-0 md:flex-row md:items-center md:justify-between shadow-sm">
            <div className="min-w-0">
              {/* L'étiquette « Données démo » a disparu avec les données qu'elle
                  signalait. Un avertissement n'a jamais rendu un faux bilan vrai. */}
              <p className="mb-1 text-note md:text-note font-semibold uppercase tracking-[0.18em] text-accent">
                {t({ fr: 'Rapports Financiers', ht: 'Rapò Finansye' })}
              </p>
              <h1 className="text-xl md:text-amount font-bold text-anthracite leading-tight break-words">{companyName}</h1>
              <p className="text-note md:text-note text-muted mt-1">
                Exercice {new Date().getFullYear()} · Exprimé en {getCurrencyName(currency)}
              </p>
            </div>
            {/* Imprimer n'a de sens que s'il y a quelque chose à imprimer. */}
            {hasReport && (
              <ReportActions reportTitle={reportType} companyName={companyName} onBeforePrint={handleBeforePrint} />
            )}
          </header>

          {/* ── KPI strip ── */}
          {/* Quatre indicateurs à zéro ne sont pas une information : c'est un
              écran qui fait semblant de fonctionner. Ils attendent leur période. */}
          {hasReport && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 md:gap-3">
              <KpiCard label={t({ fr: 'Chiffre d\'affaires', ht: 'Chif afè' })} value={htg(kpi.caNet, currency)}     sub={`Exercice ${new Date().getFullYear()}`} color="navy"  />
              <KpiCard label={t({ fr: 'Marge brute', ht: 'Maj brit' })}        value={`${marge}%`}        sub={htg(kpi.caNet - kpi.cogs, currency)}              color="green" />
              <KpiCard label={t({ fr: 'Résultat net', ht: 'Rezilta nèt' })}        value={htg(kpi.netProfit, currency)} sub={`Exercice ${new Date().getFullYear()}`} color={kpi.netProfit >= 0 ? 'green' : 'red'} />
              <KpiCard label={t({ fr: 'Trésorerie totale', ht: 'Trezoreri total' })}  value={htg(kpi.cashTotal, currency)} sub={t({ fr: 'Disponible', ht: 'Disponib' })}                             color="blue"  />
            </div>
          )}

          {/* ── Rapport hebdo WhatsApp (Bonus 1) + dossier crédit (Bonus 5) ── */}
          <div className="grid gap-4 lg:grid-cols-2">
            <WeeklyDigestCard />
            <Link
              href="/rapports/credit"
              className="flex flex-col justify-between rounded-2xl border border-border bg-white p-5 shadow-sm transition hover:border-primary/30 hover:shadow-md"
            >
              <div>
                <p className="text-note font-semibold uppercase tracking-widest text-accent">
                  {t({ fr: 'Financement', ht: 'Finansman' })}
                </p>
                <h3 className="mt-1 text-lg font-bold text-anthracite">
                  {t({ fr: 'Dossier crédit & microfinance', ht: 'Dosye kredi & mikwofinans' })}
                </h3>
                <p className="mt-1 text-note leading-relaxed text-muted">
                  {t({
                    fr: "Historique de chiffre d'affaires et de marge, hors dépenses personnelles — dans un format qu'une banque peut lire.",
                    ht: 'Istorik chif dafè ak mòj, san depans pèsonèl — nan yon fòma yon bank ka li.',
                  })}
                </p>
              </div>
              <span className="mt-4 inline-flex w-fit items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white">
                {t({ fr: 'Générer le dossier', ht: 'Jenere dosye a' })} →
              </span>
            </Link>
          </div>

          {/* ── Period selector ── */}
          <div className="bg-white rounded-2xl border border-border px-5 py-4 shadow-sm">
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                  <p className="text-note font-semibold text-muted uppercase tracking-wider">
                    {t({ fr: "Période d'analyse", ht: 'Periyòd analiz' })}
                  </p>
                <div className="flex items-center gap-2">
                  {loading && (
                    <svg className="h-4 w-4 animate-spin text-accent" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                    </svg>
                  )}
                  {/* Year selector */}
                  <select
                    value={year}
                    onChange={(e) => setYear(Number(e.target.value))}
                    className="rounded-lg border border-border bg-white px-3 py-1.5 text-note font-semibold text-anthracite outline-none focus:border-accent focus:ring-1 focus:ring-accent"
                  >
                    {[currentYear, currentYear - 1, currentYear - 2].map(y => (
                      <option key={y} value={y}>{y}</option>
                    ))}
                  </select>
                </div>
              </div>
              <PeriodPicker active={period} onChange={setPeriod} />
              {/* Active period label */}
              <p className="text-note text-slate-400">
                <CalendarDays className="mr-1 inline h-4 w-4 align-[-3px]" strokeWidth={1.8} aria-hidden />
                {periodLabel}
              </p>
            </div>
          </div>

          {/* ── Report type tabs ── */}
          {/* Choisir entre quatre états qui n'existent pas n'a pas de sens. */}
          {hasReport && <ReportTypeSelector active={reportType} onChange={setReportType} />}

          {/* ── Report preview (A4) ── */}
          {hasReport && (
            <div className="relative flex justify-center w-full">
              {/* Overlay spinner on period change */}
              {loading && (
                <div className="absolute inset-0 z-10 flex items-center justify-center rounded-2xl bg-white/70 backdrop-blur-sm">
                  <div className="flex flex-col items-center gap-3">
                    <svg className="h-8 w-8 animate-spin text-accent" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                    </svg>
                    <p className="text-note font-medium text-muted">{t({ fr: 'Chargement des données…', ht: 'Chajman done yo…' })}</p>
                  </div>
                </div>
              )}
              <div className="w-full overflow-x-auto overflow-y-visible rounded-2xl shadow-xl" style={{ maxWidth: '210mm' }}>
                {reportType === 'income'   && incomeData   && <IncomeStatement   meta={meta} data={incomeData}   showPrevious />}
                {reportType === 'balance'  && balanceData  && <BalanceSheet       meta={meta} data={balanceData}  showPrevious />}
                {reportType === 'cashflow' && cashflowData && <CashFlowStatement  meta={meta} data={cashflowData} showPrevious />}
                {reportType === 'equity'   && equityData   && <EquityStatement    meta={meta} data={equityData}   />}
              </div>
            </div>
          )}

          {/* ── Les deux états vides (§5.10) ──────────────────────────────────
              Ni l'un ni l'autre n'est un écran raté : ce sont les deux seules
              réponses honnêtes quand il n'y a pas d'états financiers à montrer.
              Le sélecteur de période est juste au-dessus — la sortie est là. */}
          {!hasReport && !loading && (
            hasAny ? (
              // Le commerce tourne, mais pas sur cet exercice. On le dit, et on
              // ramène en un geste vers l'année en cours.
              <NoResult
                query={periodLabel}
                noun={t({ fr: 'mouvement', ht: 'mouvman' })}
                action={
                  year !== currentYear || period !== 'FY' ? (
                    <Button
                      variant="primary"
                      onClick={() => { setYear(currentYear); setPeriod('FY'); }}
                    >
                      {t({ fr: "Voir l'exercice " + currentYear, ht: 'Gade ane ' + currentYear })}
                    </Button>
                  ) : undefined
                }
              />
            ) : (
              // Compte neuf : aucun bilan n'existe encore, et aucun ne sera
              // inventé. On montre le geste qui les fera naître.
              <FirstRun
                title={t({
                  fr: 'Vos états financiers se construiront ici',
                  ht: 'Eta finansye ou yo ap bati isit la',
                })}
                hint={t({
                  fr: "Compte de résultat, bilan, trésorerie : chacun se remplit tout seul à partir de vos ventes et de vos dépenses. Enregistrez la première, et l'exercice commence.",
                  ht: 'Kont rezilta, bilan, trezoreri : chak youn ap ranpli pou kont li ak vant ak depans ou yo. Anrejistre premye a, ane a kòmanse.',
                })}
                action={
                  <Link href="/sales" className="block">
                    <Button variant="accent" block>
                      {t({ fr: 'Enregistrer une vente', ht: 'Anrejistre yon vant' })}
                    </Button>
                  </Link>
                }
              />
            )
          )}

          {/* ── Bottom action bar ── */}
          {hasReport && (
            <div className="bg-white rounded-3xl border border-border p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 shadow-sm">
              <div>
                <p className="text-note font-semibold text-anthracite">{t({ fr: 'Télécharger tous les états financiers', ht: 'Telechaje tout eta finansye yo' })}</p>
                <p className="text-note text-slate-400 mt-1">{t({ fr: 'PDF A4 · Prêt à l\'impression · Qualité comptable', ht: 'PDF A4 · Pare pou enprime · Kalite kontab' })}</p>
              </div>
              <ReportActions reportTitle={t({ fr: 'Pack complet', ht: 'Pake konplè' })} companyName={companyName} onBeforePrint={handleBeforePrint} />
            </div>
          )}

        </div>
      </main>

      {/* ── Print portal — mounted as direct <body> child ── */}
      {/* CSS: #pp-print-root { display:none } on screen                    */}
      {/* CSS: body > *:not(#pp-print-root) { display:none } on print       */}
      {/* Le portail ne se monte que s'il y a un exercice réel à imprimer :
          c'est par lui que passaient les PDF « qualité comptable » fabriqués. */}
      {isMounted && incomeData && balanceData && cashflowData && equityData && createPortal(
        <div id="pp-print-root">
          <IncomeStatement   meta={meta} data={incomeData}   showPrevious />
          <BalanceSheet       meta={meta} data={balanceData}  showPrevious />
          <CashFlowStatement  meta={meta} data={cashflowData} showPrevious />
          <EquityStatement    meta={meta} data={equityData}   />
        </div>,
        document.body
      )}
    </>
  );
}

export default function RapportsPageWrapper() {
  return (
    <ProtectedRoute>
      <RapportsPage />
    </ProtectedRoute>
  );
}
