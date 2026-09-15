import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  computeLandedCost,
  computeMargin,
  computeRateImpact,
  suggestSalePrice,
  simulatePriceIncrease,
} from '../lib/margin';

// Un cas de marchand, repris dans tous les tests : un article importé à 10 USD,
// revendu 1 800 gourdes, avec un taux saisi de 130.
const IMPORTE = {
  purchasePrice: 10,
  costCurrency:  'USD' as const,
  salePrice:     1800,
  saleCurrency:  'HTG' as const,
  exchangeRate:  130,
};

describe('computeMargin — le calcul de base', () => {
  test('marge d’un article local, sans conversion', () => {
    const m = computeMargin({
      purchasePrice: 400, costCurrency: 'HTG',
      salePrice: 1000,   saleCurrency: 'HTG',
      exchangeRate: 1,
    });
    assert.equal(m.computable, true);
    assert.equal(m.revenue, 1000);
    assert.equal(m.landedCost, 400);
    assert.equal(m.netMargin, 600);
    assert.equal(m.marginPercent, 60);
    assert.equal(m.isLoss, false);
  });

  test('convertit le coût d’achat au taux saisi', () => {
    const m = computeMargin(IMPORTE);
    assert.equal(m.baseCost, 1300);     // 10 USD × 130
    assert.equal(m.netMargin, 500);
    assert.equal(m.isLoss, false);
  });

  test('la quantité multiplie recette ET coût', () => {
    const un   = computeMargin(IMPORTE);
    const cinq = computeMargin({ ...IMPORTE, quantity: 5 });
    assert.equal(cinq.revenue, un.revenue * 5);
    assert.equal(cinq.landedCost, un.landedCost * 5);
    // Le pourcentage, lui, ne bouge pas : c'est un ratio.
    assert.equal(cinq.marginPercent, un.marginPercent);
  });

  test('les frais annexes rognent la marge, dans la devise du coût', () => {
    const m = computeMargin({ ...IMPORTE, deliveryCost: 1, packagingCost: 0.5 });
    assert.equal(m.extraCosts, 195);    // 1,5 USD × 130
    assert.equal(m.netMargin, 305);
  });

  test('la commission se prend sur la recette, pas sur le coût', () => {
    const m = computeMargin({ ...IMPORTE, commissionPercent: 10 });
    assert.equal(m.commission, 180);    // 10 % de 1 800
    assert.equal(m.netMargin, 320);
  });

  test('reconnaît une vente à perte', () => {
    const m = computeMargin({ ...IMPORTE, salePrice: 1200 });
    assert.equal(m.isLoss, true);
    assert.ok(m.netMargin < 0);
  });

  test('le prix plancher couvre le coût MALGRÉ la commission', () => {
    const m = computeMargin({ ...IMPORTE, commissionPercent: 20 });
    // 1 300 / (1 − 0,20) = 1 625 : en dessous, la vente perd de l'argent.
    assert.equal(m.breakEvenPrice, 1625);
    const auPlancher = computeMargin({ ...IMPORTE, salePrice: 1625, commissionPercent: 20 });
    assert.equal(auPlancher.netMargin, 0);
  });
});

// ── La règle qui compte le plus ─────────────────────────────────────────────
//
// `businesses.exchange_rate` vaut 1 par défaut. Convertir à 1 afficherait un
// coût d'achat de 10 gourdes pour un article payé 10 dollars : une marge de
// 1 790 au lieu de 500, sur chaque article importé du catalogue.

describe('aucun taux de change n’est inventé', () => {
  test('une conversion sans taux saisi rend un résultat non calculable', () => {
    const m = computeMargin({ ...IMPORTE, exchangeRate: 1 });
    assert.equal(m.computable, false);
    assert.equal(m.netMargin, 0);
    assert.equal(m.revenue, 0);
    assert.equal(m.isLoss, false, 'un résultat non calculable ne crie pas « perte »');
  });

  test('un taux nul, négatif ou absent ne passe pas non plus', () => {
    for (const rate of [0, -130, Number.NaN]) {
      assert.equal(computeMargin({ ...IMPORTE, exchangeRate: rate }).computable, false);
    }
  });

  test('sans conversion nécessaire, le taux n’est jamais lu', () => {
    const m = computeMargin({
      purchasePrice: 400, costCurrency: 'HTG',
      salePrice: 1000,    saleCurrency: 'HTG',
      exchangeRate: 1,
    });
    assert.equal(m.computable, true, 'tout est en gourdes : il n’y a rien à convertir');
  });

  test('computeLandedCost applique la même règle', () => {
    assert.equal(computeLandedCost(
      { purchasePrice: 10, costCurrency: 'USD' }, 1, 'HTG',
    ).computable, false);
    assert.equal(computeLandedCost(
      { purchasePrice: 10, costCurrency: 'USD' }, 130, 'HTG',
    ).total, 1300);
  });

  test('suggestSalePrice ne propose aucun prix sans taux saisi', () => {
    assert.equal(suggestSalePrice(
      { purchasePrice: 10, costCurrency: 'USD' },
      { exchangeRate: 1, displayCurrency: 'HTG', targetMarginPercent: 30 },
    ), 0);
  });

  test('simulatePriceIncrease ne projette rien sans taux saisi', () => {
    const scenarios = simulatePriceIncrease({ ...IMPORTE, exchangeRate: 1, monthlyUnits: 20 });
    assert.deepEqual(scenarios, []);
  });

  test('computeRateImpact refuse un ancien taux non saisi', () => {
    const impact = computeRateImpact({ ...IMPORTE } as never, 1, 145);
    assert.equal(impact.computable, false);
    assert.equal(impact.severity, 'none');
  });
});

describe('suggestSalePrice — le prix qui atteint l’objectif', () => {
  test('atteint réellement la marge visée', () => {
    const prix = suggestSalePrice(
      { purchasePrice: 10, costCurrency: 'USD' },
      { exchangeRate: 130, displayCurrency: 'HTG', targetMarginPercent: 35 },
    );
    const m = computeMargin({
      purchasePrice: 10, costCurrency: 'USD',
      salePrice: prix,   saleCurrency: 'HTG',
      exchangeRate: 130,
    });
    assert.ok(Math.abs(m.marginPercent - 35) < 0.1, `marge obtenue : ${m.marginPercent} %`);
  });

  test('tient compte de la commission', () => {
    const sans = suggestSalePrice(
      { purchasePrice: 10, costCurrency: 'USD' },
      { exchangeRate: 130, displayCurrency: 'HTG', targetMarginPercent: 30 },
    );
    const avec = suggestSalePrice(
      { purchasePrice: 10, costCurrency: 'USD', commissionPercent: 15 },
      { exchangeRate: 130, displayCurrency: 'HTG', targetMarginPercent: 30 },
    );
    assert.ok(avec > sans, 'une commission doit faire monter le prix conseillé');
  });

  test('renvoie 0 quand l’objectif est inatteignable', () => {
    assert.equal(suggestSalePrice(
      { purchasePrice: 100, costCurrency: 'HTG', commissionPercent: 80 },
      { exchangeRate: 1, displayCurrency: 'HTG', targetMarginPercent: 40 },
    ), 0);
  });
});

describe('computeRateImpact — la gourde qui glisse', () => {
  test('une hausse du dollar mange la marge d’un article importé', () => {
    const impact = computeRateImpact({ ...IMPORTE } as never, 130, 145);
    assert.equal(impact.computable, true);
    assert.ok(impact.variationPercent > 11 && impact.variationPercent < 12);
    assert.ok(impact.marginPointsLost > 0, 'la marge doit baisser');
    assert.equal(impact.severity, 'warning');
  });

  test('bascule en perte : alerte critique', () => {
    const impact = computeRateImpact(
      { ...IMPORTE, salePrice: 1400 } as never, 130, 175,
    );
    assert.equal(impact.becomesLoss, true);
    assert.equal(impact.severity, 'critical');
  });
});
