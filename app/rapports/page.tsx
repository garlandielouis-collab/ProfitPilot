'use client';

/**
 * /rapports — Premium Financial Reports Hub
 * ProfitPilot · Apple × QuickBooks × Stripe aesthetic
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLanguage } from '../../components/LanguageWrapper';
import { getReportsDataAction } from '../actions/reports';

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
    <div className={`rounded-2xl border-2 p-4 ${bg}`}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[#64748B]">{label}</p>
      <p className={`text-[22px] font-bold tabular-nums mt-1 ${vc}`}>{value}</p>
      {sub && <p className="text-[11px] text-[#94A3B8] mt-[2px]">{sub}</p>}
      {trend && (
        <p className={`text-[11px] font-semibold mt-1 ${trend.startsWith('+') ? 'text-[#12B981]' : 'text-[#EF4444]'}`}>
          {trend}
        </p>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────

function htg(v: number) {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'HTG',
    maximumFractionDigits: 0,
  }).format(v);
}

// ─────────────────────────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────────────────────────

export default function RapportsPage() {
  const { t } = useLanguage();
  const [reportType, setReportType] = useState<ReportType>('income');
  const [period, setPeriod] = useState<PeriodType>('FY');
  const [companyName, setCompanyName] = useState('Entreprise ABC SARL');
  const [loading, setLoading] = useState(true);

  // Load business name from API
  useEffect(() => {
    getReportsDataAction()
      .then((d) => { if (d?.businessName) setCompanyName(d.businessName); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const meta = useMemo(() => ({
    companyName,
    reportTitle: '',        // overridden per-report
    reportSubtitle: `Exercice clos le 31 décembre 2025`,
    currency: 'HTG',
  }), [companyName]);

  // Derived KPIs from demo data (replace with live fn calls)
  const caNet = DEMO_INCOME.ventesMarchandises + DEMO_INCOME.prestationsServices + DEMO_INCOME.autresRevenus - DEMO_INCOME.retoursRabais;
  const cogs  = DEMO_INCOME.achatsMarchandises + (DEMO_INCOME.variationStock ?? 0) + DEMO_INCOME.transportAchat;
  const marge = ((caNet - cogs) / caNet * 100).toFixed(1);
  const cashTotal = DEMO_BALANCE.tresorerieCaisse + DEMO_BALANCE.tresoreriebanque + DEMO_BALANCE.tresorerieMonCash + DEMO_BALANCE.tresorerieNatcash;

  if (loading) {
    return (
      <main className="min-h-screen bg-[#F8FAFC] px-4 py-6">
        <div className="max-w-6xl mx-auto space-y-4 animate-pulse">
          <div className="h-28 bg-white rounded-3xl border border-[#E2E8F0]" />
          <div className="grid grid-cols-4 gap-3">
            {[...Array(4)].map((_, i) => <div key={i} className="h-24 bg-white rounded-2xl border border-[#E2E8F0]" />)}
          </div>
          <div className="h-[600px] bg-white rounded-3xl border border-[#E2E8F0]" />
        </div>
      </main>
    );
  }

  return (
    <>
      {/* ── No inline style needed: globals.css handles all print logic ── */}

      {/* ═══════════════════════════════════════════════════
          SCREEN VIEW — reports hub
          The .no-print class ensures this is hidden
          when the print portal is rendering.
      ═══════════════════════════════════════════════════ */}
      <main className="min-h-screen bg-[#F1F5F9] no-print">
        <div className="max-w-[1160px] mx-auto px-4 py-6 space-y-6">

          {/* ── Page header ── */}
          <header className="bg-white rounded-3xl border border-[#E2E8F0] p-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4 shadow-sm">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#12B981] mb-1">
                Rapports Financiers
              </p>
              <h1 className="text-[26px] font-bold text-[#0F172A] leading-tight">{companyName}</h1>
              <p className="text-[13px] text-[#64748B] mt-1">
                Exercice 2025 · Exprimé en Gourdes Haïtiennes (HTG)
              </p>
            </div>
            <ReportActions
              reportTitle={reportType}
              companyName={companyName}
            />
          </header>

          {/* ── KPI strip ── */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <KpiCard label="Chiffre d'affaires"   value={htg(caNet)}             sub="Exercice 2025"   trend="+14.6% vs 2024"  color="navy"  />
            <KpiCard label="Marge brute"           value={`${marge}%`}            sub={htg(caNet-cogs)} trend="+1.8pp vs 2024" color="green" />
            <KpiCard label="Résultat net"          value={htg(DEMO_EQUITY.resultatNet)} sub="Exercice 2025" trend="+20.8% vs 2024" color="green" />
            <KpiCard label="Trésorerie totale"     value={htg(cashTotal)}         sub="Au 31 déc. 2025" color="blue"  />
          </div>

          {/* ── Period selector ── */}
          <div className="bg-white rounded-2xl border border-[#E2E8F0] px-5 py-4 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <p className="text-[12px] font-semibold text-[#64748B] uppercase tracking-wider">Période d'analyse</p>
              <PeriodPicker active={period} onChange={setPeriod} />
            </div>
          </div>

          {/* ── Report type tabs ── */}
          <ReportTypeSelector active={reportType} onChange={setReportType} />

          {/* ── Report preview (A4 on screen) ── */}
          <div className="flex justify-center">
            <div
              className="w-full overflow-hidden rounded-2xl shadow-xl"
              style={{ maxWidth: '210mm' }}
            >
              {reportType === 'income'   && <IncomeStatement   meta={meta} data={DEMO_INCOME}   showPrevious />}
              {reportType === 'balance'  && <BalanceSheet       meta={meta} data={DEMO_BALANCE}  showPrevious />}
              {reportType === 'cashflow' && <CashFlowStatement  meta={meta} data={DEMO_CASHFLOW} showPrevious />}
              {reportType === 'equity'   && <EquityStatement    meta={meta} data={DEMO_EQUITY}   />}
            </div>
          </div>

          {/* ── Bottom action bar ── */}
          <div className="bg-white rounded-3xl border border-[#E2E8F0] p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 shadow-sm">
            <div>
              <p className="text-[13px] font-semibold text-[#0F172A]">
                Télécharger tous les états financiers
              </p>
              <p className="text-[11px] text-[#94A3B8] mt-[2px]">
                PDF A4 · Prêt à l'impression · Qualité comptable
              </p>
            </div>
            <ReportActions reportTitle="Pack complet" companyName={companyName} />
          </div>

        </div>
      </main>

      {/* ═══════════════════════════════════════════════════
          PRINT PORTAL — renders all 4 reports for PDF
      ═══════════════════════════════════════════════════ */}
      <div className="print-portal">
        <IncomeStatement   meta={meta} data={DEMO_INCOME}   showPrevious />
        <BalanceSheet       meta={meta} data={DEMO_BALANCE}  showPrevious />
        <CashFlowStatement  meta={meta} data={DEMO_CASHFLOW} showPrevious />
        <EquityStatement    meta={meta} data={DEMO_EQUITY}   />
      </div>
    </>
  );
}
