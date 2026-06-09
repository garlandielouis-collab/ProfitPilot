'use server';

import { getBusinessContext } from '../../lib/serverAuth';
import { getSupabaseServer } from '../../lib/supabaseServerClient';

// ── Dashboard v2 types ────────────────────────────────────────────────────────

export type LedgerRow = {
  id: string;
  date: string;
  description: string;
  category: string;
  type: 'Vann' | 'Acha' | 'Dèt';
  payment_method: string;
  amount: number;
  currency: string;
  source: 'sales' | 'expenses' | 'purchases';
};

export type CashflowPoint = {
  label: string;
  cashIn: number;
  cashOut: number;
  profit: number;
};

export type DashboardProduct = {
  id: string;
  name: string;
  stock_quantity: number;
  sale_price: number;
  purchase_price: number;
  category: string | null;
};

export type DashboardV2Data = {
  cashflow: CashflowPoint[];
  ledger: LedgerRow[];
  totals: { cashIn: number; cashOut: number; profit: number; debtTotal: number };
  products?: DashboardProduct[];
};

// ── getDashboardV2Action ──────────────────────────────────────────────────────

export async function getDashboardV2Action(
  mode: 'month' | 'year' | 'range',
  year: number,
  monthFrom: number = 0,
  monthTo: number = monthFrom,
): Promise<DashboardV2Data> {
  const EMPTY = { cashflow: [], ledger: [], totals: { cashIn: 0, cashOut: 0, profit: 0, debtTotal: 0 } };
  let businessId: string;
  let supabase: any;

  try {
    const ctx = await getBusinessContext();
    businessId = ctx.businessId;
    supabase   = ctx.supabase;
  } catch { return EMPTY; }

  let dateFrom: string;
  let dateTo:   string;
  if (mode === 'year') {
    dateFrom = `${year}-01-01`;
    dateTo   = `${year}-12-31`;
  } else {
    dateFrom = new Date(year, monthFrom, 1).toISOString().split('T')[0];
    dateTo   = new Date(year, monthTo + 1, 0).toISOString().split('T')[0];
  }

  // ── Parallel fetch — all data in one network round ────────────────────────
  const [
    { data: biz },
    { data: salesRaw },
    { data: expRaw },
    { data: purchRaw },
    { data: prodsRaw },
  ] = await Promise.all([
    supabase
      .from('businesses')
      .select('exchange_rate, default_currency')
      .eq('id', businessId)
      .maybeSingle(),
    supabase
      .from('sales')
      .select('id, total_amount, currency, payment_method, payment_status, customer_name, invoice_number, created_at')
      .eq('business_id', businessId)
      .is('deleted_at', null)
      .gte('created_at', `${dateFrom}T00:00:00`)
      .lte('created_at', `${dateTo}T23:59:59`),
    supabase
      .from('expenses')
      .select('id, amount, currency, payment_method, payment_status, description, expense_date, expense_categories(name)')
      .eq('business_id', businessId)
      .is('deleted_at', null)
      .gte('expense_date', dateFrom)
      .lte('expense_date', dateTo),
    supabase
      .from('purchases')
      .select('id, total_amount, currency, payment_status, purchase_date, supplier_id')
      .eq('business_id', businessId)
      .is('deleted_at', null)
      .gte('purchase_date', dateFrom)
      .lte('purchase_date', dateTo),
    supabase
      .from('products')
      .select('id, name, stock_quantity, sale_price, purchase_price, category')
      .eq('business_id', businessId)
      .is('deleted_at', null),
  ]);

  const sales     = (salesRaw  ?? []) as any[];
  const expenses  = (expRaw    ?? []) as any[];
  const purchases = (purchRaw  ?? []) as any[];
  const products  = (prodsRaw  ?? []) as DashboardProduct[];

  // ── Exchange rate (now from parallel fetch) ────────────────────────────────
  const exchangeRate   = Number((biz as any)?.exchange_rate ?? 130);
  const reportCurrency = ((biz as any)?.default_currency ?? 'HTG') as 'HTG' | 'USD';
  const toReport = (amount: number, currency: string): number => {
    const c = (currency ?? 'HTG').toUpperCase();
    if (c === reportCurrency) return amount;
    if (reportCurrency === 'HTG' && c === 'USD') return amount * exchangeRate;
    if (reportCurrency === 'USD' && c === 'HTG') return amount / exchangeRate;
    return amount;
  };

  // ── Build ledger ──────────────────────────────────────────────────────────
  const seenInvoices = new Set<string>();
  const ledger: LedgerRow[] = [];

  for (const s of sales) {
    const inv = s.invoice_number ?? s.id;
    if (seenInvoices.has(inv)) continue;
    seenInvoices.add(inv);
    ledger.push({
      id:             s.id,
      date:           (s.created_at as string).split('T')[0],
      description:    s.customer_name ? `Vant — ${s.customer_name}` : `Vant #${String(inv).slice(-6)}`,
      category:       s.customer_name ?? 'Kliyan',
      type:           'Vann',
      payment_method: s.payment_method ?? '—',
      amount:         toReport(Number(s.total_amount), s.currency),
      currency:       reportCurrency,
      source:         'sales',
    });
  }

  for (const e of expenses) {
    const catName = (e.expense_categories as any)?.name ?? '—';
    ledger.push({
      id:             e.id,
      date:           e.expense_date,
      description:    e.description ?? catName ?? 'Depans',
      category:       catName,
      type:           'Acha',
      payment_method: e.payment_method ?? '—',
      amount:         toReport(Number(e.amount), e.currency),
      currency:       reportCurrency,
      source:         'expenses',
    });
  }

  for (const p of purchases) {
    ledger.push({
      id:             p.id,
      date:           p.purchase_date,
      description:    'Acha — Founisè',
      category:       'Acha Stock',
      type:           'Dèt',
      payment_method: p.payment_status ?? '—',
      amount:         toReport(Number(p.total_amount), p.currency),
      currency:       reportCurrency,
      source:         'purchases',
    });
  }

  ledger.sort((a, b) => b.date.localeCompare(a.date));

  // ── Build cashflow buckets ────────────────────────────────────────────────
  const MONTHS_SHORT = ['Jan','Fev','Mas','Avr','Me','Jen','Jil','Out','Sep','Okt','Nov','Des'];
  const bucketMap = new Map<string, { cashIn: number; cashOut: number }>();

  if (mode === 'month') {
    const daysInMonth = new Date(year, monthFrom + 1, 0).getDate();
    for (let d = 1; d <= daysInMonth; d++)
      bucketMap.set(String(d).padStart(2, '0'), { cashIn: 0, cashOut: 0 });

    for (const s of sales) {
      const day = String(new Date(s.created_at).getDate()).padStart(2, '0');
      const b = bucketMap.get(day);
      if (b) b.cashIn += toReport(Number(s.total_amount), s.currency);
    }
    for (const e of expenses) {
      const day = String(new Date(e.expense_date + 'T00:00:00').getDate()).padStart(2, '0');
      const b = bucketMap.get(day);
      if (b) b.cashOut += toReport(Number(e.amount), e.currency);
    }
    for (const p of purchases) {
      const day = String(new Date(p.purchase_date + 'T00:00:00').getDate()).padStart(2, '0');
      const b = bucketMap.get(day);
      if (b) b.cashOut += toReport(Number(p.total_amount), p.currency);
    }
  } else {
    const startM = mode === 'year' ? 0  : monthFrom;
    const endM   = mode === 'year' ? 11 : monthTo;
    for (let m = startM; m <= endM; m++)
      bucketMap.set(MONTHS_SHORT[m], { cashIn: 0, cashOut: 0 });

    for (const s of sales) {
      const m = MONTHS_SHORT[new Date(s.created_at).getMonth()];
      const b = bucketMap.get(m);
      if (b) b.cashIn += toReport(Number(s.total_amount), s.currency);
    }
    for (const e of expenses) {
      const m = MONTHS_SHORT[new Date(e.expense_date + 'T00:00:00').getMonth()];
      const b = bucketMap.get(m);
      if (b) b.cashOut += toReport(Number(e.amount), e.currency);
    }
    for (const p of purchases) {
      const m = MONTHS_SHORT[new Date(p.purchase_date + 'T00:00:00').getMonth()];
      const b = bucketMap.get(m);
      if (b) b.cashOut += toReport(Number(p.total_amount), p.currency);
    }
  }

  const cashflow: CashflowPoint[] = Array.from(bucketMap.entries()).map(([label, { cashIn, cashOut }]) => ({
    label, cashIn, cashOut, profit: cashIn - cashOut,
  }));

  // ── Totals ────────────────────────────────────────────────────────────────
  const cashIn    = sales.reduce((s: number, r: any) => s + toReport(Number(r.total_amount), r.currency), 0);
  const cashOut   = expenses.reduce((s: number, r: any) => s + toReport(Number(r.amount), r.currency), 0);
  const debtTotal = purchases.reduce((s: number, r: any) => s + toReport(Number(r.total_amount), r.currency), 0);

  return {
    cashflow,
    ledger,
    totals: { cashIn, cashOut, profit: cashIn - cashOut, debtTotal },
    products,
  };
}

export type WeeklySummary = {
  totalSales: number;
  totalExpenses: number;
  profit: number;
  salesCount: number;
  productsSold: number;
  criticalStockItems: number;
  topProducts: Array<{ name: string; quantity: number; revenue: number }>;
  lowStockProducts: Array<{ name: string; quantity: number; category: string }>;
  totalDebts: number;
  overdueDebts: number;
  cashAvailable: number;
};

export type DashboardData = {
  monthlyData: Array<{ month: string; revenue: number; expenses: number; profit: number }>;
  annualData: Array<{ month: string; netProfit: number }>;
  currentMonth: { revenue: number; expenses: number; profit: number };
};

// ── getWeeklySummaryAction ────────────────────────────────────────────────────

export async function getWeeklySummaryAction(): Promise<WeeklySummary> {
  const EMPTY: WeeklySummary = {
    totalSales: 0, totalExpenses: 0, profit: 0, salesCount: 0,
    productsSold: 0, criticalStockItems: 0, topProducts: [],
    lowStockProducts: [], totalDebts: 0, overdueDebts: 0, cashAvailable: 0,
  };

  let businessId: string, userId: string, supabase: any;
  try {
    const ctx = await getBusinessContext();
    businessId = ctx.businessId; userId = ctx.userId; supabase = ctx.supabase;
  } catch { return EMPTY; }

  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  const weekStart = weekAgo.toISOString().split('T')[0];
  const fifteenDaysAgo = new Date();
  fifteenDaysAgo.setDate(fifteenDaysAgo.getDate() - 15);
  const fifteenAgoStr = fifteenDaysAgo.toISOString().split('T')[0];

  const [salesRes, expRes, prodsRes, purchRes] = await Promise.all([
    supabase.from('sales').select('id, total_amount, customer_name, created_at')
      .eq('business_id', businessId).is('deleted_at', null).gte('created_at', weekStart + 'T00:00:00'),
    supabase.from('expenses').select('id, amount, expense_date')
      .eq('business_id', businessId).is('deleted_at', null).gte('expense_date', weekStart),
    supabase.from('products').select('id, name, stock_quantity, sale_price, purchase_price, category')
      .eq('business_id', businessId),
    supabase.from('purchases').select('id, total_amount, payment_status, purchase_date')
      .eq('business_id', businessId).is('deleted_at', null).eq('payment_status', 'credit'),
  ]);

  const sales    = (salesRes.data  ?? []) as any[];
  const expenses = (expRes.data    ?? []) as any[];
  const products = (prodsRes.data  ?? []) as any[];
  const purchases= (purchRes.data  ?? []) as any[];

  const totalSales    = sales.reduce((s: number, r: any) => s + Number(r.total_amount ?? 0), 0);
  const totalExpenses = expenses.reduce((s: number, r: any) => s + Number(r.amount ?? 0), 0);
  const profit        = totalSales - totalExpenses;
  const totalDebts    = purchases.reduce((s: number, r: any) => s + Number(r.total_amount ?? 0), 0);
  const overdueDebts  = purchases
    .filter((p: any) => p.purchase_date < fifteenAgoStr)
    .reduce((s: number, r: any) => s + Number(r.total_amount ?? 0), 0);

  const topProducts = Object.values(
    sales.reduce((acc: any, s: any) => {
      const name = s.customer_name ?? 'Kliyan';
      if (!acc[name]) acc[name] = { name, quantity: 0, revenue: 0 };
      acc[name].revenue += Number(s.total_amount ?? 0);
      acc[name].quantity += 1;
      return acc;
    }, {})
  ).sort((a: any, b: any) => b.revenue - a.revenue).slice(0, 5) as any[];

  const lowStockProducts = products
    .filter((p: any) => Number(p.stock_quantity) < 5)
    .map((p: any) => ({ name: p.name, quantity: Number(p.stock_quantity), category: p.category ?? '—' }));

  return {
    totalSales, totalExpenses, profit,
    salesCount:         sales.length,
    productsSold:       sales.length,
    criticalStockItems: products.filter((p: any) => Number(p.stock_quantity) === 0).length,
    topProducts,
    lowStockProducts,
    totalDebts,
    overdueDebts,
    cashAvailable: profit - totalDebts,
  };
}
