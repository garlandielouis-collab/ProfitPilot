import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildInbox,
  cardsForTab,
  computeStats,
  haitiDay,
  type InboxIntentRow,
  type InboxReceiptRow,
} from '../lib/paymentBridge/inbox';

// ─────────────────────────────────────────────────────────────────────────────
// La boîte de réception des paiements
//
// Ce qui est protégé ici : ce que le marchand voit EN PREMIER. Une carte rangée
// au mauvais endroit, et un doublon de 4 500 G dort dans « Tous » pendant que
// « À vérifier » paraît vide. Un bouton de trop, et un caissier « confirme » un
// paiement qu'aucun signal n'a détecté en croyant rattacher un SMS.
// ─────────────────────────────────────────────────────────────────────────────

const T0 = '2026-09-27T14:00:00.000Z';
const T1 = '2026-09-27T14:07:00.000Z';

function dette(extra: Partial<InboxIntentRow> = {}): InboxIntentRow {
  return {
    id:              'aaaaaaaa-0000-4000-8000-000000000001',
    reference:       'PP-7K9M2Q',
    status:          'awaiting_payment',
    method:          'moncash',
    chargeAmount:    4500,
    chargeCurrency:  'HTG',
    amountReceived:  0,
    createdAt:       T0,
    confirmedAt:     null,
    parentIntentId:  null,
    parentReference: null,
    orderId:         'bbbbbbbb-0000-4000-8000-000000000001',
    orderNumber:     'ORD-2026-10482',
    customerName:    'Marie',
    declared:        null,
    ...extra,
  };
}

function recu(extra: Partial<InboxReceiptRow> = {}): InboxReceiptRow {
  return {
    id:                   'cccccccc-0000-4000-8000-000000000001',
    intentId:             null,
    provider:             'moncash',
    source:               'sms_companion',
    amount:               4500,
    currency:             'HTG',
    transactionReference: 'MC8837451',
    senderIdentifier:     '+509 3712 3456',
    receivedAt:           T1,
    matchStatus:          'unmatched',
    appliedAmount:        null,
    resolution:           null,
    deviceName:           'Téléphone boutique',
    reason:               null,
    candidateIds:         [],
    ...extra,
  };
}

describe('une carte par décision', () => {
  test('un encaissement qui vise une dette est FUSIONNÉ avec elle', () => {
    const d = dette({ status: 'under_review' });
    const r = recu({ intentId: d.id, matchStatus: 'late' });
    const cards = buildInbox([d], [r]);

    assert.equal(cards.length, 1);
    assert.equal(cards[0].intentId, d.id);
    assert.equal(cards[0].receiptId, r.id);
    assert.equal(cards[0].tab, 'review');
    // « Confirmer » impute CET encaissement — pas « j'ai reçu l'argent ».
    assert.deepEqual(cards[0].actions, ['confirm', 'reject']);
  });

  test('un encaissement non rapproché a sa propre carte, dans « Problèmes »', () => {
    const cards = buildInbox([], [recu()]);
    assert.equal(cards.length, 1);
    assert.equal(cards[0].kind, 'receipt');
    assert.equal(cards[0].tab, 'problems');
    assert.equal(cards[0].headline, 'Paiement non rapproché');
    assert.deepEqual(cards[0].actions, ['link', 'ignore']);
  });

  test('ambigu : à vérifier, avec les commandes proposées', () => {
    const cards = buildInbox([], [recu({ matchStatus: 'ambiguous', candidateIds: ['x', 'y'] })]);
    assert.equal(cards[0].tab, 'review');
    assert.deepEqual(cards[0].candidateIds, ['x', 'y']);
  });

  test('un doublon se tranche, il ne se confirme pas', () => {
    const cards = buildInbox([], [recu({ matchStatus: 'duplicate' })]);
    assert.equal(cards[0].tab, 'problems');
    assert.ok(cards[0].actions.includes('resolve'));
    assert.ok(!cards[0].actions.includes('confirm'));
  });
});

describe('les montants', () => {
  test('un versement court visant une dette : problème, montant attendu affiché', () => {
    const d = dette({ status: 'under_review' });
    const r = recu({ intentId: d.id, matchStatus: 'amount_mismatch', amount: 4000 });
    const [card] = buildInbox([d], [r]);

    assert.equal(card.tab, 'problems');
    assert.equal(card.amount, 4000);
    assert.equal(card.expected, 4500);
  });

  test('un trop-perçu imputé reste à décider tant que le marchand n’a rien dit', () => {
    const d = dette({ status: 'confirmed', amountReceived: 5000, confirmedAt: T1 });
    const r = recu({ intentId: d.id, matchStatus: 'overpayment', amount: 5000, appliedAmount: 5000 });
    const cards = buildInbox([d], [r]);

    const receipt = cards.find((c) => c.kind === 'receipt');
    assert.ok(receipt, 'la carte du trop-perçu doit exister');
    assert.deepEqual(receipt!.actions, ['resolve']);
    // La dette, elle, est confirmée.
    assert.equal(cards.find((c) => c.kind === 'intent')!.tab, 'confirmed');
  });

  test('une fois tranché, le trop-perçu quitte les problèmes', () => {
    const d = dette({ status: 'confirmed', amountReceived: 5000, confirmedAt: T1 });
    const r = recu({ intentId: d.id, matchStatus: 'resolved', amount: 5000, appliedAmount: 5000,
                     resolution: 'refunded_manually' });
    const cards = buildInbox([d], [r]);
    assert.equal(cardsForTab(cards, 'problems').length, 0);
  });

  test('un encaissement imputé ne fait pas une seconde carte', () => {
    const d = dette({ status: 'confirmed', amountReceived: 4500, confirmedAt: T1 });
    const r = recu({ intentId: d.id, matchStatus: 'auto_matched', appliedAmount: 4500 });
    assert.equal(buildInbox([d], [r]).length, 1);
  });
});

describe('le reste dû', () => {
  test('la dette d’origine s’efface derrière sa complémentaire ouverte', () => {
    const origine = dette({ status: 'partially_paid', amountReceived: 4000 });
    const reste = dette({
      id: 'aaaaaaaa-0000-4000-8000-000000000002', reference: 'PP-R3ST3X',
      chargeAmount: 500, status: 'created', parentIntentId: origine.id, parentReference: origine.reference,
    });
    const cards = buildInbox([origine, reste], []);

    assert.equal(cards.length, 1);
    assert.equal(cards[0].intentId, reste.id);
    assert.match(cards[0].reason ?? '', /PP-7K9M2Q/);
  });

  test('sans complémentaire, la dette partielle est un problème à suivre', () => {
    const [card] = buildInbox([dette({ status: 'partially_paid', amountReceived: 4000 })], []);
    assert.equal(card.tab, 'problems');
    assert.match(card.reason ?? '', /500/);
  });
});

describe('ce que le client déclare', () => {
  test('« j’ai payé » arrive à vérifier, et la phrase dit que ce n’est pas une preuve', () => {
    const d = dette({ status: 'customer_reported',
                      declared: { amount: 4500, reference: 'MC8837451', at: T1 } });
    const [card] = buildInbox([d], []);

    assert.equal(card.tab, 'review');
    assert.equal(card.headline, 'Paiement signalé par le client');
    assert.match(card.reason ?? '', /Vérifiez sur votre téléphone/);
    // Pas d'encaissement joint : le seul geste possible est « j'ai vu l'argent ».
    assert.deepEqual(card.actions, ['confirm_manual', 'reject']);
  });

  test('une commande en attente ne se « rejette » pas : elle s’annule', () => {
    const [card] = buildInbox([dette()], []);
    assert.equal(card.tab, 'waiting');
    assert.deepEqual(card.actions, ['confirm_manual', 'cancel']);
  });

  test('« À vérifier » ne montre pas les commandes simplement en attente', () => {
    const cards = buildInbox([dette()], []);
    assert.equal(cardsForTab(cards, 'review').length, 0);
    assert.equal(cardsForTab(cards, 'all').length, 1);
  });
});

describe('les données sensibles', () => {
  test('le numéro de l’expéditeur et la transaction sont masqués sur la carte', () => {
    const [card] = buildInbox([], [recu()]);
    assert.equal(card.sender, '•••• 3456');
    assert.ok(!card.transaction?.includes('88374'), 'la référence complète ne doit pas s’afficher');
  });
});

describe('les chiffres du jour', () => {
  test('ce qui a été imputé aujourd’hui, compté une fois par encaissement', () => {
    const d = dette({ status: 'confirmed', amountReceived: 4500, confirmedAt: T1 });
    const receipts = [
      recu({ id: 'r1', intentId: d.id, matchStatus: 'amount_mismatch', amount: 4000, appliedAmount: 4000 }),
      recu({ id: 'r2', intentId: d.id, matchStatus: 'auto_matched', amount: 500, appliedAmount: 500 }),
      recu({ id: 'r3', matchStatus: 'unmatched', amount: 900 }),
    ];
    const cards = buildInbox([d], receipts);
    const s = computeStats(cards, receipts, '2026-09-27T18:00:00.000Z');

    assert.equal(s.todayReceived, 4500);
    assert.equal(s.todayCount, 1);
    assert.equal(s.unmatched, 1);
  });

  test('le jour est celui de Port-au-Prince, pas celui de Greenwich', () => {
    // 21 h le 27 à Port-au-Prince (UTC−4 en septembre) = 01 h le 28 en UTC.
    assert.equal(haitiDay('2026-09-28T01:00:00.000Z'), '2026-09-27');
  });
});
