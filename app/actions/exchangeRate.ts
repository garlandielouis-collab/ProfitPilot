'use server';

import { getBusinessContext } from '../../lib/serverAuth';
import { revalidatePath } from 'next/cache';

/** Fetch live USD→HTG rate from public APIs. Returns null on failure. */
async function fetchLiveRate(): Promise<number | null> {
  try {
    const res = await fetch('https://open.er-api.com/v6/latest/USD', {
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) {
      const json = await res.json();
      const rate = Number(json?.rates?.HTG ?? 0);
      if (rate > 0 && !isNaN(rate)) return parseFloat(rate.toFixed(2));
    }
  } catch { /* fallback */ }

  try {
    const res2 = await fetch('https://api.frankfurter.app/latest?from=USD&to=HTG', {
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
    });
    if (res2.ok) {
      const json2 = await res2.json();
      const rate2 = Number(json2?.rates?.HTG ?? 0);
      if (rate2 > 0 && !isNaN(rate2)) return parseFloat(rate2.toFixed(2));
    }
  } catch { /* ignore */ }

  return null;
}

/**
 * Fetch live rate and save to businesses table.
 * Called from client when localStorage says last refresh > 24h.
 */
export async function saveExchangeRate(rate: number): Promise<void> {
  if (!rate || isNaN(rate) || rate <= 0) return;
  const { supabase, businessId } = await getBusinessContext();
  await supabase
    .from('businesses')
    .update({ exchange_rate: parseFloat(rate.toFixed(2)) })
    .eq('id', businessId);
  revalidatePath('/settings');
  revalidatePath('/rapports');
  revalidatePath('/dashboard');
}

/**
 * Fetch live rate server-side and save immediately.
 * Returns new rate or null if fetch failed.
 */
export async function refreshExchangeRateAction(): Promise<number | null> {
  const liveRate = await fetchLiveRate();
  if (!liveRate) return null;

  const { supabase, businessId } = await getBusinessContext();
  await supabase
    .from('businesses')
    .update({ exchange_rate: liveRate })
    .eq('id', businessId);

  revalidatePath('/settings');
  revalidatePath('/rapports');
  revalidatePath('/dashboard');
  return liveRate;
}

/**
 * Force-refresh exchange rate AND recalculate all USD transactions
 * using the new rate in journal entry lines.
 */
export async function forceRefreshAndRecalculate(): Promise<{
  newRate: number;
  expensesUpdated: number;
  salesUpdated: number;
}> {
  const liveRate = await fetchLiveRate();
  if (!liveRate) throw new Error('Impossible de récupérer le taux de change en direct.');

  const { supabase, businessId } = await getBusinessContext();

  // Save new rate
  await supabase
    .from('businesses')
    .update({ exchange_rate: liveRate })
    .eq('id', businessId);

  // Recalculate expenses in USD
  const { data: usdExpenses } = await supabase
    .from('expenses')
    .select('id, amount, currency')
    .eq('business_id', businessId)
    .eq('currency', 'USD')
    .is('deleted_at', null);

  let expensesUpdated = 0;
  for (const exp of usdExpenses ?? []) {
    await supabase
      .from('expenses')
      .update({ exchange_rate: liveRate })
      .eq('id', exp.id);

    const { data: entries } = await supabase
      .from('journal_entries')
      .select('id')
      .eq('business_id', businessId)
      .eq('reference_type', 'expense')
      .eq('reference_id', exp.id)
      .eq('status', 'posted');

    for (const je of entries ?? []) {
      const { data: lines } = await supabase
        .from('journal_entry_lines')
        .select('id, debit_amount, credit_amount')
        .eq('journal_entry_id', je.id);

      for (const line of lines ?? []) {
        const debit  = Number(line.debit_amount  ?? 0);
        const credit = Number(line.credit_amount ?? 0);
        await supabase
          .from('journal_entry_lines')
          .update({
            base_debit:  debit  > 0 ? parseFloat((debit  * liveRate).toFixed(2)) : 0,
            base_credit: credit > 0 ? parseFloat((credit * liveRate).toFixed(2)) : 0,
          })
          .eq('id', line.id);
      }
    }
    expensesUpdated++;
  }

  // Recalculate sales in USD
  const { data: usdSales } = await supabase
    .from('sales')
    .select('id, total_amount, currency')
    .eq('business_id', businessId)
    .eq('currency', 'USD')
    .is('deleted_at', null);

  let salesUpdated = 0;
  for (const sale of usdSales ?? []) {
    const { data: entries } = await supabase
      .from('journal_entries')
      .select('id')
      .eq('business_id', businessId)
      .eq('reference_type', 'sale')
      .eq('reference_id', sale.id)
      .eq('status', 'posted');

    for (const je of entries ?? []) {
      const { data: lines } = await supabase
        .from('journal_entry_lines')
        .select('id, debit_amount, credit_amount')
        .eq('journal_entry_id', je.id);

      for (const line of lines ?? []) {
        const debit  = Number(line.debit_amount  ?? 0);
        const credit = Number(line.credit_amount ?? 0);
        await supabase
          .from('journal_entry_lines')
          .update({
            base_debit:  debit  > 0 ? parseFloat((debit  * liveRate).toFixed(2)) : 0,
            base_credit: credit > 0 ? parseFloat((credit * liveRate).toFixed(2)) : 0,
          })
          .eq('id', line.id);
      }
    }
    salesUpdated++;
  }

  revalidatePath('/settings');
  revalidatePath('/rapports');
  revalidatePath('/rapports/comptabilite');
  revalidatePath('/dashboard');
  revalidatePath('/expenses');
  revalidatePath('/sales');

  return { newRate: liveRate, expensesUpdated, salesUpdated };
}
