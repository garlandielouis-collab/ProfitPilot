// ─────────────────────────────────────────────────────────────────────────────
// Moteur de marge — Diagnostic 1 (illusion du chiffre d'affaires)
//                   + Diagnostic 4 (coûts cachés qui mangent la marge)
//
// 100% pur / sans I/O : utilisable côté serveur (server actions, cron) comme
// côté client (calculateur temps réel). Toute la logique de rentabilité de
// l'app doit passer par ici pour qu'un seul chiffre fasse foi.
// ─────────────────────────────────────────────────────────────────────────────

import { convertCurrency, type CurrencyCode } from './currency';

/** Coût d'achat d'un produit + tous les frais annexes qui rognent la marge. */
export type ProductCostInput = {
  /** Prix d'achat unitaire, exprimé en `costCurrency`. */
  purchasePrice: number;
  /** Devise du prix d'achat (souvent USD pour du stock importé). */
  costCurrency: CurrencyCode;
  /** Frais de livraison unitaire (même devise que le prix d'achat). */
  deliveryCost?: number;
  /** Emballage unitaire (même devise que le prix d'achat). */
  packagingCost?: number;
  /** Autres frais unitaires (douane, transport interne…). */
  otherCost?: number;
  /** Commission plateforme, en % du prix de vente. */
  commissionPercent?: number;
};

export type MarginInput = ProductCostInput & {
  /** Prix de vente unitaire encaissé, exprimé en `saleCurrency`. */
  salePrice: number;
  /** Devise du prix de vente (le plus souvent HTG). */
  saleCurrency: CurrencyCode;
  /** Quantité vendue (défaut : 1). */
  quantity?: number;
  /** Taux de change courant : 1 USD = `exchangeRate` HTG. */
  exchangeRate: number;
  /** Devise dans laquelle on veut lire le résultat (défaut : saleCurrency). */
  displayCurrency?: CurrencyCode;
};

export type MarginResult = {
  currency: CurrencyCode;
  /** Prix de vente total (quantité incluse). */
  revenue: number;
  /** Coût d'achat converti dans la devise d'affichage. */
  baseCost: number;
  /** Frais annexes convertis (livraison + emballage + autres). */
  extraCosts: number;
  /** Commission plateforme calculée sur le prix de vente. */
  commission: number;
  /** Coût complet réel = base + frais + commission. */
  landedCost: number;
  /** Marge nette en valeur. */
  netMargin: number;
  /** Marge nette en % du chiffre d'affaires. */
  marginPercent: number;
  /** Coefficient multiplicateur (prix de vente / coût complet). */
  markup: number;
  /** Vrai si la vente fait perdre de l'argent. */
  isLoss: boolean;
  /** Prix de vente en dessous duquel la vente devient une perte. */
  breakEvenPrice: number;
};

const round2 = (n: number): number =>
  Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;

const safe = (n: number | undefined | null): number =>
  Number.isFinite(Number(n)) ? Number(n) : 0;

// ─────────────────────────────────────────────────────────────────────────────
// Coût complet ("landed cost") unitaire
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Coût réel d'un produit livré, converti dans la devise cible.
 * La commission n'est pas incluse ici : elle dépend du prix de vente
 * et est ajoutée par `computeMargin`.
 */
export function computeLandedCost(
  input: ProductCostInput,
  exchangeRate: number,
  displayCurrency: CurrencyCode,
): { baseCost: number; extraCosts: number; total: number } {
  const rate = safe(exchangeRate) > 0 ? safe(exchangeRate) : 1;

  const baseCost = convertCurrency(
    safe(input.purchasePrice),
    input.costCurrency,
    displayCurrency,
    rate,
  );

  const extras =
    safe(input.deliveryCost) + safe(input.packagingCost) + safe(input.otherCost);

  const extraCosts = convertCurrency(extras, input.costCurrency, displayCurrency, rate);

  return {
    baseCost:   round2(baseCost),
    extraCosts: round2(extraCosts),
    total:      round2(baseCost + extraCosts),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Marge nette
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Marge nette réelle d'une vente : prix encaissé − coût complet − commission.
 * C'est cette fonction que le calculateur temps réel et le dashboard appellent.
 */
export function computeMargin(input: MarginInput): MarginResult {
  const currency = input.displayCurrency ?? input.saleCurrency;
  const rate     = safe(input.exchangeRate) > 0 ? safe(input.exchangeRate) : 1;
  const qty      = safe(input.quantity) > 0 ? safe(input.quantity) : 1;

  const unitRevenue = convertCurrency(
    safe(input.salePrice),
    input.saleCurrency,
    currency,
    rate,
  );
  const revenue = unitRevenue * qty;

  const cost = computeLandedCost(input, rate, currency);
  const baseCost   = cost.baseCost   * qty;
  const extraCosts = cost.extraCosts * qty;

  const commissionPct = Math.min(Math.max(safe(input.commissionPercent), 0), 100);
  const commission    = revenue * (commissionPct / 100);

  const landedCost = baseCost + extraCosts + commission;
  const netMargin  = revenue - landedCost;

  // Prix plancher : couvre le coût unitaire malgré la commission prélevée dessus.
  const unitFixedCost  = cost.total;
  const breakEvenPrice = commissionPct >= 100
    ? Number.POSITIVE_INFINITY
    : unitFixedCost / (1 - commissionPct / 100);

  return {
    currency,
    revenue:       round2(revenue),
    baseCost:      round2(baseCost),
    extraCosts:    round2(extraCosts),
    commission:    round2(commission),
    landedCost:    round2(landedCost),
    netMargin:     round2(netMargin),
    marginPercent: revenue > 0 ? round2((netMargin / revenue) * 100) : 0,
    markup:        landedCost > 0 ? round2(revenue / landedCost) : 0,
    isLoss:        netMargin < 0,
    breakEvenPrice: Number.isFinite(breakEvenPrice) ? round2(breakEvenPrice) : 0,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Prix conseillé
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Prix de vente qui atteint `targetMarginPercent` de marge nette **après**
 * frais annexes et commission plateforme.
 *
 * marge% = (P − C − P·k) / P  ⟹  P = C / (1 − k − marge%)
 */
export function suggestSalePrice(
  input: ProductCostInput,
  opts: {
    exchangeRate: number;
    displayCurrency: CurrencyCode;
    targetMarginPercent: number;
  },
): number {
  const cost = computeLandedCost(input, opts.exchangeRate, opts.displayCurrency).total;
  const k    = Math.min(Math.max(safe(input.commissionPercent), 0), 99) / 100;
  const m    = Math.min(Math.max(safe(opts.targetMarginPercent), 0), 95) / 100;

  const divisor = 1 - k - m;
  if (divisor <= 0) return 0; // objectif inatteignable avec cette commission
  return round2(cost / divisor);
}

// ─────────────────────────────────────────────────────────────────────────────
// Impact d'une variation du taux de change (alerte Diagnostic 1)
// ─────────────────────────────────────────────────────────────────────────────

export type RateImpactSeverity = 'none' | 'info' | 'warning' | 'critical';

export type RateImpact = {
  /** Variation du taux en %, signée. */
  variationPercent: number;
  /** Marge % avant / après la variation, pour le produit testé. */
  marginBefore: number;
  marginAfter: number;
  /** Points de marge perdus (positif = perte). */
  marginPointsLost: number;
  severity: RateImpactSeverity;
  /** Vrai si la vente bascule en perte au nouveau taux. */
  becomesLoss: boolean;
};

/**
 * Le taux a bougé : est-ce que ça mange la marge des produits en stock ?
 * Le prix de vente est supposé inchangé (c'est justement le piège).
 */
export function computeRateImpact(
  input: Omit<MarginInput, 'exchangeRate'>,
  previousRate: number,
  newRate: number,
  thresholdPercent = 3,
): RateImpact {
  const before = computeMargin({ ...input, exchangeRate: previousRate });
  const after  = computeMargin({ ...input, exchangeRate: newRate });

  const variationPercent =
    previousRate > 0 ? round2(((newRate - previousRate) / previousRate) * 100) : 0;

  const marginPointsLost = round2(before.marginPercent - after.marginPercent);

  let severity: RateImpactSeverity = 'none';
  if (after.isLoss)                                     severity = 'critical';
  else if (Math.abs(variationPercent) >= thresholdPercent * 2) severity = 'warning';
  else if (Math.abs(variationPercent) >= thresholdPercent)     severity = 'info';

  return {
    variationPercent,
    marginBefore:     before.marginPercent,
    marginAfter:      after.marginPercent,
    marginPointsLost,
    severity,
    becomesLoss:      !before.isLoss && after.isLoss,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Simulateur « et si j'augmentais mes prix ? » (Bonus 2)
// ─────────────────────────────────────────────────────────────────────────────

export type PriceScenario = {
  /** Hausse appliquée, en % (0, 5, 10, 15…). */
  increasePercent: number;
  newPrice: number;
  /** Marge unitaire au nouveau prix. */
  unitMargin: number;
  marginPercent: number;
  /** Marge mensuelle projetée, avec l'hypothèse d'élasticité. */
  projectedMonthlyMargin: number;
  /** Volume mensuel retenu après élasticité. */
  projectedUnits: number;
  /** Écart de marge mensuelle vs la situation actuelle. */
  marginDelta: number;
};

/**
 * Projette l'impact d'une hausse de prix sur la marge mensuelle.
 *
 * `elasticity` = % de volume perdu pour 1% de hausse de prix.
 * 0 = aucun client ne part (rare), 1 = perte de volume proportionnelle.
 * Valeur par défaut 0.5 : hypothèse prudente et lisible pour le marchand.
 */
export function simulatePriceIncrease(
  input: MarginInput & { monthlyUnits: number },
  increases: number[] = [0, 5, 10, 15],
  elasticity = 0.5,
): PriceScenario[] {
  const baseUnits = Math.max(safe(input.monthlyUnits), 0);
  const current   = computeMargin({ ...input, quantity: 1 });
  const baseline  = current.netMargin * baseUnits;

  return increases.map((increasePercent) => {
    const factor   = 1 + safe(increasePercent) / 100;
    const newPrice = round2(safe(input.salePrice) * factor);

    const scenario = computeMargin({ ...input, salePrice: newPrice, quantity: 1 });

    const volumeFactor   = Math.max(0, 1 - (safe(increasePercent) / 100) * elasticity);
    const projectedUnits = Math.round(baseUnits * volumeFactor);
    const projected      = scenario.netMargin * projectedUnits;

    return {
      increasePercent,
      newPrice,
      unitMargin:             scenario.netMargin,
      marginPercent:          scenario.marginPercent,
      projectedUnits,
      projectedMonthlyMargin: round2(projected),
      marginDelta:            round2(projected - baseline),
    };
  });
}
