import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Shadcn-compatible class merger */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Format a number as currency with optional currency symbol
 * @param amount - The amount to format
 * @param currency - The currency code ('HTG', 'USD'). Defaults to 'HTG'
 * @returns Formatted string like "1 234,56 HTG" or "1 234,56 USD"
 */
export function formatCurrency(amount: number | string, currency: 'HTG' | 'USD' = 'HTG') {
  const value = typeof amount === 'string' ? Number(amount.replace(/,/g, '.')) : amount;
  const normalized = Number.isFinite(value) ? value : 0;
  return new Intl.NumberFormat('fr-FR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(normalized) + ' ' + currency;
}

export function calculateRealProfit(
  sales: Array<{ sale_price: number; purchase_price: number; quantity: number }>,
  expenses: Array<{ amount: number; category?: string }>,
  debtPayments?: Array<{ amount: number; date: string }>
) {
  const totalSales = sales.reduce((sum, item) => sum + item.sale_price * item.quantity, 0);
  const totalPurchases = sales.reduce((sum, item) => sum + item.purchase_price * item.quantity, 0);

  // Filter out debt payment expenses from regular expenses
  const regularExpenses = expenses.filter(expense => expense.category !== 'Remboursements');
  const totalRegularExpenses = regularExpenses.reduce((sum, expense) => sum + expense.amount, 0);

  // Add debt payments as separate deduction
  const totalDebtPayments = debtPayments?.reduce((sum, payment) => sum + payment.amount, 0) ?? 0;

  return totalSales - totalPurchases - totalRegularExpenses - totalDebtPayments;
}
