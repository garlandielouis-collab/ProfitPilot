/**
 * Financial Reporting Engine pour ProfitPilot
 * Génère P&L, Balance Sheet, et Cash Flow Statements
 * Avec memoization et support multi-currency
 */

import { getSupabaseServer } from './supabaseServerClient';
import { getTransactionPosting, getAccountByCode } from './chartOfAccounts';
import { isExchangeRateSet, makeToReport, type ToReport } from './currency';

// ===== TYPES =====

export interface ProfitAndLossReport {
  period: { start: string; end: string };
  currency: 'HTG' | 'USD' | 'BOTH';
  revenues: {
    salesRevenue: number;
    otherIncome: number;
    refunds: number;
    totalRevenue: number;
  };
  expenses: {
    cogs: number;
    salaries: number;
    rent: number;
    utilities: number;
    marketing: number;
    transport: number;
    officeSupplies: number;
    professional: number;
    insurance: number;
    maintenance: number;
    depreciation: number;
    interest: number;
    other: number;
    totalExpenses: number;
  };
  profitBeforeTax: number;
  estimatedTax: number; // Assuming 30% corporate tax
  netProfit: number;
  /** Montants dans l'autre devise restés hors des totaux, faute de taux saisi. */
  unconvertedCount?: number;
}

export interface BalanceSheetReport {
  asOfDate: string;
  currency: 'HTG' | 'USD' | 'BOTH';
  assets: {
    liquidAssets: number;
    currentAssets: number;
    fixedAssets: number;
    totalAssets: number;
  };
  liabilities: {
    currentLiabilities: number;
    longTermLiabilities: number;
    totalLiabilities: number;
  };
  equity: {
    ownerCapital: number;
    ownerDrawings: number;
    retainedEarnings: number;
    totalEquity: number;
  };
  totalLiabilitiesAndEquity: number;
  /** Montants dans l'autre devise restés hors des totaux, faute de taux saisi. */
  unconvertedCount?: number;
}

export interface CashFlowReport {
  period: { start: string; end: string };
  currency: 'HTG' | 'USD' | 'BOTH';
  operatingActivities: {
    netIncome: number;
    adjustments: number;
    netCashFromOperations: number;
  };
  investingActivities: {
    capitalExpenditures: number;
    equipmentPurchases: number;
    netCashFromInvesting: number;
  };
  financingActivities: {
    loanProceeds: number;
    loanRepayments: number;
    ownerDrawals: number;
    netCashFromFinancing: number;
  };
  netChangeInCash: number;
  beginningCash: number;
  endingCash: number;
  /** Montants dans l'autre devise restés hors des totaux, faute de taux saisi. */
  unconvertedCount?: number;
}

export interface TransactionRecord {
  id: string;
  type: 'Sale' | 'Purchase' | 'Expense' | 'Refund' | 'Payment';
  amount: number;
  currency: 'HTG' | 'USD';
  date: string;
  category?: string;
  payment_method?: string;
  description?: string;
}

// ===== CACHE LAYER (Simple memoization) =====

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

const reportCache = new Map<string, CacheEntry<any>>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes cache

function generateCacheKey(
  reportType: string,
  businessId: string,
  params: Record<string, any>
): string {
  const paramStr = JSON.stringify(params);
  return `${reportType}:${businessId}:${Buffer.from(paramStr).toString('base64')}`;
}

function getFromCache<T>(key: string): T | null {
  const entry = reportCache.get(key);
  if (!entry) return null;

  const now = Date.now();
  if (now - entry.timestamp > entry.ttl) {
    reportCache.delete(key);
    return null;
  }

  return entry.data as T;
}

function setInCache<T>(key: string, data: T, ttl: number = CACHE_TTL_MS): void {
  reportCache.set(key, {
    data,
    timestamp: Date.now(),
    ttl,
  });
}

function invalidateCache(businessId?: string): void {
  if (!businessId) {
    reportCache.clear();
  } else {
    // Invalidate all entries for this business
    const keysToDelete: string[] = [];
    reportCache.forEach((_, key) => {
      if (key.includes(`:${businessId}:`)) {
        keysToDelete.push(key);
      }
    });
    keysToDelete.forEach((key) => reportCache.delete(key));
  }
}

// ===== UTILITY FUNCTIONS =====

/**
 * Le taux de change de l'entreprise, et s'il a réellement été saisi.
 * `exchangeRateSet` est faux pour NULL, ≤ 1 (défaut de colonne) ou une lecture
 * impossible : aucune conversion n'est alors faite, jamais de taux de repli.
 */
async function getExchangeRate(
  businessId: string,
): Promise<{ exchangeRate: number; exchangeRateSet: boolean }> {
  try {
    const supabaseServer = await getSupabaseServer();
    const { data } = await supabaseServer
      .from('businesses')
      .select('exchange_rate')
      .eq('id', businessId)
      .single();

    const rate = Number(data?.exchange_rate);
    return {
      exchangeRate:    Number.isFinite(rate) ? rate : 1,
      exchangeRateSet: isExchangeRateSet(data?.exchange_rate),
    };
  } catch (error) {
    console.error('Error fetching exchange rate:', error);
    return { exchangeRate: 1, exchangeRateSet: false };
  }
}

/**
 * Convertisseur vers la devise du rapport : `makeToReport` (lib/currency), la
 * même règle que le reste du produit. Il renvoie `null` pour un montant
 * inconvertible (autre devise sans taux saisi) : l'appelant l'EXCLUT du total
 * et le COMPTE dans `unconvertedCount`.
 */
async function getReportConverter(
  businessId: string,
  currency: 'HTG' | 'USD',
): Promise<ToReport> {
  const fx = await getExchangeRate(businessId);
  return makeToReport({ ...fx, defaultCurrency: currency });
}

/**
 * Récupère toutes les transactions pour une période donnée
 */
async function getTransactionsForPeriod(
  businessId: string,
  startDate: string,
  endDate: string
): Promise<TransactionRecord[]> {
  const transactions: TransactionRecord[] = [];

  const supabaseServer = await getSupabaseServer();

  // Récupère les ventes
  const { data: sales } = await supabaseServer
    .from('sales')
    .select('id,total_amount,currency,payment_method,created_at')
    .eq('business_id', businessId)
    .gte('created_at', startDate)
    .lte('created_at', endDate);

  if (sales) {
    transactions.push(
      ...sales.map((s: any) => ({
        id: s.id,
        type: 'Sale' as const,
        amount: s.total_amount,
        currency: s.currency,
        date: s.created_at,
        payment_method: s.payment_method,
      }))
    );
  }

  // Récupère les achats
  //
  // La colonne s'appelle `total_amount`, pas `total_purchase_amount` — ce nom
  // n'existe nulle part dans la table. La requête échouait, `purchases`
  // arrivait `undefined`, et aucun achat n'entrait dans le rapport.
  const { data: purchases } = await supabaseServer
    .from('purchases')
    .select('id,total_amount,currency,payment_status,purchase_date')
    .eq('business_id', businessId)
    .is('deleted_at', null)
    .gte('purchase_date', startDate)
    .lte('purchase_date', endDate);

  if (purchases) {
    transactions.push(
      ...purchases.map((p: any) => ({
        id: p.id,
        type: 'Purchase' as const,
        amount: p.total_amount,
        currency: p.currency,
        date: p.purchase_date,
        payment_method: p.payment_status,
      }))
    );
  }

  // Récupère les dépenses
  //
  // `expenses` n'a ni `date` ni `category` : la date est `expense_date` et la
  // catégorie est une clé étrangère `category_id` vers `expense_categories`.
  // Les trois colonnes inventées faisaient échouer la requête, `expenses`
  // arrivait `undefined`, et AUCUNE dépense n'entrait dans le rapport
  // financier — les charges y étaient donc systématiquement à zéro.
  const { data: expenses } = await supabaseServer
    .from('expenses')
    .select('id,amount,currency,expense_date,description,expense_categories(name)')
    .eq('business_id', businessId)
    .is('deleted_at', null)
    .gte('expense_date', startDate)
    .lte('expense_date', endDate);

  if (expenses) {
    transactions.push(
      ...expenses.map((e: any) => ({
        id: e.id,
        type: 'Expense' as const,
        amount: e.amount,
        currency: e.currency,
        date: e.expense_date,
        category: e.expense_categories?.name ?? null,
        description: e.description,
      }))
    );
  }

  return transactions;
}

// ===== P&L STATEMENT =====

/**
 * Génère un rapport Profit & Loss pour une période donnée
 */
export async function generateProfitAndLoss(
  businessId: string,
  startDate: string,
  endDate: string,
  currency: 'HTG' | 'USD' = 'HTG'
): Promise<ProfitAndLossReport> {
  const cacheKey = generateCacheKey('P&L', businessId, { startDate, endDate, currency });
  const cached = getFromCache<ProfitAndLossReport>(cacheKey);
  if (cached) return cached;

  const toReport = await getReportConverter(businessId, currency);
  const transactions = await getTransactionsForPeriod(businessId, startDate, endDate);

  const report: ProfitAndLossReport = {
    period: { start: startDate, end: endDate },
    currency,
    revenues: {
      salesRevenue: 0,
      otherIncome: 0,
      refunds: 0,
      totalRevenue: 0,
    },
    expenses: {
      cogs: 0,
      salaries: 0,
      rent: 0,
      utilities: 0,
      marketing: 0,
      transport: 0,
      officeSupplies: 0,
      professional: 0,
      insurance: 0,
      maintenance: 0,
      depreciation: 0,
      interest: 0,
      other: 0,
      totalExpenses: 0,
    },
    profitBeforeTax: 0,
    estimatedTax: 0,
    netProfit: 0,
  };

  // Agrège les transactions par catégorie
  let unconvertedCount = 0;
  for (const txn of transactions) {
    const convertedAmount = toReport(Number(txn.amount) || 0, txn.currency);
    // Autre devise sans taux saisi : hors du total, mais compté.
    if (convertedAmount === null) {
      unconvertedCount += 1;
      continue;
    }

    switch (txn.type) {
      case 'Sale':
        report.revenues.salesRevenue += convertedAmount;
        break;

      case 'Refund':
        report.revenues.refunds += convertedAmount;
        break;

      case 'Expense':
        if (txn.category === 'Salaries') report.expenses.salaries += convertedAmount;
        else if (txn.category === 'Rent') report.expenses.rent += convertedAmount;
        else if (txn.category === 'Utilities') report.expenses.utilities += convertedAmount;
        else if (txn.category === 'Marketing') report.expenses.marketing += convertedAmount;
        else if (txn.category === 'Transport') report.expenses.transport += convertedAmount;
        else if (txn.category === 'Office') report.expenses.officeSupplies += convertedAmount;
        else if (txn.category === 'Professional') report.expenses.professional += convertedAmount;
        else if (txn.category === 'Insurance') report.expenses.insurance += convertedAmount;
        else if (txn.category === 'Maintenance') report.expenses.maintenance += convertedAmount;
        else if (txn.category === 'Depreciation') report.expenses.depreciation += convertedAmount;
        else if (txn.category === 'Interest') report.expenses.interest += convertedAmount;
        else report.expenses.other += convertedAmount;
        break;

      case 'Purchase':
        // Achats = COGS (simplified)
        report.expenses.cogs += convertedAmount;
        break;
    }
  }

  // Calcule les totaux
  report.revenues.totalRevenue =
    report.revenues.salesRevenue + report.revenues.otherIncome - report.revenues.refunds;

  report.expenses.totalExpenses = Object.values(report.expenses)
    .filter((v) => typeof v === 'number')
    .reduce((sum, v) => sum + v, 0);

  report.profitBeforeTax = report.revenues.totalRevenue - report.expenses.totalExpenses;
  report.estimatedTax = Math.max(0, report.profitBeforeTax * 0.3); // 30% corporate tax
  report.netProfit = report.profitBeforeTax - report.estimatedTax;
  report.unconvertedCount = unconvertedCount;

  setInCache(cacheKey, report);
  return report;
}

// ===== BALANCE SHEET =====

/** Apports et réserves (solde créditeur) ; prélèvements (solde débiteur). */
const EQUITY_CAPITAL_CODES  = ['1010', '1020', '1070', '1080'];
const EQUITY_DRAWINGS_CODES = ['4580'];

/**
 * Capital et prélèvements du propriétaire, lus au JOURNAL — jamais inventés.
 *
 * Le bilan portait ici `ownerCapital: 10000`, un nombre qui n'appartenait à
 * personne : le même capital pour un marchand qui n'a jamais rien apporté que
 * pour celui qui a mis un million. Il gonflait les capitaux propres, donc le
 * total passif + capitaux propres, et faussait tout rapprochement avec l'actif.
 *
 * La vraie valeur est au journal : les apports créditent 1010 / 1020 (capital
 * social, apports du propriétaire), les réserves 1070 / 1080, les prélèvements
 * débitent 4580. Aucun apport enregistré → 0, et le bilan le dit ainsi.
 *
 * 1300 (résultat de l'exercice) est volontairement exclu : `retainedEarnings`
 * le couvre déjà, l'additionner compterait le bénéfice deux fois.
 *
 * Les montants du journal sont en base (HTG) : `inReport` les ramène à la devise
 * du rapport, et compte ceux qu'il ne peut pas convertir.
 */
async function getJournalEquity(
  supabaseServer: any,
  businessId: string,
  asOfDate: string,
  inReport: (amount: unknown, from: string | null | undefined) => number,
): Promise<{ ownerCapital: number; ownerDrawings: number }> {
  const empty = { ownerCapital: 0, ownerDrawings: 0 };
  try {
    const codes = [...EQUITY_CAPITAL_CODES, ...EQUITY_DRAWINGS_CODES];
    const { data: accounts } = await supabaseServer
      .from('chart_of_accounts')
      .select('id, code')
      .eq('business_id', businessId)
      .in('code', codes);

    if (!accounts?.length) return empty;

    const codeById = new Map<string, string>(accounts.map((a: any) => [a.id, String(a.code)]));

    // Filtré sur les comptes de capitaux propres d'abord : ce sont quelques
    // lignes par entreprise (un apport, un prélèvement), pas tout le journal.
    const { data: lines } = await supabaseServer
      .from('journal_entry_lines')
      .select('journal_entry_id, account_id, base_debit, base_credit')
      .eq('business_id', businessId)
      .in('account_id', Array.from(codeById.keys()));

    if (!lines?.length) return empty;

    // Le bilan est arrêté à une date : une écriture postérieure, ou annulée,
    // n'en fait pas partie.
    const { data: entries } = await supabaseServer
      .from('journal_entries')
      .select('id, entry_date, status')
      .in('id', Array.from(new Set(lines.map((l: any) => l.journal_entry_id))));

    const eligible = new Set(
      (entries ?? [])
        .filter((e: any) => e.status !== 'void' && String(e.entry_date) <= asOfDate)
        .map((e: any) => e.id),
    );

    let ownerCapital  = 0;
    let ownerDrawings = 0;
    for (const l of lines as any[]) {
      if (!eligible.has(l.journal_entry_id)) continue;
      // Une ligne à zéro n'a rien à convertir : la passer à `inReport` la
      // compterait comme un montant laissé hors du total.
      const debit  = Number(l.base_debit)  ? inReport(l.base_debit,  'HTG') : 0;
      const credit = Number(l.base_credit) ? inReport(l.base_credit, 'HTG') : 0;
      const code   = codeById.get(l.account_id) ?? '';
      if (EQUITY_CAPITAL_CODES.includes(code))  ownerCapital  += credit - debit;
      if (EQUITY_DRAWINGS_CODES.includes(code)) ownerDrawings += debit - credit;
    }

    return {
      ownerCapital:  Math.max(0, parseFloat(ownerCapital.toFixed(2))),
      ownerDrawings: Math.max(0, parseFloat(ownerDrawings.toFixed(2))),
    };
  } catch {
    // Journal illisible : 0, jamais un capital deviné.
    return empty;
  }
}

/**
 * Génère un Bilan (Balance Sheet) à une date donnée
 */
export async function generateBalanceSheet(
  businessId: string,
  asOfDate: string,
  currency: 'HTG' | 'USD' = 'HTG'
): Promise<BalanceSheetReport> {
  const supabaseServer = await getSupabaseServer();

  const cacheKey = generateCacheKey('BalanceSheet', businessId, { asOfDate, currency });
  const cached = getFromCache<BalanceSheetReport>(cacheKey);
  if (cached) return cached;

  const toReport = await getReportConverter(businessId, currency);

  // Montant converti, ou 0 s'il est inconvertible (autre devise sans taux
  // saisi) : exclu du total, et compté dans `unconvertedCount`.
  let unconvertedCount = 0;
  const inReport = (amount: unknown, from: string | null | undefined): number => {
    const v = toReport(Number(amount) || 0, from);
    if (v === null) {
      unconvertedCount += 1;
      return 0;
    }
    return v;
  };

  // Récupère l'inventaire actuel de l'entreprise. `currency` est la devise du
  // prix d'achat : sans elle, chaque stock était converti comme s'il était en
  // dollars. `business_id` : un compte peut porter plusieurs entreprises.
  const { data: products } = await supabaseServer
    .from('products')
    .select('stock_quantity, purchase_price, currency')
    .eq('business_id', businessId);

  let inventoryValue = 0;
  if (products) {
    inventoryValue = products.reduce((sum: number, p: any) => {
      return sum + inReport(Number(p.stock_quantity) * Number(p.purchase_price), p.currency);
    }, 0);
  }

  // Récupère les comptes créditeurs (Accounts Payable)
  //
  // Deux erreurs cumulées ici : la colonne (`total_amount`) et la valeur
  // filtrée. En base, `payment_status` vaut `'credit'` — « À Crédit » est le
  // libellé de l'interface, traduit à l'écriture (app/actions/purchases.ts:51).
  // Filtrer sur le libellé ne remontait donc jamais rien : la dette fournisseur
  // du bilan restait à zéro même avec des achats à crédit ouverts.
  const { data: payables } = await supabaseServer
    .from('purchases')
    .select('total_amount, currency, payment_status')
    .eq('business_id', businessId)
    .is('deleted_at', null)
    .eq('payment_status', 'credit')
    .lte('purchase_date', asOfDate);

  let accountsPayable = 0;
  if (payables) {
    accountsPayable = payables.reduce((sum: number, p: any) => {
      return sum + inReport(p.total_amount, p.currency);
    }, 0);
  }

  // Récupère le solde de caisse (calculé à partir des transactions)
  // Simplifié: utiliser la somme des ventes moins les dépenses
  const { data: allSales } = await supabaseServer
    .from('sales')
    .select('total_amount, currency')
    .eq('business_id', businessId)
    .lte('created_at', asOfDate);

  let cashFromSales = 0;
  if (allSales) {
    cashFromSales = allSales.reduce((sum: number, s: any) => {
      return sum + inReport(s.total_amount, s.currency);
    }, 0);
  }

  // `expense_date`, pas `date` — même erreur qu'au-dessus, même conséquence :
  // les dépenses ne sortaient pas, et le solde de caisse ne retranchait rien.
  const { data: allExpenses } = await supabaseServer
    .from('expenses')
    .select('amount, currency')
    .eq('business_id', businessId)
    .is('deleted_at', null)
    .lte('expense_date', asOfDate);

  let cashUsed = 0;
  if (allExpenses) {
    cashUsed = allExpenses.reduce((sum: number, e: any) => {
      return sum + inReport(e.amount, e.currency);
    }, 0);
  }

  const cashBalance = cashFromSales - cashUsed;

  // P&L depuis le début pour retained earnings (simplifié)
  // Utiliser la première transaction comme start date
  const retainedEarnings = cashBalance - accountsPayable;

  const { ownerCapital, ownerDrawings } = await getJournalEquity(
    supabaseServer, businessId, asOfDate, inReport,
  );

  const report: BalanceSheetReport = {
    asOfDate,
    currency,
    assets: {
      liquidAssets: Math.max(0, cashBalance),
      currentAssets: inventoryValue,
      fixedAssets: 0, // TODO: Ajouter les équipements
      totalAssets: 0,
    },
    liabilities: {
      currentLiabilities: accountsPayable,
      longTermLiabilities: 0,
      totalLiabilities: accountsPayable,
    },
    equity: {
      ownerCapital,
      ownerDrawings,
      retainedEarnings: Math.max(0, retainedEarnings),
      totalEquity: 0,
    },
    totalLiabilitiesAndEquity: 0,
    unconvertedCount,
  };

  report.assets.totalAssets =
    report.assets.liquidAssets + report.assets.currentAssets + report.assets.fixedAssets;

  report.equity.totalEquity =
    report.equity.ownerCapital - report.equity.ownerDrawings + report.equity.retainedEarnings;

  report.totalLiabilitiesAndEquity = report.liabilities.totalLiabilities + report.equity.totalEquity;

  setInCache(cacheKey, report);
  return report;
}

// ===== CASH FLOW STATEMENT =====

/**
 * Génère un État des Flux de Trésorerie (Cash Flow Statement)
 */
export async function generateCashFlow(
  businessId: string,
  startDate: string,
  endDate: string,
  currency: 'HTG' | 'USD' = 'HTG'
): Promise<CashFlowReport> {
  const cacheKey = generateCacheKey('CashFlow', businessId, { startDate, endDate, currency });
  const cached = getFromCache<CashFlowReport>(cacheKey);
  if (cached) return cached;

  const toReport = await getReportConverter(businessId, currency);
  const transactions = await getTransactionsForPeriod(businessId, startDate, endDate);

  // Récupère d'abord le P&L pour le Net Income
  const pnl = await generateProfitAndLoss(businessId, startDate, endDate, currency);

  const report: CashFlowReport = {
    period: { start: startDate, end: endDate },
    currency,
    operatingActivities: {
      netIncome: pnl.netProfit,
      adjustments: 0, // TODO: Ajouter les ajustements (dépréciation, etc.)
      netCashFromOperations: pnl.netProfit,
    },
    investingActivities: {
      capitalExpenditures: 0,
      equipmentPurchases: 0,
      netCashFromInvesting: 0,
    },
    financingActivities: {
      loanProceeds: 0,
      loanRepayments: 0,
      ownerDrawals: 0,
      netCashFromFinancing: 0,
    },
    netChangeInCash: pnl.netProfit,
    beginningCash: 0, // TODO: Calculer le solde initial
    endingCash: pnl.netProfit,
    // Mêmes transactions que le P&L : ses montants inconvertibles sont ceux-ci.
    unconvertedCount: pnl.unconvertedCount ?? 0,
  };

  // Agrège les flux de trésorerie par catégorie
  for (const txn of transactions) {
    const convertedAmount = toReport(Number(txn.amount) || 0, txn.currency);
    // Déjà compté dans pnl.unconvertedCount (mêmes transactions) : on l'exclut.
    if (convertedAmount === null) continue;

    if (txn.type === 'Expense') {
      if (txn.category === 'CapEx') {
        report.investingActivities.capitalExpenditures += convertedAmount;
      }
    }
  }

  report.investingActivities.netCashFromInvesting =
    -report.investingActivities.capitalExpenditures - report.investingActivities.equipmentPurchases;

  report.financingActivities.netCashFromFinancing =
    report.financingActivities.loanProceeds -
    report.financingActivities.loanRepayments -
    report.financingActivities.ownerDrawals;

  report.netChangeInCash =
    report.operatingActivities.netCashFromOperations +
    report.investingActivities.netCashFromInvesting +
    report.financingActivities.netCashFromFinancing;

  report.endingCash = report.beginningCash + report.netChangeInCash;

  setInCache(cacheKey, report);
  return report;
}

// ===== CACHE MANAGEMENT =====

export function clearFinancialCache(businessId?: string): void {
  invalidateCache(businessId);
}
