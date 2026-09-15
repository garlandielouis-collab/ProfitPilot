import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  convertCurrency,
  isExchangeRateSet,
  makeToReport,
  unconvertedNotice,
} from '../lib/currency';

describe('isExchangeRateSet — 1 n’est pas un taux', () => {
  test('refuse tout ce qui n’a pas été saisi', () => {
    for (const v of [null, undefined, '', 0, 1, -5, 'abc', Number.NaN]) {
      assert.equal(isExchangeRateSet(v), false, `${String(v)} ne devrait pas passer`);
    }
  });

  test('accepte un taux réel, y compris écrit en texte', () => {
    assert.equal(isExchangeRateSet(130), true);
    assert.equal(isExchangeRateSet('132.5'), true);
    assert.equal(isExchangeRateSet(1.01), true);
  });
});

describe('convertCurrency', () => {
  test('ne touche pas une même devise', () => {
    assert.equal(convertCurrency(500, 'HTG', 'HTG', 130), 500);
  });

  test('1 USD = taux HTG, dans les deux sens', () => {
    assert.equal(convertCurrency(10, 'USD', 'HTG', 130), 1300);
    assert.equal(convertCurrency(1300, 'HTG', 'USD', 130), 10);
  });
});

// ── Le total incomplet ──────────────────────────────────────────────────────
//
// Un montant inconvertible sort du total et se COMPTE. L'écran peut alors dire
// « 3 montants en USD non comptés » au lieu d'afficher un total faux sans le
// signaler. C'est la même règle que `fn_to_business_currency` en SQL.

describe('makeToReport — ce qui entre dans le total, et ce qui en sort', () => {
  const avecTaux = makeToReport({ exchangeRate: 130, exchangeRateSet: true, defaultCurrency: 'HTG' });
  const sansTaux = makeToReport({ exchangeRate: 1,   exchangeRateSet: false, defaultCurrency: 'HTG' });

  test('la devise du rapport passe telle quelle, taux ou pas', () => {
    assert.equal(avecTaux(500, 'HTG'), 500);
    assert.equal(sansTaux(500, 'HTG'), 500);
  });

  test('une devise absente vaut la gourde', () => {
    assert.equal(sansTaux(500, null), 500);
    assert.equal(sansTaux(500, undefined), 500);
  });

  test('la casse de la devise n’a pas d’importance', () => {
    assert.equal(avecTaux(10, 'usd'), 1300);
  });

  test('convertit quand le taux a été saisi', () => {
    assert.equal(avecTaux(10, 'USD'), 1300);
  });

  test('rend null — jamais un chiffre — sans taux saisi', () => {
    assert.equal(sansTaux(10, 'USD'), null);
  });

  test('rapport en dollars : la gourde se divise', () => {
    const enUsd = makeToReport({ exchangeRate: 130, exchangeRateSet: true, defaultCurrency: 'USD' });
    assert.equal(enUsd(1300, 'HTG'), 10);
    assert.equal(enUsd(10, 'USD'), 10);
  });

  test('une devise inconnue ne se convertit pas au hasard', () => {
    assert.equal(avecTaux(10, 'EUR'), null);
  });
});

describe('unconvertedNotice — la mention qui accompagne un total incomplet', () => {
  test('nomme l’autre devise que celle du rapport', () => {
    assert.match(unconvertedNotice(3, 'HTG').fr, /en USD/);
    assert.match(unconvertedNotice(3, 'USD').fr, /en HTG/);
  });

  test('accorde le pluriel', () => {
    assert.match(unconvertedNotice(1, 'HTG').fr, /^1 montant en USD non compté /);
    assert.match(unconvertedNotice(4, 'HTG').fr, /^4 montants en USD non comptés /);
  });

  test('rend les deux langues', () => {
    const n = unconvertedNotice(2, 'HTG');
    assert.ok(n.fr.length > 0 && n.ht.length > 0);
    assert.notEqual(n.fr, n.ht);
  });
});
