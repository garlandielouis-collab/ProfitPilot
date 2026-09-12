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
import { makeToReport, type CurrencyCode, type ReportFx } from '../../lib/currency';

/**
 * Devise du prix de vente d'un produit. La fiche produit le saisit et
 * l'affiche en HTG (`ProductsClient`) ; seuls le prix d'achat et ses frais
 * portent `products.currency`.
 */
const SALE_CURRENCY: CurrencyCode = 'HTG';

/**
 * Une marge unitaire se calcule-t-elle sans taux inventé ? Oui si chaque devise
 * est déjà celle de l'entreprise, ou si le marchand a saisi son taux. Même règle
 * que les totaux : `makeToReport`.
 */
function convertible(fx: ReportFx, ...currencies: CurrencyCode[]): boolean {
  const toReport = makeToReport(fx);
  return currencies.every((c) => toReport(1, c) !== null);
}

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
  /**
   * Ventes dont les lignes sont restées hors des montants ci-dessus : autre
   * devise, taux non saisi (`v_product_profitability` les exclut de ses sommes).
   */
  unconvertedCount?: number;
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
  const { supabase, businessId, defaultCurrency, exchangeRateSet } = await getBusinessContext();

  const [{ data: rows, error }, { data: products }, { data: saleLines }] = await Promise.all([
    supabase
      .from('v_product_profitability')
      .select('*')
      .eq('business_id', businessId),
    supabase
      .from('products')
      .select('id, name, stock_quantity, reorder_point')
      .eq('business_id', businessId),
    // Sans taux saisi, la vue laisse hors de ses sommes les lignes dans l'autre
    // devise (même règle que `makeToReport`). On les relit pour les compter.
    // Avec un taux, rien n'est exclu : aucune lecture de plus.
    exchangeRateSet
      ? Promise.resolve({ data: [] as any[] })
      : supabase
          .from('sale_items')
          .select('sale_id, currency, sales!inner(currency, deleted_at)')
          .eq('business_id', businessId)
          .is('sales.deleted_at', null),
  ]);

  if (error) throw new Error(error.message);

  // Même devise effective que la vue : celle de la ligne, sinon celle de la
  // vente, sinon HTG. Compté par vente.
  const unconvertedSales = new Set<string>();
  for (const l of (saleLines ?? []) as any[]) {
    const c = String(l.currency ?? l.sales?.currency ?? 'HTG').toUpperCase();
    if (c !== defaultCurrency) unconvertedSales.add(String(l.sale_id));
  }

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
    unconvertedCount: unconvertedSales.size,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Coût réel & prix conseillé d'un produit
// ─────────────────────────────────────────────────────────────────────────────

export type ProductMarginDetail = {
  productId: string;
  name: string;
  /** Devise de tous les montants ci-dessous : celle de l'entreprise. */
  currency: CurrencyCode;
  /**
   * Montants `null` quand le calcul exige un taux de change que le marchand n'a
   * pas saisi (prix d'achat ou de vente dans une autre devise) : pas de marge
   * plutôt qu'une marge au taux de repli.
   */
  salePrice: number | null;
  baseCost: number | null;
  extraCosts: number | null;
  landedCost: number | null;
  netMargin: number | null;
  marginPercent: number | null;
  breakEvenPrice: number | null;
  suggestedPrice: number | null;
  targetMarginPercent: number;
  isLoss: boolean | null;
  /** 1 quand la marge n'a pas été calculée faute de taux saisi. */
  unconvertedCount?: number;
};

export async function getProductMargin(productId: string): Promise<ProductMarginDetail> {
  await assertFeature('margin_calculator');
  const { supabase, businessId, exchangeRate, exchangeRateSet, defaultCurrency } = await getBusinessContext();

  const { data: p, error } = await supabase
    .from('products')
    .select(
      'id, name, purchase_price, sale_price, currency, delivery_cost, packaging_cost, other_cost, commission_percent, target_margin_percent',
    )
    .eq('id', productId)
    .eq('business_id', businessId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!p) throw new Error('Produit introuvable.');

  const costCurrency = (p.currency ?? 'HTG') as CurrencyCode;
  const costInput = {
    purchasePrice:     Number(p.purchase_price ?? 0),
    costCurrency,
    deliveryCost:      Number(p.delivery_cost ?? 0),
    packagingCost:     Number(p.packaging_cost ?? 0),
    otherCost:         Number(p.other_cost ?? 0),
    commissionPercent: Number(p.commission_percent ?? 0),
  };

  const display = defaultCurrency as CurrencyCode;
  const target  = Number(p.target_margin_percent ?? 30);

  // Prix d'achat et prix de vente ramenés à la devise de l'entreprise. Sans
  // taux saisi, pas de marge : plutôt `null` qu'une marge au taux de repli.
  if (!convertible({ exchangeRate, exchangeRateSet, defaultCurrency: display }, costCurrency, SALE_CURRENCY)) {
    return {
      productId:           p.id,
      name:                p.name,
      currency:            display,
      salePrice:           null,
      baseCost:            null,
      extraCosts:          null,
      landedCost:          null,
      netMargin:           null,
      marginPercent:       null,
      breakEvenPrice:      null,
      suggestedPrice:      null,
      targetMarginPercent: target,
      isLoss:              null,
      unconvertedCount:    1,
    };
  }
  // Ici, soit rien n'est converti, soit le taux est celui du marchand.
  const rate = exchangeRateSet ? exchangeRate : 1;

  const margin = computeMargin({
    ...costInput,
    salePrice:       Number(p.sale_price ?? 0),
    saleCurrency:    SALE_CURRENCY,
    exchangeRate:    rate,
    displayCurrency: display,
  });

  const cost = computeLandedCost(costInput, rate, display);

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
      exchangeRate:    rate,
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
  /** Devise de `currentPrice` et des scénarios. */
  currency: CurrencyCode;
  currentPrice: number;
  monthlyUnits: number;
  /** Vide quand la projection exige un taux de change non saisi. */
  scenarios: PriceScenario[];
  /** 1 quand la simulation n'a pas été calculée faute de taux saisi. */
  unconvertedCount?: number;
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
  const { supabase, businessId, exchangeRate, exchangeRateSet, defaultCurrency } = await getBusinessContext();

  const since = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);

  const [{ data: p, error }, { data: recentItems }] = await Promise.all([
    supabase
      .from('products')
      .select(
        'id, name, purchase_price, sale_price, currency, delivery_cost, packaging_cost, other_cost, commission_percent',
      )
      .eq('id', productId)
      .eq('business_id', businessId)
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

  const costCurrency = (p.currency ?? 'HTG') as CurrencyCode;
  const display      = defaultCurrency as CurrencyCode;
  const salePrice    = Number(p.sale_price ?? 0);
  const fx: ReportFx = { exchangeRate, exchangeRateSet, defaultCurrency: display };

  // Sans taux saisi, un produit dont une devise n'est pas celle de l'entreprise
  // ne se projette pas : aucun scénario plutôt que des marges au taux de repli.
  // Le prix actuel reste affiché dans sa propre devise.
  if (!convertible(fx, costCurrency, SALE_CURRENCY)) {
    return {
      productId:        p.id,
      name:             p.name,
      currency:         SALE_CURRENCY,
      currentPrice:     salePrice,
      monthlyUnits,
      scenarios:        [],
      unconvertedCount: 1,
    };
  }
  // Ici, soit rien n'est converti, soit le taux est celui du marchand.
  const rate     = exchangeRateSet ? exchangeRate : 1;
  const toReport = makeToReport(fx);
  const inReport = (amount: number): number =>
    Math.round((toReport(amount, SALE_CURRENCY) ?? amount) * 100) / 100;

  const scenarios = simulatePriceIncrease(
    {
      purchasePrice:     Number(p.purchase_price ?? 0),
      costCurrency,
      deliveryCost:      Number(p.delivery_cost ?? 0),
      packagingCost:     Number(p.packaging_cost ?? 0),
      otherCost:         Number(p.other_cost ?? 0),
      commissionPercent: Number(p.commission_percent ?? 0),
      salePrice,
      saleCurrency:      SALE_CURRENCY,
      exchangeRate:      rate,
      displayCurrency:   display,
      monthlyUnits,
    },
    increases,
    elasticity,
  )
    // `newPrice` sort dans la devise du prix de vente, les marges dans celle de
    // l'entreprise ; l'écran affiche tout sous `currency` : on aligne le prix.
    .map((s) => ({ ...s, newPrice: inReport(s.newPrice) }));

  return {
    productId:    p.id,
    name:         p.name,
    currency:     display,
    currentPrice: inReport(salePrice),
    monthlyUnits,
    scenarios,
  };
}
