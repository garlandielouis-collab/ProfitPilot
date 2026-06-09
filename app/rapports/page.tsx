'use client';

/**
 * /rapports — Premium Financial Reports Hub
 * ProfitPilot · Apple × QuickBooks × Stripe aesthetic
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { ProtectedRoute } from '../../components/ProtectedRoute';
import { useLanguage } from '../../components/LanguageWrapper';
import { getReportsDataAction, type ReportPeriod } from '../actions/reports';

import IncomeStatement,   { type IncomeStatementData }  from '../../components/reports/IncomeStatement';
import BalanceSheet,      { type BalanceSheetData }      from '../../components/reports/BalanceSheet';
import CashFlowStatement, { type CashFlowData }          from '../../components/reports/CashFlowStatement';
import EquityStatement,   { type EquityStatementData }   from '../../components/reports/EquityStatement';
import ReportActions, {
  ReportTypeSelector,
  PeriodPicker,
  type ReportType,
  type PeriodType,
} from '../../components/reports/ReportActions';

// ─────────────────────────────────────────────────────────────────
// Demo data (realistic Haitian boutique / fashion business)
// Replace with real fn_income_statement() / fn_balance_sheet() calls
// ─────────────────────────────────────────────────────────────────

const DEMO_INCOME: IncomeStatementData = {
  ventesMarchandises:     1_285_400,
  prestationsServices:       82_000,
  autresRevenus:             31_200,
  retoursRabais:             18_500,

  achatsMarchandises:       584_200,
  variationStock:           -12_400,
  transportAchat:            22_600,

  loyers:                    85_000,
  salaires:                 180_000,
  chargesSociales:           18_000,
  marketing:                 32_000,
  transport:                 21_000,
  electriciteInternet:       18_600,
  fraisBancaires:             8_200,
  autresCharges:             24_000,
  dotationsAmortissements:   14_400,

  produitsFinanciers:         4_200,
  chargesFinancieres:        12_800,
  impotTaxes:                28_500,

  prev: {
    ventesMarchandises:     1_120_000,
    prestationsServices:       64_000,
    autresRevenus:             21_000,
    retoursRabais:             14_200,

    achatsMarchandises:       512_000,
    variationStock:             8_000,
    transportAchat:            18_000,

    loyers:                    80_000,
    salaires:                 160_000,
    chargesSociales:           16_000,
    marketing:                 24_000,
    transport:                 18_000,
    electriciteInternet:       16_200,
    fraisBancaires:             7_100,
    autresCharges:             19_000,
    dotationsAmortissements:   12_000,

    produitsFinanciers:         2_800,
    chargesFinancieres:        14_200,
    impotTaxes:                22_000,
  },
};

const DEMO_BALANCE: BalanceSheetData = {
  terrains:                  250_000,
  batimentsConstruct:              0,
  materielInformatique:       65_000,
  mobilierBureau:             42_000,
  vehicules:                 280_000,
  autresImmobilisations:      18_000,
  amortissementsCumules:      96_000,

  stocksMarchandises:        562_400,
  creancesClients:           184_200,
  avancesFournisseurs:        12_000,
  tresoreriebanque:          245_800,
  tresorerieMonCash:          68_400,
  tresorerieNatcash:          22_100,
  tresorerieCaisse:           45_200,
  autresActifsCourants:        8_600,

  capitalSocial:             500_000,
  apportsProprio:            150_000,
  reservesLegales:            48_000,
  reportANouveau:            180_400,
  resultatExercice:          358_700,  // net income from P&L
  prelevementsProprietaire:   96_000,

  empruntsBancairesLT:       350_000,
  pretesLT:                       0,
  dettesImmobilisations:           0,

  detteFournisseurs:         228_400,
  salairesPayer:              15_000,
  onaPayer:                    3_600,
  taxesPayer:                 28_500,
  chargesPayer:                8_200,
  avancesClients:             24_800,
  autresPassifsCourants:       5_600,

  prev: {
    terrains:                  250_000,
    batimentsConstruct:              0,
    materielInformatique:       72_000,
    mobilierBureau:             42_000,
    vehicules:                 280_000,
    autresImmobilisations:      12_000,
    amortissementsCumules:      81_600,

    stocksMarchandises:        504_800,
    creancesClients:           148_600,
    avancesFournisseurs:         8_000,
    tresoreriebanque:          182_400,
    tresorerieMonCash:          42_100,
    tresorerieNatcash:          14_200,
    tresorerieCaisse:           38_600,
    autresActifsCourants:        6_200,

    capitalSocial:             500_000,
    apportsProprio:            100_000,
    reservesLegales:            36_000,
    reportANouveau:            112_000,
    resultatExercice:          296_800,
    prelevementsProprietaire:   80_000,

    empruntsBancairesLT:       420_000,
    pretesLT:                       0,
    dettesImmobilisations:           0,

    detteFournisseurs:         194_200,
    salairesPayer:              13_500,
    onaPayer:                    3_200,
    taxesPayer:                 22_000,
    chargesPayer:                6_800,
    avancesClients:             18_400,
    autresPassifsCourants:       3_800,
  },
};

const DEMO_CASHFLOW: CashFlowData = {
  encaissementsVentes:              1_268_900,
  encaissementsServices:               82_000,
  autresEncaissements:                125_400,

  decaissementsAchats:                596_800,
  decaissementsSalaires:              180_000,
  decaissementsChargesSociales:        18_000,
  decaissementsLoyers:                 85_000,
  decaissementsMarketing:              32_000,
  decaissementsAutres:                 71_800,
  impotsPaies:                         28_500,

  acquisitionsImmobilisations:         92_000,
  cedImmobilisations:                   0,
  autresInvestissements:               18_000,

  empruntContractes:                       0,
  remboursementsPrets:                 70_000,
  apportsProprio:                      50_000,
  prelevementsProprio:                 96_000,

  tresorerieDebutExercice:            277_300,

  prev: {
    encaissementsVentes:            1_108_200,
    encaissementsServices:             64_000,
    autresEncaissements:               98_000,
    decaissementsAchats:              528_000,
    decaissementsSalaires:            160_000,
    decaissementsChargesSociales:      16_000,
    decaissementsLoyers:               80_000,
    decaissementsMarketing:            24_000,
    decaissementsAutres:               60_000,
    impotsPaies:                       22_000,
    acquisitionsImmobilisations:       45_000,
    cedImmobilisations:                    0,
    autresInvestissements:              8_000,
    empruntContractes:                150_000,
    remboursementsPrets:               50_000,
    apportsProprio:                   100_000,
    prelevementsProprio:               80_000,
    tresorerieDebutExercice:          155_100,
  },
};

const DEMO_EQUITY: EquityStatementData = {
  openCapitalSocial:            500_000,
  openApports:                  100_000,
  openReserves:                  36_000,
  openReportANouveau:           112_000,
  openPrelevements:              80_000,
  openResultatPrecedent:        296_800,

  apportsNouveaux:               50_000,
  resultatNet:                  358_700,
  affectationReserves:           12_000,
  dividendesDistribues:               0,
  prelevementsExercice:          96_000,
};

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
  const bg  = color === 'green' ? 'bg-[#ECFDF5] border-[#A7F3D0]' :
              color === 'red'   ? 'bg-[#FEF2F2] border-[#FECACA]' :
              color === 'blue'  ? 'bg-[#EFF6FF] border-[#BFDBFE]' :
                                  'bg-[#F8FAFC] border-[#E2E8F0]';
  const vc  = color === 'green' ? 'text-[#065F46]' :
              color === 'red'   ? 'text-[#991B1B]' :
              color === 'blue'  ? 'text-[#1D4ED8]' : 'text-[#0F172A]';

  return (
    <div className={`rounded-xl md:rounded-2xl border-2 p-3 md:p-4 ${bg}`}>
      <p className="text-[10px] md:text-[11px] font-semibold uppercase tracking-[0.1em] text-[#64748B] line-clamp-2">{label}</p>
      <p className={`text-lg md:text-[22px] font-bold tabular-nums mt-1 md:mt-2 break-words ${vc}`}>{value}</p>
      {sub && <p className="text-[10px] md:text-[11px] text-[#94A3B8] mt-1 md:mt-[2px] line-clamp-1">{sub}</p>}
      {trend && (
        <p className={`text-[10px] md:text-[11px] font-semibold mt-1 ${trend.startsWith('+') ? 'text-[#12B981]' : 'text-[#EF4444]'}`}>
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
  const [periodLabel,  setPeriodLabel]  = useState(`Annuel ${currentYear}`);
  const [currency,     setCurrency]     = useState<'HTG' | 'USD'>('HTG');
  const [isDemo,       setIsDemo]       = useState(false);
  const [incomeData,   setIncomeData]   = useState<IncomeStatementData>(DEMO_INCOME);
  const [balanceData,  setBalanceData]  = useState<BalanceSheetData>(DEMO_BALANCE);
  const [cashflowData, setCashflowData] = useState<CashFlowData>(DEMO_CASHFLOW);
  const [equityData,   setEquityData]   = useState<EquityStatementData>(DEMO_EQUITY);
  const [kpi, setKpi] = useState({
    caNet:     DEMO_INCOME.ventesMarchandises + DEMO_INCOME.prestationsServices + DEMO_INCOME.autresRevenus - DEMO_INCOME.retoursRabais,
    cogs:      DEMO_INCOME.achatsMarchandises + (DEMO_INCOME.variationStock ?? 0) + DEMO_INCOME.transportAchat,
    netProfit: DEMO_EQUITY.resultatNet,
    cashTotal: DEMO_BALANCE.tresorerieCaisse + DEMO_BALANCE.tresoreriebanque + DEMO_BALANCE.tresorerieMonCash + DEMO_BALANCE.tresorerieNatcash,
  });

  // ── Lazy print portal — only render ALL 4 reports when user clicks Print ────
  const [showPrintPortal, setShowPrintPortal] = useState(false);
  const handleBeforePrint = useCallback(() => {
    flushSync(() => setShowPrintPortal(true));
  }, []);

  useEffect(() => {
    if (!showPrintPortal) return;
    const onAfterPrint = () => setShowPrintPortal(false);
    window.addEventListener('afterprint', onAfterPrint);
    return () => window.removeEventListener('afterprint', onAfterPrint);
  }, [showPrintPortal]);

  // ── Re-fetch every time period or year changes ──────────────────────────────
  useEffect(() => {
    setLoading(true);
    getReportsDataAction(period as ReportPeriod, year)
      .then((d) => {
        if (!d) return;
        setCompanyName(d.businessName || 'Mon Entreprise');
        setPeriodLabel(d.periodLabel);
        setCurrency(d.currency);

        if (d.hasRealData) {
          setIsDemo(false);
          setIncomeData(d.income);
          setBalanceData(d.balance);
          setCashflowData(d.cashflow);
          setEquityData(d.equity);
          setKpi(d.kpi);
        } else {
          setIsDemo(true);
          // Reset to DEMO when no data exists for this period
          setIncomeData(DEMO_INCOME);
          setBalanceData(DEMO_BALANCE);
          setCashflowData(DEMO_CASHFLOW);
          setEquityData(DEMO_EQUITY);
        }
      })
      .catch(() => setIsDemo(true))
      .finally(() => setLoading(false));
  }, [period, year]); // ← refetch whenever period or year changes

  const marge = kpi.caNet > 0
    ? (((kpi.caNet - kpi.cogs) / kpi.caNet) * 100).toFixed(1)
    : '0.0';

  const meta = useMemo(() => ({
    companyName,
    reportTitle: '',
    reportSubtitle: periodLabel,
    currency,
  }), [companyName, periodLabel, currency]);

  if (loading) {
    return (
      <main className="min-h-screen bg-[#F8FAFC] px-4 py-6">
        <div className="max-w-6xl mx-auto space-y-4 animate-pulse">
          <div className="h-28 bg-white rounded-3xl border border-[#E2E8F0]" />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[...Array(4)].map((_, i) => <div key={i} className="h-24 bg-white rounded-2xl border border-[#E2E8F0]" />)}
          </div>
          <div className="h-[600px] bg-white rounded-3xl border border-[#E2E8F0]" />
        </div>
      </main>
    );
  }

  return (
    <>
      <main className="min-h-screen bg-[#F1F5F9] no-print">
        <div className="w-full max-w-full lg:max-w-[1160px] mx-auto px-3 md:px-4 py-4 md:py-6 space-y-4 md:space-y-6">

          {/* ── Page header ── */}
          <header className="bg-white rounded-2xl md:rounded-3xl border border-[#E2E8F0] p-4 md:p-6 flex flex-col gap-4 md:gap-0 md:flex-row md:items-center md:justify-between shadow-sm">
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <p className="text-[10px] md:text-[11px] font-semibold uppercase tracking-[0.18em] text-[#12B981]">
                    {t({ fr: 'Rapports Financiers', ht: 'Rapò Finansye' })}
                  </p>
                  {isDemo && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-amber-400/30 bg-amber-400/10 px-2.5 py-0.5 text-[10px] font-semibold text-amber-500 flex-shrink-0">
                      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-400" />
                      {t({ fr: 'Données démo', ht: 'Done demo' })}
                    </span>
                  )}
              </div>
              <h1 className="text-xl md:text-[26px] font-bold text-[#0F172A] leading-tight break-words">{companyName}</h1>
              <p className="text-[12px] md:text-[13px] text-[#64748B] mt-1">
                Exercice {new Date().getFullYear()} · Exprimé en {getCurrencyName(currency)}
              </p>
            </div>
            <ReportActions reportTitle={reportType} companyName={companyName} onBeforePrint={handleBeforePrint} />
          </header>

          {/* ── KPI strip ── */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 md:gap-3">
            <KpiCard label={t({ fr: 'Chiffre d\'affaires', ht: 'Chif afè' })} value={htg(kpi.caNet, currency)}     sub={`Exercice ${new Date().getFullYear()}`} color="navy"  />
            <KpiCard label={t({ fr: 'Marge brute', ht: 'Maj brit' })}        value={`${marge}%`}        sub={htg(kpi.caNet - kpi.cogs, currency)}              color="green" />
            <KpiCard label={t({ fr: 'Résultat net', ht: 'Rezilta nèt' })}        value={htg(kpi.netProfit, currency)} sub={`Exercice ${new Date().getFullYear()}`} color={kpi.netProfit >= 0 ? 'green' : 'red'} />
            <KpiCard label={t({ fr: 'Trésorerie totale', ht: 'Trezoreri total' })}  value={htg(kpi.cashTotal, currency)} sub={t({ fr: 'Disponible', ht: 'Disponib' })}                             color="blue"  />
          </div>

          {/* ── Period selector ── */}
          <div className="bg-white rounded-2xl border border-[#E2E8F0] px-5 py-4 shadow-sm">
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                  <p className="text-[12px] font-semibold text-[#64748B] uppercase tracking-wider">
                    {t({ fr: "Période d'analyse", ht: 'Periyòd analiz' })}
                  </p>
                <div className="flex items-center gap-2">
                  {loading && (
                    <svg className="h-4 w-4 animate-spin text-[#12B981]" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                    </svg>
                  )}
                  {/* Year selector */}
                  <select
                    value={year}
                    onChange={(e) => setYear(Number(e.target.value))}
                    className="rounded-lg border border-[#E2E8F0] bg-white px-3 py-1.5 text-[12px] font-semibold text-[#0F172A] outline-none focus:border-[#12B981] focus:ring-1 focus:ring-[#12B981]"
                  >
                    {[currentYear, currentYear - 1, currentYear - 2].map(y => (
                      <option key={y} value={y}>{y}</option>
                    ))}
                  </select>
                </div>
              </div>
              <PeriodPicker active={period} onChange={setPeriod} />
              {/* Active period label */}
              <p className="text-[11px] text-[#94A3B8]">
                📅 {periodLabel}
              </p>
            </div>
          </div>

          {/* ── Report type tabs ── */}
          <ReportTypeSelector active={reportType} onChange={setReportType} />

          {/* ── Report preview (A4) ── */}
          <div className="relative flex justify-center w-full">
            {/* Overlay spinner on period change */}
            {loading && (
              <div className="absolute inset-0 z-10 flex items-center justify-center rounded-2xl bg-white/70 backdrop-blur-sm">
                <div className="flex flex-col items-center gap-3">
                  <svg className="h-8 w-8 animate-spin text-[#12B981]" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                  </svg>
                  <p className="text-[12px] font-medium text-[#64748B]">{t({ fr: 'Chargement des données…', ht: 'Chajman done yo…' })}</p>
                </div>
              </div>
            )}
            <div className="w-full overflow-x-auto overflow-y-visible rounded-2xl shadow-xl" style={{ maxWidth: '210mm' }}>
              {reportType === 'income'   && <IncomeStatement   meta={meta} data={incomeData}   showPrevious />}
              {reportType === 'balance'  && <BalanceSheet       meta={meta} data={balanceData}  showPrevious />}
              {reportType === 'cashflow' && <CashFlowStatement  meta={meta} data={cashflowData} showPrevious />}
              {reportType === 'equity'   && <EquityStatement    meta={meta} data={equityData}   />}
            </div>
          </div>

          {/* ── Bottom action bar ── */}
          <div className="bg-white rounded-3xl border border-[#E2E8F0] p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 shadow-sm">
            <div>
              <p className="text-[13px] font-semibold text-[#0F172A]">{t({ fr: 'Télécharger tous les états financiers', ht: 'Telechaje tout eta finansye yo' })}</p>
              <p className="text-[11px] text-[#94A3B8] mt-[2px]">{t({ fr: 'PDF A4 · Prêt à l\'impression · Qualité comptable', ht: 'PDF A4 · Pare pou enprime · Kalite kontab' })}</p>
            </div>
            <ReportActions reportTitle={t({ fr: 'Pack complet', ht: 'Pake konplè' })} companyName={companyName} onBeforePrint={handleBeforePrint} />
          </div>

        </div>
      </main>

      {/* ── Print portal (lazy — only rendered when user clicks Print/PDF) ── */}
      {showPrintPortal && (
        <div className="print-portal">
          <IncomeStatement   meta={meta} data={incomeData}   showPrevious />
          <BalanceSheet       meta={meta} data={balanceData}  showPrevious />
          <CashFlowStatement  meta={meta} data={cashflowData} showPrevious />
          <EquityStatement    meta={meta} data={equityData}   />
        </div>
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
