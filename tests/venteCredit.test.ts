import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  splitCustomerName,
  placeholderEmail,
  PLACEHOLDER_EMAIL_DOMAIN,
} from '../lib/customerIdentity';
import { createSaleSchema } from '../lib/validations';

// ─────────────────────────────────────────────────────────────────────────────
// La vente à crédit du comptoir
//
// Le formulaire de vente rapide réclame un NOM de client pour une vente à
// crédit, et n'envoie que ce nom. Le serveur exigeait un identifiant : le
// marchand tapait ce qu'on lui demandait et se faisait répondre « Client requis
// pour les ventes à crédit. » Aucune vente à crédit ne sortait de cet écran.
//
// Ces tests tiennent les deux bouts du contrat : le schéma accepte le nom seul,
// et la traduction d'un nom tapé au comptoir en ligne `customers` ne perd rien
// ni ne fabrique de doublon.
// ─────────────────────────────────────────────────────────────────────────────

const BIZ  = '0865971c-26c9-4f82-a1df-5d0e4cbc134e';
const PROD = 'dafca435-7ddb-4425-923e-954c714d913b';

function saleInput(extra: Record<string, unknown>) {
  return {
    business_id:    BIZ,
    payment_method: 'Cash',
    items: [{
      product_id:   PROD,
      product_name: 'Bracelet Bronze',
      quantity:     1,
      unit_price:   2500,
    }],
    ...extra,
  };
}

describe('splitCustomerName — ce que le marchand a tapé', () => {
  test('un prénom et un nom', () => {
    assert.deepEqual(splitCustomerName('Louis Pilar'), { first: 'Louis', last: 'Pilar' });
  });

  test('un seul mot laisse le nom vide — « Jonathan » est un client valide', () => {
    assert.deepEqual(splitCustomerName('Jonathan'), { first: 'Jonathan', last: '' });
  });

  test('un nom composé reste entier plutôt que tronqué', () => {
    assert.deepEqual(
      splitCustomerName('Jean Baptiste Pierre Louis'),
      { first: 'Jean', last: 'Baptiste Pierre Louis' },
    );
  });

  test('les espaces en trop, devant, derrière et au milieu, ne créent pas de nom vide', () => {
    assert.deepEqual(splitCustomerName('  Marie   Claire  '), { first: 'Marie', last: 'Claire' });
  });

  test('les accents sont conservés : c’est le nom du client', () => {
    assert.deepEqual(splitCustomerName('Résilia Étienne'), { first: 'Résilia', last: 'Étienne' });
  });

  test('une chaîne vide ne lève pas — la garde du serveur s’en occupe avant', () => {
    assert.deepEqual(splitCustomerName('   '), { first: '', last: '' });
  });
});

describe('placeholderEmail — une adresse pour qui n’en a pas', () => {
  test('la forme est une adresse, sur un domaine jamais routable', () => {
    const mail = placeholderEmail(BIZ, 'Louis', 'Pilar', 'fixe');
    assert.equal(mail, `no-email-${BIZ.replace(/-/g, '')}-louispilar-fixe@${PLACEHOLDER_EMAIL_DOMAIN}`);
  });

  test('ni majuscule, ni espace, ni accent : une adresse doit rester une adresse', () => {
    const mail = placeholderEmail(BIZ, 'Résilia', 'Étienne Pierre', 'fixe');
    assert.match(mail, /^[a-z0-9@.\-]+$/);
  });

  test('un nom sans une seule lettre utilisable garde quand même une adresse valable', () => {
    const mail = placeholderEmail(BIZ, '...', '', 'fixe');
    assert.match(mail, /-customer-fixe@/);
  });

  test('deux clients créés dans la même seconde ne se marchent pas dessus', () => {
    // `customers.email` est unique par entreprise : deux adresses identiques
    // feraient échouer la deuxième vente à crédit de la journée.
    const a = placeholderEmail(BIZ, 'Client', '');
    const b = placeholderEmail(BIZ, 'Client', '');
    assert.notEqual(a, b);
  });
});

describe('createSaleSchema — le nom suffit pour une vente à crédit', () => {
  test('un nom seul est accepté : c’est tout ce que la vente rapide envoie', () => {
    const parsed = createSaleSchema.safeParse(
      saleInput({ payment_status: 'credit', customer_name: 'Jonathan' }),
    );
    assert.equal(parsed.success, true);
  });

  test('un identifiant seul est accepté : c’est ce que le panier complet envoie', () => {
    const parsed = createSaleSchema.safeParse(
      saleInput({ payment_status: 'credit', customer_id: '23540cc8-2287-42e6-8884-18d8fe0ef68d' }),
    );
    assert.equal(parsed.success, true);
  });

  test('sans client, une vente à crédit est refusée — on ne sait pas qui doit', () => {
    const parsed = createSaleSchema.safeParse(saleInput({ payment_status: 'credit' }));
    assert.equal(parsed.success, false);
    if (!parsed.success) {
      assert.deepEqual(parsed.error.issues[0].path, ['customer_id']);
    }
  });

  test('une vente payée n’a pas besoin de client', () => {
    const parsed = createSaleSchema.safeParse(saleInput({ payment_status: 'paid' }));
    assert.equal(parsed.success, true);
  });
});
