/**
 * Financial Reporting Engine pour ProfitPilot
 * Génère P&L, Balance Sheet, et Cash Flow Statements
 * Avec memoization et support multi-currency
 */

import { getSupabaseServer } from './supabaseServerClient';
import { getTransactionPosting, getAccountByCode } from './chartOfAccounts';

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
 * Récupère le taux de change de la base de données
 */
async function getExchangeRate(businessId: string): Promise<number> {
  try {
    const supabaseServer = await getSupabaseServer();
    const { data } = await supabaseServer
      .from('businesses')
      .select('exchange_rate')
      .eq('id', businessId)
      .single();

    return data?.exchange_rate || 1;
  } catch (error) {
    console.error('Error fetching exchange rate:', error);
    return 1;
  }
}

/**
 * Convertit un montant d'une devise à une autre
 */
function convertCurrency(
  amount: number,
  from: 'HTG' | 'USD',
  to: 'HTG' | 'USD',
  exchangeRate: number
): number {
  if (from === to) return amount;
  if (from === 'HTG' && to === 'USD') {
    return amount / exchangeRate;
  }
  return amount * exchangeRate;
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
  const { data: purchases } = await supabaseServer
    .from('purchases')
    .select('id,total_purchase_amount,currency,payment_status,purchase_date')
    .eq('business_id', businessId)
    .gte('purchase_date', startDate)
    .lte('purchase_date', endDate);

  if (purchases) {
    transactions.push(
      ...purchases.map((p: any) => ({
        id: p.id,
        type: 'Purchase' as const,
        amount: p.total_purchase_amount,
        currency: p.currency,
        date: p.purchase_date,
        payment_method: p.payment_status,
      }))
    );
  }

  // Récupère les dépenses
  const { data: expenses } = await supabaseServer
    .from('expenses')
    .select('id,amount,currency,category,date,description')
    .eq('business_id', businessId)
    .gte('date', startDate)
    .lte('date', endDate);

  if (expenses) {
    transactions.push(
      ...expenses.map((e: any) => ({
        id: e.id,
        type: 'Expense' as const,
        amount: e.amount,
        currency: e.currency,
        date: e.date,
        category: e.category,
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

  const exchangeRate = await getExchangeRate(businessId);
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
  for (const txn of transactions) {
    const convertedAmount = convertCurrency(txn.amount, txn.currency, currency, exchangeRate);

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

  setInCache(cacheKey, report);
  return report;
}

// ===== BALANCE SHEET =====

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

  const exchangeRate = await getExchangeRate(businessId);

  // Récupère l'inventaire actuel (RLS filtre par user_id = auth.uid())
  const { data: products } = await supabaseServer
    .from('products')
    .select('stock_quantity, purchase_price');

  let inventoryValue = 0;
  if (products) {
    inventoryValue = products.reduce((sum: number, p: any) => {
      const converted = convertCurrency(
        p.stock_quantity * p.purchase_price,
        p.currency,
        currency,
        exchangeRate
      );
      return sum + converted;
    }, 0);
  }

  // Récupère les comptes créditeurs (Accounts Payable)
  const { data: payables } = await supabaseServer
    .from('purchases')
    .select('total_purchase_amount, currency, payment_status')
    .eq('business_id', businessId)
    .eq('payment_status', 'À Crédit')
    .lte('purchase_date', asOfDate);

  let accountsPayable = 0;
  if (payables) {
    accountsPayable = payables.reduce((sum: number, p: any) => {
      const converted = convertCurrency(p.total_purchase_amount, p.currency, currency, exchangeRate);
      return sum + converted;
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
      const converted = convertCurrency(s.total_amount, s.currency, currency, exchangeRate);
      return sum + converted;
    }, 0);
  }

  const { data: allExpenses } = await supabaseServer
    .from('expenses')
    .select('amount, currency')
    .eq('business_id', businessId)
    .lte('date', asOfDate);

  let cashUsed = 0;
  if (allExpenses) {
    cashUsed = allExpenses.reduce((sum: number, e: any) => {
      const converted = convertCurrency(e.amount, e.currency, currency, exchangeRate);
      return sum + converted;
    }, 0);
  }

  const cashBalance = cashFromSales - cashUsed;

  // P&L depuis le début pour retained earnings (simplifié)
  // Utiliser la première transaction comme start date
  const retainedEarnings = cashBalance - accountsPayable;

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
      ownerCapital: 10000, // Placeholder - should come from settings
      ownerDrawings: 0,
      retainedEarnings: Math.max(0, retainedEarnings),
      totalEquity: 0,
    },
    totalLiabilitiesAndEquity: 0,
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

  const exchangeRate = await getExchangeRate(businessId);
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
  };

  // Agrège les flux de trésorerie par catégorie
  for (const txn of transactions) {
    const convertedAmount = convertCurrency(txn.amount, txn.currency, currency, exchangeRate);

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
