'use server';

import { supabaseServer } from '../../lib/supabaseServerClient';

export type ReportsData = {
  businessName: string;
  balanceSheet: Array<{ label: string; value: number }>;
  incomeStatement: Array<{ label: string; value: number }>;
  cashFlow: Array<{ label: string; value: number }>;
  periodSummary: {
    month: { revenue: number; expenses: number; profit: number };
    quarter: { revenue: number; expenses: number; profit: number };
    semiAnnual: { revenue: number; expenses: number; profit: number };
    year: { revenue: number; expenses: number; profit: number };
  };
};

export async function getReportsDataAction(): Promise<ReportsData> {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();

  // Calculate date ranges
  const monthStart = new Date(currentYear, currentMonth, 1);
  const quarterStart = new Date(currentYear, Math.floor(currentMonth / 3) * 3, 1);
  const semiAnnualStart = new Date(currentYear, currentMonth < 6 ? 0 : 6, 1);
  const yearStart = new Date(currentYear, 0, 1);

  const [{ data: businessData }, { data: salesData }, { data: expensesData }, { data: purchasesData }] = await Promise.all([
    supabaseServer.from('businesses').select('name').maybeSingle(),
    supabaseServer.from('sales').select('total_amount, created_at'),
    supabaseServer.from('expenses').select('amount, date'),
    supabaseServer.from('purchases').select('total_purchase_amount, payment_status'),
  ]);

  const businessName = (businessData as any)?.name ?? 'ProfitPilot';
  const sales = salesData ?? [];
  const expenses = expensesData ?? [];
  const purchases = purchasesData ?? [];

  // Helper function to calculate totals for a date range
  const calculateTotals = (startDate: Date) => {
    const salesTotal = sales
      .filter((s: any) => new Date(s.created_at) >= startDate)
      .reduce((sum: number, s: any) => sum + Number(s.total_amount), 0);

    const expensesTotal = expenses
      .filter((e: any) => new Date(e.date) >= startDate)
      .reduce((sum: number, e: any) => sum + Number(e.amount), 0);

    return {
      revenue: salesTotal,
      expenses: expensesTotal,
      profit: salesTotal - expensesTotal,
    };
  };

  const monthTotals = calculateTotals(monthStart);
  const quarterTotals = calculateTotals(quarterStart);
  const semiAnnualTotals = calculateTotals(semiAnnualStart);
  const yearTotals = calculateTotals(yearStart);

  // Calculate balance sheet (simplified)
  const totalAssets = yearTotals.revenue; // Simplified
  const totalLiabilities = purchases
    .filter((p: any) => p.payment_status === 'À Crédit')
    .reduce((sum: number, p: any) => sum + Number(p.total_purchase_amount), 0);
  const equity = totalAssets - totalLiabilities;

  // Income statement
  const costOfSales = purchases
    .filter((p: any) => p.payment_status === 'Payé')
    .reduce((sum: number, p: any) => sum + Number(p.total_purchase_amount), 0);
  const grossProfit = yearTotals.revenue - costOfSales;
  const operatingExpenses = expenses.reduce((sum: number, e: any) => sum + Number(e.amount), 0);
  const netProfit = grossProfit - operatingExpenses;

  // Cash flow (simplified)
  const cashInflows = yearTotals.revenue;
  const cashOutflows = operatingExpenses + costOfSales;
  const netCashFlow = cashInflows - cashOutflows;

  return {
    businessName,
    balanceSheet: [
      { label: 'Actif total', value: totalAssets },
      { label: 'Passif total', value: totalLiabilities },
      { label: 'Capitaux propres', value: equity },
    ],
    incomeStatement: [
      { label: 'Revenus', value: yearTotals.revenue },
      { label: 'Coût des ventes', value: costOfSales },
      { label: 'Marge brute', value: grossProfit },
      { label: 'Dépenses opérationnelles', value: operatingExpenses },
      { label: 'Profit net', value: netProfit },
    ],
    cashFlow: [
      { label: 'Flux d\'entrée', value: cashInflows },
      { label: 'Flux de sortie', value: cashOutflows },
      { label: 'Flux net', value: netCashFlow },
    ],
    periodSummary: {
      month: monthTotals,
      quarter: quarterTotals,
      semiAnnual: semiAnnualTotals,
      year: yearTotals,
    },
  };
}