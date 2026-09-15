import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  computeStoreHealth,
  healthTone,
  type StoreHealthFacts,
} from '../lib/storeHealth';

/** Une boutique qui n'a rien : le point de départ de tout marchand. */
const VIDE: StoreHealthFacts = {
  isActive: false,
  productCount: 0,
  publishedCount: 0,
  missingImage: 0,
  missingDescription: 0,
  missingSeo: 0,
  missingCategory: 0,
  hasStoreSeo: false,
  hasLogo: false,
  hasTagline: false,
  hasCustomColors: false,
  hasContact: false,
  paymentMethodCount: 0,
  gatewayMissingCredentials: false,
  shippingModeCount: 0,
};

/** Une boutique tenue : tout est fait. */
const COMPLETE: StoreHealthFacts = {
  isActive: true,
  productCount: 12,
  publishedCount: 12,
  missingImage: 0,
  missingDescription: 0,
  missingSeo: 0,
  missingCategory: 0,
  hasStoreSeo: true,
  hasLogo: true,
  hasTagline: true,
  hasCustomColors: true,
  hasContact: true,
  paymentMethodCount: 2,
  gatewayMissingCredentials: false,
  shippingModeCount: 2,
};

describe('computeStoreHealth — la note ne décore pas', () => {
  test('un catalogue vide ne reçoit pas de note, il reçoit « neuf »', () => {
    // Une note calculée sur rien se lirait comme un jugement. Elle se tait.
    assert.equal(computeStoreHealth(VIDE).level, 'neuf');
  });

  test('« neuf » tient même si les réglages sont faits', () => {
    const reglee = { ...COMPLETE, productCount: 0, publishedCount: 0 };
    assert.equal(computeStoreHealth(reglee).level, 'neuf');
  });

  test('une boutique tenue est excellente', () => {
    const h = computeStoreHealth(COMPLETE);
    assert.equal(h.score, 100);
    assert.equal(h.level, 'excellent');
    assert.deepEqual(h.todo, [], 'rien à faire quand tout est fait');
  });

  test('la note reste entre 0 et 100, quoi qu’on lui donne', () => {
    for (const facts of [VIDE, COMPLETE, { ...COMPLETE, publishedCount: 999 }]) {
      const { score } = computeStoreHealth(facts);
      assert.ok(score >= 0 && score <= 100, `note hors bornes : ${score}`);
    }
  });

  test('la note est la somme des points gagnés', () => {
    const h = computeStoreHealth(COMPLETE);
    assert.equal(h.score, h.criteria.reduce((s, c) => s + c.earned, 0));
  });

  test('aucun critère ne rapporte plus que son poids', () => {
    for (const facts of [VIDE, COMPLETE, { ...COMPLETE, publishedCount: 999 }]) {
      for (const c of computeStoreHealth(facts).criteria) {
        assert.ok(c.earned >= 0 && c.earned <= c.weight, `« ${c.label} » : ${c.earned}/${c.weight}`);
      }
    }
  });

  test('les poids totalisent 100 : la note se lit sur cent', () => {
    const total = computeStoreHealth(COMPLETE).criteria.reduce((s, c) => s + c.weight, 0);
    assert.equal(total, 100);
  });
});

describe('les manques, dans l’ordre où ils se réparent', () => {
  test('le « à faire » ne liste que ce qui manque', () => {
    const h = computeStoreHealth(COMPLETE);
    assert.equal(h.todo.length, 0);

    const sansPaiement = computeStoreHealth({ ...COMPLETE, paymentMethodCount: 0 });
    assert.ok(sansPaiement.todo.some((c) => c.key === 'payment'));
    assert.ok(sansPaiement.score < 100);
  });

  test('les plus lourds d’abord : une heure de travail y rapporte le plus', () => {
    const h = computeStoreHealth({ ...VIDE, productCount: 3, publishedCount: 1 });
    const poids = h.todo.map((c) => c.weight);
    assert.deepEqual(poids, [...poids].sort((a, b) => b - a));
  });

  test('chaque manque dit quoi faire et où', () => {
    const h = computeStoreHealth({ ...VIDE, productCount: 3, publishedCount: 1 });
    for (const c of h.todo) {
      assert.ok(c.recommendation && c.recommendation.trim().length > 0, `« ${c.label} » ne dit pas quoi faire`);
      assert.match(c.href, /^\//, `« ${c.label} » ne mène nulle part`);
    }
  });

  test('une passerelle sans identifiants n’est pas un mode de paiement', () => {
    const avec  = computeStoreHealth({ ...COMPLETE, gatewayMissingCredentials: false });
    const sans  = computeStoreHealth({ ...COMPLETE, gatewayMissingCredentials: true });
    assert.ok(sans.score < avec.score, 'des identifiants manquants doivent coûter des points');
  });

  test('des fiches sans photo coûtent des points', () => {
    const avecPhotos = computeStoreHealth(COMPLETE);
    const sansPhotos = computeStoreHealth({ ...COMPLETE, missingImage: 12 });
    assert.ok(sansPhotos.score < avecPhotos.score);
    assert.ok(sansPhotos.todo.some((c) => c.key === 'photos'));
  });
});

describe('healthTone — la couleur et le mot s’accordent', () => {
  test('chaque niveau a un ton, et « neuf » n’alarme pas', () => {
    assert.equal(healthTone('neuf'), 'neutral');
    assert.equal(healthTone('excellent'), 'success');
    assert.equal(healthTone('bon'), 'success');
    assert.equal(healthTone('faible'), 'danger');
  });
});
