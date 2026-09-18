import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  PLAN_MAX_MEMBERS,
  PLAN_MAX_PRODUCTS,
  PLAN_MAX_STORES,
  UNLIMITED,
  featuresForPlan,
  formatQuota,
  planAiCredits,
  planAiQuestions,
  planHasFeature,
  planMaxMembers,
  planMaxProducts,
  planMaxStores,
  plansWithFeature,
  requiredPlanFor,
} from '../lib/planFeatures';
import { PLANS, getPlanByKey, getPlanLabel, normalizePlanKey } from '../lib/plans';
import { previewFeatureOverrideEnabled } from '../lib/storePreview';

// Les trois clés telles qu'elles sont stockées en base, et leur nom commercial.
const ESANSYEL = 'Ti Machann';
const KWASANS  = 'Business Pilot';
const ELIT     = 'Expert';

describe('normalizePlanKey — une seule vérité pour trois écritures', () => {
  test('reconnaît les clés de base', () => {
    assert.equal(normalizePlanKey(ESANSYEL), ESANSYEL);
    assert.equal(normalizePlanKey(KWASANS), KWASANS);
    assert.equal(normalizePlanKey(ELIT), ELIT);
  });

  test('tolère la casse et les espaces', () => {
    assert.equal(normalizePlanKey('  business pilot  '), KWASANS);
  });

  test('rend null pour une offre inconnue ou absente', () => {
    for (const v of [null, undefined, '', 'gold', 'Premium']) {
      assert.equal(normalizePlanKey(v), null);
    }
  });

  test('une offre inconnue s’affiche « Essai gratuit », pas un nom inventé', () => {
    assert.equal(getPlanLabel('gold'), 'Essai gratuit');
    assert.equal(getPlanLabel(null), 'Essai gratuit');
  });
});

// ── Les plafonds ────────────────────────────────────────────────────────────
//
// Ce sont eux qui décident d'un paiement : le mur du 51ᵉ produit est le moment
// exact où un marchand d'Esansyel décide de passer à Kwasans. S'ils bougent
// sans que la page de prix bouge, l'application ment sur ce qu'elle vend.

describe('les plafonds d’offre', () => {
  test('produits : 50 à Esansyel, illimité au-dessus', () => {
    assert.equal(planMaxProducts(ESANSYEL), 50);
    assert.equal(planMaxProducts(KWASANS), UNLIMITED);
    assert.equal(planMaxProducts(ELIT), UNLIMITED);
  });

  test('membres : 1 / 3 / illimité', () => {
    assert.equal(planMaxMembers(ESANSYEL), 1);
    assert.equal(planMaxMembers(KWASANS), 3);
    assert.equal(planMaxMembers(ELIT), UNLIMITED);
  });

  test('boutiques : 1 / 1 / 3', () => {
    assert.equal(planMaxStores(ESANSYEL), 1);
    assert.equal(planMaxStores(KWASANS), 1);
    assert.equal(planMaxStores(ELIT), 3);
  });

  test('crédits et questions IA : zéro à Esansyel, le Commerce y est fermé', () => {
    assert.equal(planAiQuestions(ESANSYEL), 0);
    assert.equal(planAiCredits(ESANSYEL), 0);
    assert.equal(planAiQuestions(KWASANS), 30);
    assert.equal(planAiCredits(KWASANS), 100);
    assert.equal(planAiCredits(ELIT), 500);
  });

  test('une offre inconnue retombe sur la plus petite, jamais sur la plus grande', () => {
    assert.equal(planMaxProducts('gold'), PLAN_MAX_PRODUCTS[ESANSYEL]);
    assert.equal(planMaxMembers(null), PLAN_MAX_MEMBERS[ESANSYEL]);
    assert.equal(planMaxStores(undefined), PLAN_MAX_STORES[ESANSYEL]);
    assert.equal(planAiCredits('gold'), 0);
  });

  test('formatQuota écrit « illimité » plutôt qu’un ∞', () => {
    assert.equal(formatQuota(50), '50');
    assert.equal(formatQuota(UNLIMITED), 'illimité');
  });
});

describe('les fonctionnalités par offre', () => {
  test('les aperçus de boutique restent autorisés en local et en test', () => {
    assert.equal(previewFeatureOverrideEnabled(), true);
  });

  test('chaque offre contient tout ce que contient la précédente', () => {
    const esansyel = new Set(featuresForPlan(ESANSYEL));
    const kwasans  = new Set(featuresForPlan(KWASANS));
    const elit     = new Set(featuresForPlan(ELIT));

    for (const f of esansyel) assert.ok(kwasans.has(f), `Kwasans a perdu « ${f} »`);
    for (const f of kwasans)  assert.ok(elit.has(f),    `Elit a perdu « ${f} »`);
  });

  test('requiredPlanFor nomme la PLUS PETITE offre qui donne la fonctionnalité', () => {
    for (const feature of featuresForPlan(ELIT)) {
      const required = requiredPlanFor(feature);
      assert.ok(required, `« ${feature} » n'appartient à aucune offre`);
      assert.ok(
        planHasFeature(required, feature),
        `« ${feature} » est annoncée pour ${required} sans y figurer`,
      );
    }
  });

  test('plansWithFeature et planHasFeature disent la même chose', () => {
    for (const feature of featuresForPlan(ELIT)) {
      const plans = plansWithFeature(feature);
      for (const key of [ESANSYEL, KWASANS, ELIT] as const) {
        assert.equal(
          plans.includes(key),
          planHasFeature(key, feature),
          `désaccord sur « ${feature} » pour ${key}`,
        );
      }
    }
  });

  test('une offre inconnue n’ouvre rien', () => {
    assert.equal(planHasFeature('gold', 'online_store'), false);
    assert.equal(planHasFeature(null, 'online_store'), false);
    assert.deepEqual(featuresForPlan('gold'), []);
  });
});

describe('le catalogue commercial', () => {
  test('les trois offres du tarif correspondent aux trois clés', () => {
    assert.equal(PLANS.length, 3);
    for (const plan of PLANS) {
      assert.equal(normalizePlanKey(plan.key), plan.key);
      assert.equal(getPlanByKey(plan.key)?.label, plan.label);
    }
  });

  test('les prix montent avec les offres', () => {
    const prix = PLANS.map((p) => p.priceG);
    assert.deepEqual(prix, [...prix].sort((a, b) => a - b));
    assert.ok(prix.every((p) => p > 0));
  });

  test('chaque offre annonce ses arguments dans les deux langues', () => {
    for (const plan of PLANS) {
      assert.ok(plan.features.length > 0, `${plan.label} ne vend rien`);
      for (const f of plan.features) {
        assert.ok(f.fr.trim().length > 0 && f.ht.trim().length > 0, `${plan.label} : ligne incomplète`);
      }
    }
  });

  test('aucune offre ne vend l’API tant qu’elle n’existe pas', () => {
    // La décision est documentée dans `app/api-access/page.tsx` : l'écran dit
    // « en préparation », donc le tarif ne doit pas la promettre.
    for (const plan of PLANS) {
      for (const f of plan.features) {
        assert.doesNotMatch(f.fr, /\bAPI\b/i, `${plan.label} promet l'API : « ${f.fr} »`);
      }
    }
  });
});
