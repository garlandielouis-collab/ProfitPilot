'use server';

import { getBusinessContext } from '../../lib/serverAuth';
import { isAssetCategory } from '../../lib/accountingEngine';
import type { IncomeStatementData } from '../../components/reports/IncomeStatement';
import type { BalanceSheetData }     from '../../components/reports/BalanceSheet';
import type { CashFlowData }         from '../../components/reports/CashFlowStatement';
import type { EquityStatementData }  from '../../components/reports/EquityStatement';

// ── Public shape returned to the page ────────────────────────────────────────

export type ReportsData = {
  businessName:    string;
  businessPhone?:  string;
  businessAddress?: string;
  businessSector?:  string;
  businessTaxId?:   string;
  hasRealData:   boolean;
  periodLabel:   string;   // e.g. "T2 2026 — Avr/Jun"
  currency:      'HTG' | 'USD'; // Reporting currency

  // Full typed data for each report component
  income:   IncomeStatementData;
  balance:  BalanceSheetData;
  cashflow: CashFlowData;
  equity:   EquityStatementData;

  // KPI strip
  kpi: {
    caNet:     number;
    cogs:      number;
    netProfit: number;
    cashTotal: number;
  };

  // Period summaries
  periodSummary: {
    month:      { revenue: number; expenses: number; profit: number };
    quarter:    { revenue: number; expenses: number; profit: number };
    semiAnnual: { revenue: number; expenses: number; profit: number };
    year:       { revenue: number; expenses: number; profit: number };
  };
};

// ── Empty / zero-value fallback ───────────────────────────────────────────────

function emptyIncome(): IncomeStatementData {
  return {
    ventesMarchandises: 0, prestationsServices: 0, autresRevenus: 0, retoursRabais: 0,
    achatsMarchandises: 0, variationStock: 0, transportAchat: 0,
    loyers: 0, salaires: 0, chargesSociales: 0, marketing: 0, transport: 0,
    electriciteInternet: 0, fraisBancaires: 0, autresCharges: 0, dotationsAmortissements: 0,
    produitsFinanciers: 0, chargesFinancieres: 0, impotTaxes: 0,
  };
}

function emptyBalance(): BalanceSheetData {
  return {
    terrains: 0, batimentsConstruct: 0, materielInformatique: 0, mobilierBureau: 0,
    vehicules: 0, autresImmobilisations: 0, amortissementsCumules: 0,
    stocksMarchandises: 0, creancesClients: 0, avancesFournisseurs: 0,
    tresoreriebanque: 0, tresorerieMonCash: 0, tresorerieNatcash: 0,
    tresorerieCaisse: 0, autresActifsCourants: 0,
    capitalSocial: 0, apportsProprio: 0, reservesLegales: 0,
    reportANouveau: 0, resultatExercice: 0, prelevementsProprietaire: 0,
    empruntsBancairesLT: 0, pretesLT: 0, dettesImmobilisations: 0,
    detteFournisseurs: 0, salairesPayer: 0, onaPayer: 0, taxesPayer: 0,
    chargesPayer: 0, avancesClients: 0, autresPassifsCourants: 0,
  };
}

function emptyCashflow(): CashFlowData {
  return {
    encaissementsVentes: 0, encaissementsServices: 0, autresEncaissements: 0,
    decaissementsAchats: 0, decaissementsSalaires: 0, decaissementsChargesSociales: 0,
    decaissementsLoyers: 0, decaissementsMarketing: 0, decaissementsAutres: 0,
    impotsPaies: 0,
    acquisitionsImmobilisations: 0, cedImmobilisations: 0, autresInvestissements: 0,
    empruntContractes: 0, remboursementsPrets: 0, apportsProprio: 0, prelevementsProprio: 0,
    tresorerieDebutExercice: 0,
  };
}

function emptyEquity(netProfit = 0): EquityStatementData {
  return {
    openCapitalSocial: 0, openApports: 0, openReserves: 0,
    openReportANouveau: 0, openPrelevements: 0, openResultatPrecedent: 0,
    apportsNouveaux: 0, resultatNet: netProfit,
    affectationReserves: 0, dividendesDistribues: 0, prelevementsExercice: 0,
  };
}

function emptyReports(businessName = 'ProfitPilot', periodLabel = '', currency: 'HTG' | 'USD' = 'HTG'): ReportsData {
  return {
    businessName, businessPhone: '', businessAddress: '', businessSector: '', businessTaxId: '',
    hasRealData: false, periodLabel, currency,
    income: emptyIncome(), balance: emptyBalance(),
    cashflow: emptyCashflow(), equity: emptyEquity(),
    kpi: { caNet: 0, cogs: 0, netProfit: 0, cashTotal: 0 },
    periodSummary: {
      month:      { revenue: 0, expenses: 0, profit: 0 },
      quarter:    { revenue: 0, expenses: 0, profit: 0 },
      semiAnnual: { revenue: 0, expenses: 0, profit: 0 },
      year:       { revenue: 0, expenses: 0, profit: 0 },
    },
  };
}

// ── Helper: sum array ─────────────────────────────────────────────────────────

const sum = (arr: any[], key: string) =>
  (arr ?? []).reduce((s: number, r: any) => s + (Number(r[key]) || 0), 0);

// ── Period → date range ───────────────────────────────────────────────────────

export type ReportPeriod = 'Q1' | 'Q2' | 'Q3' | 'Q4' | 'H1' | 'H2' | 'FY';

function periodToRange(period: ReportPeriod, year: number): { from: Date; to: Date; label: string } {
  switch (period) {
    case 'Q1': return { from: new Date(year, 0, 1),  to: new Date(year, 2, 31),  label: `T1 ${year} — Jan/Mar` };
    case 'Q2': return { from: new Date(year, 3, 1),  to: new Date(year, 5, 30),  label: `T2 ${year} — Avr/Jun` };
    case 'Q3': return { from: new Date(year, 6, 1),  to: new Date(year, 8, 30),  label: `T3 ${year} — Jul/Sep` };
    case 'Q4': return { from: new Date(year, 9, 1),  to: new Date(year, 11, 31), label: `T4 ${year} — Oct/Déc` };
    case 'H1': return { from: new Date(year, 0, 1),  to: new Date(year, 5, 30),  label: `S1 ${year} — Jan/Jun` };
    case 'H2': return { from: new Date(year, 6, 1),  to: new Date(year, 11, 31), label: `S2 ${year} — Jul/Déc` };
    default:   return { from: new Date(year, 0, 1),  to: new Date(year, 11, 31), label: `Annuel ${year}` };
  }
}

// ── Main action ───────────────────────────────────────────────────────────────

export async function getReportsDataAction(
  period: ReportPeriod = 'FY',
  year: number = new Date().getFullYear(),
): Promise<ReportsData> {
  let supabase: any, businessId: string, userId: string;
  try {
    const ctx = await getBusinessContext();
    supabase   = ctx.supabase;
    businessId = ctx.businessId;
    userId     = ctx.userId;
  } catch { return emptyReports(); }
  const now = new Date();
  const mo  = now.getMonth();

  // ── Compute the selected period's date range ────────────────────────────────
  const { from: periodFrom, to: periodTo, label: periodLabel } = periodToRange(period, year);
  const fromIso = periodFrom.toISOString().split('T')[0];
  const toIso   = periodTo.toISOString().split('T')[0];

  // Keep full-year references for balance sheet calculations
  const yearStart       = new Date(year, 0, 1).toISOString();
  const monthStart      = new Date(year, mo, 1).toISOString();
  const quarterStart    = new Date(year, Math.floor(mo / 3) * 3, 1).toISOString();
  const semiAnnualStart = new Date(year, mo < 6 ? 0 : 6, 1).toISOString();

  // ── Parallel fetch — filtered by business_id AND selected period ──────────
  const [
    { data: bizRaw },
    { data: salesRaw },
    { data: expRaw },
    { data: purchRaw },
    { data: prodsRaw },
    { data: creditsRaw },
    { data: accountBalances },
  ] = await Promise.all([
    supabase.from('businesses').select('name, phone, address, sector, tax_id, exchange_rate, default_currency').eq('id', businessId).maybeSingle(),

    // Sales within the selected period
    supabase.from('sales')
      .select('total_amount, created_at, payment_method, payment_status, currency')
      .eq('business_id', businessId)
      .is('deleted_at', null)
      .gte('created_at', `${fromIso}T00:00:00`)
      .lte('created_at', `${toIso}T23:59:59`),

    supabase.from('expenses')
      .select('amount, expense_date, payment_method, currency, expense_categories(name)')
      .eq('business_id', businessId)
      .is('deleted_at', null)
      .gte('expense_date', fromIso)
      .lte('expense_date', toIso),

    supabase.from('purchases')
      .select('total_amount, payment_status, purchase_date, currency')
      .eq('business_id', businessId)
      .is('deleted_at', null)
      .gte('purchase_date', fromIso)
      .lte('purchase_date', toIso),

    supabase.from('products').select('stock_quantity, purchase_price, currency').eq('business_id', businessId),

    supabase.from('customer_transactions').select('amount, type, currency').eq('business_id', businessId).eq('type', 'credit'),

    // Real account balances from double-entry accounting (posted entries only)
    supabase.from('journal_entry_lines')
      .select(`
        base_debit, base_credit,
        chart_of_accounts!inner ( code, name, account_class ),
        journal_entries!inner ( business_id, status )
      `)
      .eq('journal_entries.business_id', businessId)
      .eq('journal_entries.status', 'posted'),
  ]);

  const biz            = (bizRaw as any);
  const businessName   = biz?.name    ?? 'Mon Entreprise';
  const businessPhone  = biz?.phone   ?? '';
  const businessAddress = biz?.address ?? '';
  const businessSector = biz?.sector  ?? '';
  const businessTaxId  = biz?.tax_id  ?? '';
  // Exchange rate: 1 USD = X HTG. Default 130 if not set.
  const exchangeRate   = Number(biz?.exchange_rate ?? 130);
  // Default currency from business settings (what we report in)
  const reportCurrency: 'HTG' | 'USD' = (biz?.default_currency ?? 'HTG') as 'HTG' | 'USD';

  // Convert any amount to the reporting currency
  function toReportCurrency(amount: number, currency: string): number {
    const amtCurrency = (currency ?? 'HTG').toUpperCase();
    if (amtCurrency === reportCurrency) return amount;
    if (reportCurrency === 'HTG' && amtCurrency === 'USD') return amount * exchangeRate;
    if (reportCurrency === 'USD' && amtCurrency === 'HTG') return amount / exchangeRate;
    return amount;
  }

  const sales    = (salesRaw    ?? []) as any[];
  const expenses = (expRaw      ?? []) as any[];
  const purch    = (purchRaw    ?? []) as any[];
  const prods    = (prodsRaw    ?? []) as any[];
  const credits  = (creditsRaw  ?? []) as any[];

  // ── Compute real account balances from journal_entry_lines ──────────────────
  const accountMap: Record<string, { code: string; name: string; class: string; balance: number }> = {};
  for (const l of (accountBalances ?? []) as any[]) {
    const acc = l.chart_of_accounts;
    if (!acc) continue;
    const debit  = Number(l.base_debit  ?? 0);
    const credit = Number(l.base_credit ?? 0);
    const key = acc.code as string;
    if (!accountMap[key]) accountMap[key] = { code: key, name: acc.name, class: acc.account_class, balance: 0 };
    if (acc.account_class === 'Asset' || acc.account_class === 'Expense') {
      accountMap[key].balance += debit - credit;
    } else {
      accountMap[key].balance += credit - debit;
    }
  }
  const accountBalance = (code: string): number => accountMap[code]?.balance ?? 0;

  const hasRealData = sales.length > 0 || expenses.length > 0 || purch.length > 0 || (accountBalances ?? []).length > 0;

  // ── Period sums — converted to reporting currency ────────────────────────────
  const selectedRevenue  = sales.reduce((s: number, r: any) =>
    s + toReportCurrency(Number(r.total_amount || 0), r.currency), 0);
  const selectedExpenses = expenses.reduce((s: number, r: any) =>
    s + toReportCurrency(Number(r.amount || 0), r.currency), 0);
  const selectedProfit   = selectedRevenue - selectedExpenses;

  // ── Legacy sums helper now with currency conversion ────────────────────────
  function legacySumsWithCurrency(fromDateIso: string, toDateIso: string) {
    const rev = sales.filter((s: any) =>
      s.created_at >= `${fromDateIso}T00:00:00` && s.created_at <= `${toDateIso}T23:59:59`)
      .reduce((n: number, r: any) => n + toReportCurrency(Number(r.total_amount || 0), r.currency), 0);
    const exp = expenses.filter((e: any) => e.expense_date >= fromDateIso && e.expense_date <= toDateIso)
      .reduce((n: number, r: any) => n + toReportCurrency(Number(r.amount || 0), r.currency), 0);
    return { revenue: rev, expenses: exp, profit: rev - exp };
  }

  const selectedSums = { revenue: selectedRevenue, expenses: selectedExpenses, profit: selectedProfit };

  const yearSums       = selectedSums;                               // same as selected for FY
  const monthSums      = legacySumsWithCurrency(monthStart.split('T')[0], toIso); // within month
  const quarterSums    = legacySumsWithCurrency(quarterStart.split('T')[0], toIso); // within quarter
  const semiAnnualSums = legacySumsWithCurrency(semiAnnualStart.split('T')[0], toIso); // within semi-annual

  // ── Expense breakdown by category ──────────────────────────────────────────
  // Classify each expense into the correct income-statement bucket
  const getCat = (e: any): string => (e.expense_categories as any)?.name ?? e.category ?? '';

  function classifyExpenseField(category: string): keyof IncomeStatementData {
    const c = category.toLowerCase();
    if (c.includes('salaire') || c.includes('salary') || c.includes('salè'))    return 'salaires';
    if (c.includes('loyer')   || c.includes('rent')   || c.includes('lwaye'))   return 'loyers';
    if (c.includes('marketing') || c.includes('publicité') || c.includes('pub') || c.includes('makèting')) return 'marketing';
    if (c.includes('internet') || c.includes('téléphone') || c.includes('telephone') || c.includes('mobile') || c.includes('entènèt')) return 'electriciteInternet';
    if (c.includes('électricité') || c.includes('electricite') || c.includes('elektrisite') || c.includes('eau') || c.includes('dlo')) return 'electriciteInternet';
    if (c.includes('transport') || c.includes('livraison') || c.includes('transpò') || c.includes('vehicule') || c.includes('véhicule') || c.includes('veyikil') || c.includes('deplasman') || c.includes('déplacement')) return 'transport';
    if (c.includes('bancaire') || c.includes('bank') || c.includes('banque'))   return 'fraisBancaires';
    if (c.includes('fourniture') || c.includes('bureau') || c.includes('founitì')) return 'autresCharges';
    if (c.includes('intérêt') || c.includes('enterè')  || c.includes('intérêts')) return 'chargesFinancieres';
    if (c.includes('équipement') || c.includes('matériel') || c.includes('ekipman') || c.includes('machine')) return 'dotationsAmortissements';
    if (c.includes('impôt') || c.includes('taxe') || c.includes('tca') || c.includes('enpo')) return 'impotTaxes';
    if (c.includes('social') || c.includes('ona') || c.includes('ofatma'))       return 'chargesSociales';
    if (c.includes('amortissement') || c.includes('amòtisman'))                 return 'dotationsAmortissements';
    if (c.includes('stock') || c.includes('acha') || c.includes('achat') || c.includes('marchandise')) return 'variationStock';
    if (c.includes('remboursement') || c.includes('ranbousman'))                return 'autresCharges';
    return 'autresCharges';
  }

  const incomeBuckets: Record<string, number> = {
    loyers: 0, salaires: 0, chargesSociales: 0, marketing: 0,
    transport: 0, electriciteInternet: 0, fraisBancaires: 0,
    autresCharges: 0, dotationsAmortissements: 0, impotTaxes: 0,
    variationStock: 0, chargesFinancieres: 0,
  };

  for (const e of expenses) {
    const field = classifyExpenseField(getCat(e));
    const amt   = toReportCurrency(Number(e.amount || 0), e.currency);
    incomeBuckets[field] = (incomeBuckets[field] ?? 0) + amt;
  }

  // ── Purchases — converted to reporting currency ──────────────────────────
  const cogs = purch.filter((p: any) => p.payment_status === 'paid' || p.payment_status === 'Payé')
    .reduce((s: number, p: any) => s + toReportCurrency(Number(p.total_amount || 0), p.currency || 'HTG'), 0);
  const detteFournisseurs = purch.filter((p: any) => p.payment_status === 'credit' || p.payment_status === 'À Crédit')
    .reduce((s: number, p: any) => s + toReportCurrency(Number(p.total_amount || 0), p.currency || 'HTG'), 0);

  // ── Revenue & profit ───────────────────────────────────────────────────────
  const caNet     = yearSums.revenue;
  const grossProfit = caNet - cogs;
  const totalOpex  = yearSums.expenses;
  const netProfit  = grossProfit - totalOpex;

  // ── Stock value — converted to reporting currency ──────────────────────────
  const stockValue = prods.reduce((s: number, p: any) =>
    s + (Number(p.stock_quantity || 0) * toReportCurrency(Number(p.purchase_price || 0), p.currency || 'HTG')), 0);

  // ── Client receivables — convert if currency present
  const creancesClients = credits.filter((c: any) => c.type === 'credit')
    .reduce((s: number, c: any) => s + toReportCurrency(Number(c.amount || 0), c.currency || reportCurrency), 0);

  // ── Cash total (approximation: revenue - expenses - purchases paid) ────────
  const cashTotal = Math.max(0, caNet - totalOpex - cogs);

  // ── Income Statement ───────────────────────────────────────────────────────
  const income: IncomeStatementData = {
    ventesMarchandises:      caNet,
    prestationsServices:     0,
    autresRevenus:           0,
    retoursRabais:           0,
    achatsMarchandises:      cogs,
    variationStock:          incomeBuckets.variationStock,
    transportAchat:          0,
    loyers:                  incomeBuckets.loyers,
    salaires:                incomeBuckets.salaires,
    chargesSociales:         incomeBuckets.chargesSociales,
    marketing:               incomeBuckets.marketing,
    transport:               incomeBuckets.transport,
    electriciteInternet:     incomeBuckets.electriciteInternet,
    fraisBancaires:          incomeBuckets.fraisBancaires,
    autresCharges:           incomeBuckets.autresCharges,
    dotationsAmortissements: incomeBuckets.dotationsAmortissements,
    produitsFinanciers:      0,
    chargesFinancieres:      incomeBuckets.chargesFinancieres,
    impotTaxes:              incomeBuckets.impotTaxes,
  };

  // ── Balance Sheet (using real account balances where available) ────────────
  const balance: BalanceSheetData = {
    terrains:               accountBalance('1250') + accountBalance('1260'),
    batimentsConstruct:     accountBalance('1240'),
    materielInformatique:   accountBalance('1210'),
    mobilierBureau:         accountBalance('1220'),
    vehicules:              accountBalance('1230'),
    autresImmobilisations:  accountBalance('1280'),
    amortissementsCumules:  accountBalance('1290'),
    stocksMarchandises:     accountBalance('3100') > 0 ? accountBalance('3100') : stockValue + incomeBuckets.variationStock,
    creancesClients:        accountBalance('1130') > 0 ? accountBalance('1130') : creancesClients,
    avancesFournisseurs:    accountBalance('1140'),
    tresorerieCaisse:       accountBalance('1110'),
    tresoreriebanque:       accountBalance('1120'),
    tresorerieMonCash:      0,
    tresorerieNatcash:      0,
    autresActifsCourants:   accountBalance('1190'),
    capitalSocial:           accountBalance('3100'),
    apportsProprio:          0,
    reservesLegales:         accountBalance('3130'),
    reportANouveau:          accountBalance('3140'),
    resultatExercice:        netProfit,
    prelevementsProprietaire: accountBalance('3110'),
    empruntsBancairesLT:     accountBalance('2200'),
    pretesLT:                accountBalance('2210'),
    dettesImmobilisations:   accountBalance('2290'),
    detteFournisseurs:       accountBalance('2110') > 0 ? accountBalance('2110') : detteFournisseurs,
    salairesPayer:           accountBalance('2310'),
    onaPayer:                accountBalance('2320'),
    taxesPayer:              accountBalance('2330'),
    chargesPayer:            accountBalance('2390'),
    avancesClients:          accountBalance('2400'),
    autresPassifsCourants:   accountBalance('2490'),
  };

  // ── Cash Flow Statement ────────────────────────────────────────────────────
  const cashMonCash = sales.filter((s: any) => s.payment_method === 'MonCash')
    .reduce((n: number, s: any) => n + toReportCurrency(Number(s.total_amount || 0), s.currency), 0);
  const cashCard = sales.filter((s: any) => ['Card','Natcash'].includes(s.payment_method))
    .reduce((n: number, s: any) => n + toReportCurrency(Number(s.total_amount || 0), s.currency), 0);
  const cashCash  = caNet - cashMonCash - cashCard;

  const cashflow: CashFlowData = {
    encaissementsVentes:             cashCash,
    encaissementsServices:           cashMonCash + cashCard,
    autresEncaissements:             0,
    decaissementsAchats:             cogs,
    decaissementsSalaires:           incomeBuckets.salaires,
    decaissementsChargesSociales:    incomeBuckets.chargesSociales,
    decaissementsLoyers:             incomeBuckets.loyers,
    decaissementsMarketing:          incomeBuckets.marketing,
    decaissementsAutres:             incomeBuckets.autresCharges + incomeBuckets.electriciteInternet + incomeBuckets.fraisBancaires + incomeBuckets.transport + incomeBuckets.dotationsAmortissements + incomeBuckets.impotTaxes,
    impotsPaies:                     0,
    acquisitionsImmobilisations:     0,
    cedImmobilisations:              0,
    autresInvestissements:           0,
    empruntContractes:               0,
    remboursementsPrets:             incomeBuckets.autresCharges,
    apportsProprio:                  0,
    prelevementsProprio:             0,
    tresorerieDebutExercice:         0,
  };

  // ── Equity Statement ───────────────────────────────────────────────────────
  const equity: EquityStatementData = {
    openCapitalSocial:       0,
    openApports:             0,
    openReserves:            0,
    openReportANouveau:      0,
    openPrelevements:        0,
    openResultatPrecedent:   0,
    apportsNouveaux:         0,
    resultatNet:             netProfit,
    affectationReserves:     0,
    dividendesDistribues:    0,
    prelevementsExercice:    0,
  };

  return {
    businessName,
    businessPhone,
    businessAddress,
    businessSector,
    businessTaxId,
    hasRealData,
    periodLabel,
    currency: reportCurrency,
    income,
    balance,
    cashflow,
    equity,
    kpi: { caNet, cogs, netProfit, cashTotal },
    periodSummary: {
      month:      monthSums,
      quarter:    quarterSums,
      semiAnnual: semiAnnualSums,
      year:       yearSums,
    },
  };
}
