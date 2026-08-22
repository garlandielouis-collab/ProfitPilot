'use server';

// ─────────────────────────────────────────────────────────────────────────────
// Rentabilité produit — Diagnostic 5 (décisions de stock à l'aveugle)
//                       + Diagnostic 4 (coût réel) + Bonus 2 (simulateur prix)
// ─────────────────────────────────────────────────────────────────────────────

import { getBusinessContext } from '../../lib/serverAuth';
import { assertFeature } from '../../lib/entitlements';
import {
  computeMargin,
  computeLandedCost,
  suggestSalePrice,
  simulatePriceIncrease,
  type PriceScenario,
} from '../../lib/margin';
import type { CurrencyCode } from '../../lib/currency';

export type ProductRanking = {
  productId: string;
  name: string;
  unitsSold: number;
  revenue: number;
  cost: number;
  grossMargin: number;
  marginPct: number;
  stockQuantity: number;
  reorderPoint: number;
  lastSoldAt: string | null;
  /** Verdict simple, dans les mots du script de vente. */
  verdict: 'pousser' | 'surveiller' | 'reduire' | 'dormant';
};

export type ProfitabilityReport = {
  items: ProductRanking[];
  currency: string;
  totalMargin: number;
  /** Part de la marge totale générée par les 3 meilleurs produits. */
  top3SharePercent: number;
};

function verdictFor(
  marginPct: number,
  unitsSold: number,
  stockQuantity: number,
): ProductRanking['verdict'] {
  if (unitsSold === 0) return stockQuantity > 0 ? 'dormant' : 'surveiller';
  if (marginPct >= 25) return 'pousser';
  if (marginPct >= 10) return 'surveiller';
  return 'reduire';
}

/**
 * Classement des produits par marge TOTALE générée (pas par volume vendu) :
 * c'est le classement qui réoriente le capital vers ce qui rapporte.
 */
export async function getProductProfitability(opts?: {
  from?: string;
  to?: string;
  limit?: number;
}): Promise<ProfitabilityReport> {
  await assertFeature('product_profitability');
  const { supabase, businessId, userId, defaultCurrency } = await getBusinessContext();

  const [{ data: rows, error }, { data: products }] = await Promise.all([
    supabase
      .from('v_product_profitability')
      .select('*')
      .eq('business_id', businessId),
    supabase
      .from('products')
      .select('id, name, stock_quantity, reorder_point')
      .eq('user_id', userId),
  ]);

  if (error) throw new Error(error.message);

  const stockMap = new Map(
    (products ?? []).map((p: any) => [
      p.id,
      { stock: Number(p.stock_quantity ?? 0), reorder: Number(p.reorder_point ?? 5), name: p.name },
    ]),
  );

  let items: ProductRanking[] = (rows ?? []).map((r: any) => {
    const meta = stockMap.get(r.product_id);
    const marginPct = Number(r.margin_pct ?? 0);
    const unitsSold = Number(r.units_sold ?? 0);
    const stock     = meta?.stock ?? 0;

    return {
      productId:     r.product_id,
      name:          r.product_name ?? meta?.name ?? 'Produit',
      unitsSold,
      revenue:       Number(r.revenue ?? 0),
      cost:          Number(r.cost ?? 0),
      grossMargin:   Number(r.gross_margin ?? 0),
      marginPct,
      stockQuantity: stock,
      reorderPoint:  meta?.reorder ?? 5,
      lastSoldAt:    r.last_sold_at ?? null,
      verdict:       verdictFor(marginPct, unitsSold, stock),
    };
  });

  // Produits jamais vendus mais qui immobilisent du stock : ils comptent aussi.
  const seen = new Set(items.map((i) => i.productId));
  for (const [id, meta] of stockMap) {
    if (seen.has(id) || meta.stock <= 0) continue;
    items.push({
      productId: id,
      name: meta.name,
      unitsSold: 0,
      revenue: 0,
      cost: 0,
      grossMargin: 0,
      marginPct: 0,
      stockQuantity: meta.stock,
      reorderPoint: meta.reorder,
      lastSoldAt: null,
      verdict: 'dormant',
    });
  }

  items.sort((a, b) => b.grossMargin - a.grossMargin);
  if (opts?.limit) items = items.slice(0, opts.limit);

  const totalMargin = items.reduce((s, i) => s + i.grossMargin, 0);
  const top3        = items.slice(0, 3).reduce((s, i) => s + i.grossMargin, 0);

  return {
    items,
    currency: defaultCurrency,
    totalMargin,
    top3SharePercent: totalMargin > 0 ? Math.round((top3 / totalMargin) * 100) : 0,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Coût réel & prix conseillé d'un produit
// ─────────────────────────────────────────────────────────────────────────────

export type ProductMarginDetail = {
  productId: string;
  name: string;
  currency: CurrencyCode;
  salePrice: number;
  baseCost: number;
  extraCosts: number;
  landedCost: number;
  netMargin: number;
  marginPercent: number;
  breakEvenPrice: number;
  suggestedPrice: number;
  targetMarginPercent: number;
  isLoss: boolean;
};

export async function getProductMargin(productId: string): Promise<ProductMarginDetail> {
  await assertFeature('margin_calculator');
  const { supabase, userId, exchangeRate, defaultCurrency } = await getBusinessContext();

  const { data: p, error } = await supabase
    .from('products')
    .select(
      'id, name, purchase_price, sale_price, currency, delivery_cost, packaging_cost, other_cost, commission_percent, target_margin_percent',
    )
    .eq('id', productId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!p) throw new Error('Produit introuvable.');

  const costInput = {
    purchasePrice:     Number(p.purchase_price ?? 0),
    costCurrency:      (p.currency ?? 'HTG') as CurrencyCode,
    deliveryCost:      Number(p.delivery_cost ?? 0),
    packagingCost:     Number(p.packaging_cost ?? 0),
    otherCost:         Number(p.other_cost ?? 0),
    commissionPercent: Number(p.commission_percent ?? 0),
  };

  const display = defaultCurrency as CurrencyCode;
  const target  = Number(p.target_margin_percent ?? 30);

  const margin = computeMargin({
    ...costInput,
    salePrice:       Number(p.sale_price ?? 0),
    saleCurrency:    (p.currency ?? 'HTG') as CurrencyCode,
    exchangeRate,
    displayCurrency: display,
  });

  const cost = computeLandedCost(costInput, exchangeRate, display);

  return {
    productId:           p.id,
    name:                p.name,
    currency:            display,
    salePrice:           margin.revenue,
    baseCost:            cost.baseCost,
    extraCosts:          cost.extraCosts,
    landedCost:          margin.landedCost,
    netMargin:           margin.netMargin,
    marginPercent:       margin.marginPercent,
    breakEvenPrice:      margin.breakEvenPrice,
    suggestedPrice:      suggestSalePrice(costInput, {
      exchangeRate,
      displayCurrency: display,
      targetMarginPercent: target,
    }),
    targetMarginPercent: target,
    isLoss:              margin.isLoss,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Bonus 2 — « et si j'augmentais mes prix ? »
// ─────────────────────────────────────────────────────────────────────────────

export type PriceSimulation = {
  productId: string;
  name: string;
  currency: CurrencyCode;
  currentPrice: number;
  monthlyUnits: number;
  scenarios: PriceScenario[];
};

/**
 * Projette l'impact d'une hausse de prix sur la marge mensuelle,
 * en partant du volume réellement vendu sur les 30 derniers jours.
 */
export async function simulateProductPrice(
  productId: string,
  increases: number[] = [0, 5, 10, 15],
  elasticity = 0.5,
): Promise<PriceSimulation> {
  await assertFeature('price_simulator');
  const { supabase, businessId, userId, exchangeRate, defaultCurrency } = await getBusinessContext();

  const since = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);

  const [{ data: p, error }, { data: recentItems }] = await Promise.all([
    supabase
      .from('products')
      .select(
        'id, name, purchase_price, sale_price, currency, delivery_cost, packaging_cost, other_cost, commission_percent',
      )
      .eq('id', productId)
      .eq('user_id', userId)
      .maybeSingle(),
    supabase
      .from('sale_items')
      .select('quantity, sales!inner(sale_date, business_id, deleted_at)')
      .eq('product_id', productId)
      .eq('business_id', businessId)
      .gte('sales.sale_date', since),
  ]);

  if (error) throw new Error(error.message);
  if (!p) throw new Error('Produit introuvable.');

  const monthlyUnits = (recentItems ?? []).reduce(
    (s: number, r: any) => s + Number(r.quantity ?? 0),
    0,
  );

  const currency = (p.currency ?? 'HTG') as CurrencyCode;

  const scenarios = simulatePriceIncrease(
    {
      purchasePrice:     Number(p.purchase_price ?? 0),
      costCurrency:      currency,
      deliveryCost:      Number(p.delivery_cost ?? 0),
      packagingCost:     Number(p.packaging_cost ?? 0),
      otherCost:         Number(p.other_cost ?? 0),
      commissionPercent: Number(p.commission_percent ?? 0),
      salePrice:         Number(p.sale_price ?? 0),
      saleCurrency:      currency,
      exchangeRate,
      displayCurrency:   defaultCurrency as CurrencyCode,
      monthlyUnits,
    },
    increases,
    elasticity,
  );

  return {
    productId:    p.id,
    name:         p.name,
    currency:     defaultCurrency as CurrencyCode,
    currentPrice: Number(p.sale_price ?? 0),
    monthlyUnits,
    scenarios,
  };
}
