'use server';

import { supabaseServer } from '../../lib/supabaseServerClient';

// ── Dashboard v2 types ────────────────────────────────────────────────────────

export type LedgerRow = {
  id: string;
  date: string;           // ISO date string YYYY-MM-DD
  description: string;
  category: string;       // for expenses: category; for sales: client_name; for purchases: supplier
  type: 'Vann' | 'Acha' | 'Dèt';
  payment_method: string;
  amount: number;
  currency: string;
  source: 'sales' | 'expenses' | 'purchases';
};

export type CashflowPoint = {
  label: string;          // "01", "02" … "31" for month view; "Jan"…"Dec" for year view
  cashIn: number;
  cashOut: number;
  profit: number;
};

export type DashboardV2Data = {
  cashflow: CashflowPoint[];
  ledger: LedgerRow[];
  totals: { cashIn: number; cashOut: number; profit: number; debtTotal: number };
};

// ── getDashboardV2Action ──────────────────────────────────────────────────────
// mode='month' → single month  (monthFrom = target month, 0-based)
// mode='year'  → full year     (all 12 months)
// mode='range' → monthFrom..monthTo span (both inclusive, 0-based)

export async function getDashboardV2Action(
  mode: 'month' | 'year' | 'range',
  year: number,
  monthFrom: number = 0,
  monthTo: number = monthFrom,
): Promise<DashboardV2Data> {
  const { data: { user } } = await supabaseServer.auth.getUser();
  if (!user) return { cashflow: [], ledger: [], totals: { cashIn: 0, cashOut: 0, profit: 0, debtTotal: 0 } };

  // ── date bounds ─────────────────────────────────────────────────────────────
  let dateFrom: string;
  let dateTo: string;
  if (mode === 'year') {
    dateFrom = `${year}-01-01`;
    dateTo   = `${year}-12-31`;
  } else {
    // month (monthFrom === monthTo) or range (monthFrom < monthTo)
    dateFrom = new Date(year, monthFrom, 1).toISOString().split('T')[0];
    dateTo   = new Date(year, monthTo + 1, 0).toISOString().split('T')[0];
  }

  // ── parallel fetch ───────────────────────────────────────────────────────────
  const [
    { data: salesRaw },
    { data: expRaw },
    { data: purchRaw },
  ] = await Promise.all([
    supabaseServer
      .from('sales')
      .select('id, total_amount, currency, payment_method, payment_status, client_name, invoice_number, created_at')
      .eq('owner_id', user.id)
      .gte('created_at', `${dateFrom}T00:00:00`)
      .lte('created_at', `${dateTo}T23:59:59`),

    supabaseServer
      .from('expenses')
      .select('id, amount, currency, payment_method, payment_status, description, category, date')
      .eq('owner_id', user.id)
      .gte('date', dateFrom)
      .lte('date', dateTo),

    supabaseServer
      .from('purchases')
      .select('id, total_purchase_amount, payment_status, purchase_date, supplier_id')
      .eq('owner_id', user.id)
      .gte('purchase_date', dateFrom)
      .lte('purchase_date', dateTo),
  ]);

  const sales     = (salesRaw  ?? []) as any[];
  const expenses  = (expRaw    ?? []) as any[];
  const purchases = (purchRaw  ?? []) as any[];

  // ── build ledger ─────────────────────────────────────────────────────────────
  const seenInvoices = new Set<string>();
  const ledger: LedgerRow[] = [];

  for (const s of sales) {
    const inv = s.invoice_number ?? s.id;
    if (seenInvoices.has(inv)) continue;
    seenInvoices.add(inv);
    ledger.push({
      id:             s.id,
      date:           (s.created_at as string).split('T')[0],
      description:    s.client_name ? `Vant – ${s.client_name}` : `Vant #${String(inv).slice(-6)}`,
      category:       s.client_name ?? 'Kliyan inconnu',
      type:           'Vann',
      payment_method: s.payment_method ?? '—',
      amount:         Number(s.total_amount),
      currency:       s.currency ?? 'HTG',
      source:         'sales',
    });
  }

  for (const e of expenses) {
    ledger.push({
      id:             e.id,
      date:           e.date,
      description:    e.description ?? e.category ?? 'Depans',
      category:       e.category ?? '—',
      type:           'Acha',
      payment_method: e.payment_method ?? '—',
      amount:         Number(e.amount),
      currency:       e.currency ?? 'HTG',
      source:         'expenses',
    });
  }

  for (const p of purchases) {
    ledger.push({
      id:             p.id,
      date:           p.purchase_date,
      description:    `Achte – Founisè`,
      category:       'Acha Stock',
      type:           'Dèt',
      payment_method: p.payment_status ?? '—',
      amount:         Number(p.total_purchase_amount),
      currency:       'HTG',
      source:         'purchases',
    });
  }

  ledger.sort((a, b) => b.date.localeCompare(a.date));

  // ── build cashflow buckets ────────────────────────────────────────────────────
  const MONTHS_SHORT = ['Jan','Fev','Mas','Avr','Me','Jen','Jil','Out','Sep','Okt','Nov','Des'];
  const bucketMap = new Map<string, { cashIn: number; cashOut: number }>();

  if (mode === 'month') {
    // Daily buckets for the single month
    const daysInMonth = new Date(year, monthFrom + 1, 0).getDate();
    for (let d = 1; d <= daysInMonth; d++)
      bucketMap.set(String(d).padStart(2, '0'), { cashIn: 0, cashOut: 0 });

    for (const s of sales) {
      const day = String(new Date(s.created_at).getDate()).padStart(2, '0');
      const b = bucketMap.get(day);
      if (b) b.cashIn += Number(s.total_amount);
    }
    for (const e of expenses) {
      const day = String(new Date(e.date + 'T00:00:00').getDate()).padStart(2, '0');
      const b = bucketMap.get(day);
      if (b) b.cashOut += Number(e.amount);
    }
    for (const p of purchases) {
      const day = String(new Date(p.purchase_date + 'T00:00:00').getDate()).padStart(2, '0');
      const b = bucketMap.get(day);
      if (b) b.cashOut += Number(p.total_purchase_amount);
    }
  } else {
    // Monthly buckets — full year or range
    const startM = mode === 'year' ? 0  : monthFrom;
    const endM   = mode === 'year' ? 11 : monthTo;
    for (let m = startM; m <= endM; m++)
      bucketMap.set(MONTHS_SHORT[m], { cashIn: 0, cashOut: 0 });

    for (const s of sales) {
      const m = MONTHS_SHORT[new Date(s.created_at).getMonth()];
      const b = bucketMap.get(m);
      if (b) b.cashIn += Number(s.total_amount);
    }
    for (const e of expenses) {
      const m = MONTHS_SHORT[new Date(e.date + 'T00:00:00').getMonth()];
      const b = bucketMap.get(m);
      if (b) b.cashOut += Number(e.amount);
    }
    for (const p of purchases) {
      const m = MONTHS_SHORT[new Date(p.purchase_date + 'T00:00:00').getMonth()];
      const b = bucketMap.get(m);
      if (b) b.cashOut += Number(p.total_purchase_amount);
    }
  }

  const cashflow: CashflowPoint[] = Array.from(bucketMap.entries()).map(([label, { cashIn, cashOut }]) => ({
    label,
    cashIn,
    cashOut,
    profit: cashIn - cashOut,
  }));

  // ── totals ───────────────────────────────────────────────────────────────────
  const cashIn    = sales.reduce((s: number, r: any) => s + Number(r.total_amount), 0);
  const cashOut   = expenses.reduce((s: number, r: any) => s + Number(r.amount), 0);
  const debtTotal = purchases.reduce((s: number, r: any) => s + Number(r.total_purchase_amount), 0);

  return {
    cashflow,
    ledger,
    totals: { cashIn, cashOut, profit: cashIn - cashOut, debtTotal },
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

export async function getWeeklySummaryAction(): Promise<WeeklySummary> {
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  const weekStart = weekAgo.toISOString();

  const [{ data: salesData }, { data: expensesData }, { data: productsData }, { data: purchasesData }] = await Promise.all([
    supabaseServer
      .from('sales')
      .select('id, quantity, total_amount, product_id, created_at')
      .gte('created_at', weekStart),

    supabaseServer
      .from('expenses')
      .select('id, amount, created_at')
      .gte('created_at', weekStart),

    supabaseServer.from('products').select('id, name, stock_quantity, sale_price, purchase_price, category'),

    supabaseServer
      .from('purchases')
      .select('id, total_purchase_amount, payment_status, purchase_date')
      .eq('payment_status', 'À Crédit'),
  ]);

  const sales = (salesData ?? []) as any[];
  const expenses = (expensesData ?? []) as any[];
  const products = (productsData ?? []) as any[];
  const purchases = (purchasesData ?? []) as any[];

  const totalSales = sales.reduce((sum: number, s: any) => sum + (Number(s.total_amount) || 0), 0);
  const totalExpenses = expenses.reduce((sum: number, e: any) => sum + (Number(e.amount) || 0), 0);
  const profit = totalSales - totalExpenses;

  // Calculate debts
  const totalDebts = purchases.reduce((sum: number, p: any) => sum + (Number(p.total_purchase_amount) || 0), 0);

  // Calculate overdue debts (more than 15 days old)
  const fifteenDaysAgo = new Date();
  fifteenDaysAgo.setDate(fifteenDaysAgo.getDate() - 15);
  const overdueDebts = purchases
    .filter(p => new Date(p.purchase_date) < fifteenDaysAgo)
    .reduce((sum: number, p: any) => sum + (Number(p.total_purchase_amount) || 0), 0);

  // Calculate available cash (simplified: profit minus outstanding debts)
  const cashAvailable = profit - totalDebts;

  const topProducts = sales
    .reduce(
      (acc: Array<{ product_id: string; quantity: number; revenue: number }>, sale: any) => {
        const existing = acc.find((p) => p.product_id === sale.product_id);
        if (existing) {
          existing.quantity += Number(sale.quantity);
          existing.revenue += Number(sale.total_amount);
        } else {
          acc.push({
            product_id: sale.product_id,
            quantity: Number(sale.quantity),
            revenue: Number(sale.total_amount),
          });
        }
        return acc;
      },
      []
    )
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5)
    .map((p: any) => {
      const product = products.find((prod: any) => prod.id === p.product_id);
      return {
        name: product?.name ?? 'Unknown',
        quantity: p.quantity,
        revenue: p.revenue,
      };
    });

  const lowStockProducts = products
    .filter((p) => p.stock_quantity < 5)
    .map((p) => ({
      name: p.name,
      quantity: Number(p.stock_quantity),
      category: p.category || 'Sans catégorie',
    }));

  return {
    totalSales,
    totalExpenses,
    profit,
    salesCount: sales.length,
    productsSold: sales.reduce((sum: number, s: any) => sum + Number(s.quantity), 0),
    criticalStockItems: lowStockProducts.length,
    topProducts,
    lowStockProducts,
    totalDebts,
    overdueDebts,
    cashAvailable,
  };
}

export async function getDashboardDataAction(): Promise<DashboardData> {
  // Get current month data
  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();
  const monthStart = new Date(currentYear, currentMonth, 1);
  const monthEnd = new Date(currentYear, currentMonth + 1, 0);

  const [{ data: monthlySales }, { data: monthlyExpenses }] = await Promise.all([
    supabaseServer
      .from('sales')
      .select('total_amount, created_at')
      .gte('created_at', monthStart.toISOString())
      .lte('created_at', monthEnd.toISOString()),

    supabaseServer
      .from('expenses')
      .select('amount, date')
      .gte('date', monthStart.toISOString().split('T')[0])
      .lte('date', monthEnd.toISOString().split('T')[0]),
  ]);

  const currentMonthRevenue = (monthlySales ?? []).reduce((sum: number, s: any) => sum + Number(s.total_amount), 0);
  const currentMonthExpenses = (monthlyExpenses ?? []).reduce((sum: number, e: any) => sum + Number(e.amount), 0);
  const currentMonthProfit = currentMonthRevenue - currentMonthExpenses;

  // For now, return mock data for historical months since we don't have historical data
  // In a real app, you'd aggregate data by month
  const monthlyData = [
    { month: 'Jan', revenue: 120000, expenses: 70000, profit: 50000 },
    { month: 'Feb', revenue: 135000, expenses: 78000, profit: 57000 },
    { month: 'Mar', revenue: 148000, expenses: 82000, profit: 66000 },
    { month: 'Apr', revenue: 152000, expenses: 86000, profit: 66000 },
    { month: 'May', revenue: 170000, expenses: 90000, profit: 80000 },
    { month: 'Jun', revenue: 160000, expenses: 88000, profit: 72000 },
    { month: 'Jul', revenue: 175000, expenses: 92000, profit: 83000 },
    { month: 'Aug', revenue: 182000, expenses: 94000, profit: 88000 },
    { month: 'Sep', revenue: 195000, expenses: 98000, profit: 97000 },
    { month: 'Oct', revenue: 210000, expenses: 102000, profit: 108000 },
    { month: 'Nov', revenue: 220000, expenses: 108000, profit: 112000 },
    { month: 'Dec', revenue: 235000, expenses: 113000, profit: 122000 },
  ];

  const annualData = monthlyData.map(item => ({
    month: item.month,
    netProfit: item.profit,
  }));

  return {
    monthlyData,
    annualData,
    currentMonth: {
      revenue: currentMonthRevenue,
      expenses: currentMonthExpenses,
      profit: currentMonthProfit,
    },
  };
}
