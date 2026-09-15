'use server';

import { getBusinessContext } from '../../lib/serverAuth';
import { revalidatePath } from 'next/cache';
import { computeMargin } from '../../lib/margin';
import { attempt, UserFacingError, type ActionResult } from '../../lib/actionResult';

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
export async function forceRefreshAndRecalculate(): Promise<ActionResult<{
  newRate: number;
  expensesUpdated: number;
  salesUpdated: number;
}>> {
  return attempt(async () => {
  const liveRate = await fetchLiveRate();
  if (!liveRate) throw new UserFacingError('Impossible de récupérer le taux de change en direct.');

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
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Alerte de variation du taux — Diagnostic 1
//
// Rafraîchit le taux via fn_record_exchange_rate() (qui historise et calcule la
// variation), puis évalue l'impact sur la marge des produits achetés en USD.
// ─────────────────────────────────────────────────────────────────────────────

export type RateAlert = {
  rate: number;
  previousRate: number | null;
  variationPercent: number;
  /** Seuil configuré sur l'entreprise (%). */
  threshold: number;
  /** Vrai si la variation dépasse le seuil : il faut prévenir le marchand. */
  shouldAlert: boolean;
  /** Produits en USD dont la marge passe sous zéro au nouveau taux. */
  productsAtLoss: Array<{ id: string; name: string; marginPercent: number }>;
};

/**
 * Rafraîchit le taux et retourne l'alerte à afficher.
 * À appeler au chargement du dashboard (une fois par jour suffit).
 */
export async function refreshRateWithAlert(): Promise<RateAlert | null> {
  const liveRate = await fetchLiveRate();
  if (!liveRate) return null;

  const { supabase, businessId, defaultCurrency } = await getBusinessContext();

  const { data: biz } = await supabase
    .from('businesses')
    .select('exchange_rate, rate_alert_threshold')
    .eq('id', businessId)
    .maybeSingle();

  const previousRate = biz?.exchange_rate != null ? Number(biz.exchange_rate) : null;
  const threshold    = Number(biz?.rate_alert_threshold ?? 3);

  // fn_record_exchange_rate historise + met à jour businesses.exchange_rate
  const { error: rpcErr } = await supabase.rpc('fn_record_exchange_rate', {
    p_business_id: businessId,
    p_rate:        liveRate,
    p_source:      'api',
  });
  if (rpcErr) {
    // Repli : au minimum, on garde le taux à jour
    await supabase.from('businesses').update({ exchange_rate: liveRate }).eq('id', businessId);
  }

  const variationPercent =
    previousRate && previousRate > 0
      ? Math.round(((liveRate - previousRate) / previousRate) * 1000) / 10
      : 0;

  // Impact concret : quels produits importés deviennent non rentables ?
  const productsAtLoss: RateAlert['productsAtLoss'] = [];
  if (Math.abs(variationPercent) >= threshold) {
    const { data: usdProducts } = await supabase
      .from('products')
      .select('id, name, purchase_price, sale_price, currency, delivery_cost, packaging_cost, other_cost, commission_percent')
      .eq('business_id', businessId)
      .eq('currency', 'USD');

    for (const p of usdProducts ?? []) {
      const margin = computeMargin({
        purchasePrice:     Number(p.purchase_price ?? 0),
        costCurrency:      'USD',
        deliveryCost:      Number(p.delivery_cost ?? 0),
        packagingCost:     Number(p.packaging_cost ?? 0),
        otherCost:         Number(p.other_cost ?? 0),
        commissionPercent: Number(p.commission_percent ?? 0),
        salePrice:         Number(p.sale_price ?? 0),
        // Le prix de vente est en gourdes (fiche produit) ; seul le coût est en
        // USD. En 'USD', 3 000 G de prix passaient pour 3 000 $ et aucun produit
        // importé ne semblait jamais vendu à perte.
        saleCurrency:      'HTG',
        exchangeRate:      liveRate,
        displayCurrency:   (defaultCurrency as 'HTG' | 'USD') ?? 'HTG',
      });
      if (margin.marginPercent < 10) {
        productsAtLoss.push({ id: p.id, name: p.name, marginPercent: margin.marginPercent });
      }
    }
  }

  revalidatePath('/dashboard');
  revalidatePath('/products');

  return {
    rate:         liveRate,
    previousRate,
    variationPercent,
    threshold,
    shouldAlert:  Math.abs(variationPercent) >= threshold,
    productsAtLoss: productsAtLoss.slice(0, 5),
  };
}
