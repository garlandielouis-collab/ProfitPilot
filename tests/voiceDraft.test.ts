import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { draftBlockers, normalizeExtraction, toMinor, type VoiceContext } from '../lib/voice/draft';
import { rawExtractionSchema, type RawTransaction } from '../lib/voice/schema';
import { draftLabel, draftToSheet, spokenAmount } from '../lib/voice/sheet';

const ctx: VoiceContext = {
  products: [
    { id: 'p-kola', name: 'Kola', priceMinor: 7500 },
    { id: 'p-pen', name: 'Pen', priceMinor: 10000 },
  ],
  customers: [{ id: 'c-joseph', name: 'Madan Joseph' }, { id: 'c-jean', name: 'Jean' }],
  usdRate: 132,
};

const tx = (over: Partial<RawTransaction>): RawTransaction => ({
  type: 'sale', lines: [], amount_minor: null, currency: 'HTG', payment_method: null,
  customer_id: null, customer_label: null, expense_category: null,
  confidence: 0.95, amount_confidence: 0.95, needs_clarification: null, ...over,
});

const one = (t: RawTransaction) =>
  normalizeExtraction(rawExtractionSchema.parse({ transcription: '', transactions: [t] }), ctx)[0];

describe('les cinq premières phrases de la spécification (§2.1)', () => {
  test('« M vann 2 kola ak 1 pen, 250 goud, MonCash » : vente, 2 lignes, 250 HTG, MonCash', () => {
    const d = one(tx({
      type: 'sale', amount_minor: 25000, payment_method: 'moncash',
      lines: [
        { product_id: 'p-kola', label: 'kola', quantity: 2, is_new_product: false },
        { product_id: 'p-pen', label: 'pen', quantity: 1, is_new_product: false },
      ],
    }));
    assert.equal(d.type, 'sale');
    assert.equal(d.lines.length, 2);
    assert.equal(d.amountMinor, 25000);
    assert.equal(d.currency, 'HTG');
    assert.equal(d.paymentMethod, 'moncash');
    assert.equal(d.catalogTotalMinor, 25000);
    assert.equal(d.totalMismatch, false);
    assert.deepEqual(draftBlockers(d), []);
  });

  test('« M depanse 500 goud transpò » : dépense, 500 HTG, transport', () => {
    const d = one(tx({ type: 'expense', amount_minor: 50000, expense_category: 'Transport' }));
    assert.equal(d.type, 'expense');
    assert.equal(d.amountMinor, 50000);
    assert.equal(d.expenseCategory, 'Transport');
  });

  test('« Madan Joseph pran 1 200 goud kredi » : crédit au client connu', () => {
    const d = one(tx({ type: 'credit', amount_minor: 120000, customer_id: 'c-joseph', customer_label: 'Madan Joseph' }));
    assert.equal(d.type, 'credit');
    assert.equal(d.paymentMethod, 'credit');
    assert.equal(d.customerId, 'c-joseph');
    assert.equal(d.amountMinor, 120000);
  });

  test('« Jean peye 500 sou kredi l » : paiement partiel de crédit', () => {
    const d = one(tx({ type: 'credit_payment', amount_minor: 50000, customer_id: 'c-jean', customer_label: 'Jean' }));
    assert.equal(d.type, 'credit_payment');
    assert.equal(d.customerLabel, 'Jean');
    assert.equal(d.paymentMethod, null);
  });

  test('« M pran 1 000 pou lakay » : retrait personnel, catégorie Kay', () => {
    const d = one(tx({ type: 'owner_withdrawal', amount_minor: 100000 }));
    assert.equal(d.type, 'owner_withdrawal');
    assert.equal(d.expenseCategory, 'Retrait personnel');
  });
});

describe('la normalisation ne fait confiance qu’à ce qui existe', () => {
  test('un identifiant de produit inventé est effacé, le libellé dit reste', () => {
    const d = one(tx({ amount_minor: 5000, lines: [{ product_id: 'p-invente', label: 'bonbon', quantity: 3, is_new_product: false }] }));
    assert.equal(d.lines[0].productId, null);
    assert.equal(d.lines[0].label, 'bonbon');
    assert.equal(d.catalogTotalMinor, null);
  });

  test('un client inventé n’est pas rattaché ; son nom reste à confirmer', () => {
    const d = one(tx({ type: 'credit', amount_minor: 1000, customer_id: 'c-fantome', customer_label: 'Pierre' }));
    assert.equal(d.customerId, null);
    assert.equal(d.customerLabel, 'Pierre');
  });

  test('un total qui ne colle pas avec le catalogue est signalé, pas corrigé', () => {
    const d = one(tx({ amount_minor: 20000, lines: [{ product_id: 'p-kola', label: 'kola', quantity: 2, is_new_product: false }] }));
    assert.equal(d.amountMinor, 20000);
    assert.equal(d.catalogTotalMinor, 15000);
    assert.equal(d.totalMismatch, true);
  });

  test('le dola ayisyen devient des gourdes (× 5), le dollar reste en dollars avec le taux', () => {
    const dola = one(tx({ amount_minor: 5000, currency: 'HAITIAN_DOLLAR' }));
    assert.equal(dola.amountMinor, 25000);
    assert.equal(dola.currency, 'HTG');
    const usd = one(tx({ amount_minor: 2000, currency: 'USD' }));
    assert.equal(usd.amountMinor, 2000);
    assert.equal(usd.currency, 'USD');
    assert.equal(usd.usdRate, 132);
  });

  test('confiance faible : le brouillon et le montant sont marqués', () => {
    const d = one(tx({ amount_minor: 25000, confidence: 0.6, amount_confidence: 0.7 }));
    assert.equal(d.needsReview, true);
    assert.equal(d.amountNeedsCheck, true);
    const sure = one(tx({ amount_minor: 25000, confidence: 0.7, amount_confidence: 0.8 }));
    assert.equal(sure.needsReview, false);
    assert.equal(sure.amountNeedsCheck, false);
  });

  test('sans montant ou sans client pour un crédit, on ne peut pas confirmer', () => {
    assert.equal(draftBlockers(one(tx({ amount_minor: null }))).length, 1);
    assert.equal(draftBlockers(one(tx({ type: 'credit', amount_minor: 1000 }))).length, 1);
  });

  test('le schéma refuse un montant négatif ou une quantité nulle', () => {
    assert.throws(() => rawExtractionSchema.parse({ transcription: '', transactions: [tx({ amount_minor: -5 })] }));
    assert.throws(() => rawExtractionSchema.parse({
      transcription: '', transactions: [tx({ lines: [{ product_id: null, label: 'x', quantity: 0, is_new_product: true }] })],
    }));
  });

  test('les centimes sont des entiers, jamais des flottants', () => {
    assert.equal(toMinor(0.1 + 0.2), 30);
    assert.equal(toMinor(1234.565), 123457);
  });
});

describe('« Korije » : le brouillon rouvert dans la feuille', () => {
  test('50 dola s’ouvre sur 50 dola, pas sur 250 goud', () => {
    const d = one(tx({ type: 'sale', amount_minor: 5000, currency: 'HAITIAN_DOLLAR' }));
    assert.equal(d.amountMinor, 25000);
    assert.deepEqual(spokenAmount(d), { amount: 50, unit: 'DOLA' });
  });
  test('un montant en dollars US garde son unité', () => {
    const d = one(tx({ type: 'expense', amount_minor: 1050, currency: 'USD', expense_category: 'Transport' }));
    const s = draftToSheet(d);
    assert.equal(s.sheet, 'expense');
    if (s.sheet === 'expense') assert.deepEqual([s.preset.amount, s.preset.unit, s.preset.category], [10.5, 'USD', 'Transport']);
  });
  test('le crédit ouvre la vente à crédit, avec le client', () => {
    const d = one(tx({ type: 'credit', amount_minor: 100000, customer_label: 'Jean', customer_id: 'c-jean' }));
    const s = draftToSheet(d);
    assert.ok(s.sheet === 'sale' && s.preset.credit === true && s.preset.customerName === 'Jean' && s.preset.amount === 1000);
  });
  test('le retrait pour la maison ouvre la dépense « Kay »', () => {
    const s = draftToSheet(one(tx({ type: 'owner_withdrawal', amount_minor: 50000 })));
    assert.ok(s.sheet === 'expense' && s.preset.household === true && s.preset.amount === 500);
  });
  test('le paiement de crédit renvoie à la page des crédits', () => {
    const s = draftToSheet(one(tx({ type: 'credit_payment', amount_minor: 20000, customer_label: 'Jean' })));
    assert.equal(s.sheet, 'receivables');
  });
  test('les lignes deviennent le libellé : « 2 Kola, Pen »', () => {
    const d = one(tx({ type: 'sale', amount_minor: 25000, lines: [
      { product_id: 'p-kola', label: 'kola', quantity: 2, is_new_product: false },
      { product_id: 'p-pen', label: 'pen', quantity: 1, is_new_product: false },
    ] }));
    assert.equal(draftLabel(d), '2 Kola, Pen');
  });
});
