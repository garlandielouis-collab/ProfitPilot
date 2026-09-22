import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  matchReceipt,
  type IncomingReceipt,
  type MatchCandidate,
} from '../lib/paymentBridge/matching';
import {
  dedupeKey,
  normalizeSender,
  normalizeTransactionReference,
} from '../lib/paymentBridge/dedupe';
import {
  assertTransition,
  canTransition,
  isOpen,
  isTerminal,
  OPEN_STATUSES,
} from '../lib/paymentBridge/states';
import { MATCH_WINDOW_MINUTES, SESSION_MINUTES } from '../lib/paymentBridge/types';

// ─────────────────────────────────────────────────────────────────────────────
// Le rapprochement des paiements
//
// Ce qui est protégé ici, c'est la question « cette commande est-elle payée ? ».
// Une erreur dans un sens fait livrer une commande que personne n'a payée ; dans
// l'autre, elle fait réclamer un client qui a payé. Les deux coûtent au marchand,
// et la seconde lui coûte le client.
//
// Les dix scénarios du cahier des charges sont couverts nommément plus bas. Deux
// ne peuvent PAS l'être ici et sont dits à leur place : la confirmation
// concurrente et l'isolation entre entreprises vivent en SQL, et le SQL ne
// s'exécute pas dans Node (tests/README.md).
// ─────────────────────────────────────────────────────────────────────────────

// Une horloge fixe : un test qui dépend de l'heure réelle échoue un jour à
// minuit, et on met une semaine à comprendre pourquoi.
const COMMANDE = '2026-09-27T14:00:00.000Z';
const PAIEMENT = '2026-09-27T14:07:00.000Z';   // 7 min après : dans la fenêtre
const EXPIRE   = '2026-09-27T14:15:00.000Z';   // la session dure 15 min

function dette(extra: Partial<MatchCandidate> = {}): MatchCandidate {
  return {
    id:                'aaaaaaaa-0000-4000-8000-000000000001',
    reference:         'PP-7K9M2Q',
    method:            'moncash',
    chargeAmount:      4500,
    chargeCurrency:    'HTG',
    amountReceived:    0,
    status:            'awaiting_payment',
    createdAt:         COMMANDE,
    sessionExpiresAt:  EXPIRE,
    ...extra,
  };
}

function recu(extra: Partial<IncomingReceipt> = {}): IncomingReceipt {
  return {
    provider:             'moncash',
    amount:               4500,
    currency:             'HTG',
    transactionReference: 'MC8837451',
    senderIdentifier:     '+509 3712 3456',
    receivedAt:           PAIEMENT,
    dedupeBasis:          'reference',
    ...extra,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Les scénarios du cahier des charges, dans l'ordre
// ═══════════════════════════════════════════════════════════════════════════

describe('Scénario 1 — 4 500 attendus, 4 500 reçus', () => {
  test('confirmé sans intervention, et pour le montant reçu', () => {
    const out = matchReceipt(recu(), [dette()]);

    assert.equal(out.decision, 'auto_confirm');
    assert.equal(out.matchStatus, 'auto_matched');
    assert.equal(out.confidence, 'exact');
    assert.equal(out.intentId, 'aaaaaaaa-0000-4000-8000-000000000001');
    assert.equal(out.applyAmount, 4500);
    assert.equal(out.difference, 0);
  });

  test('la phrase affichée nomme le montant et la référence', () => {
    const out = matchReceipt(recu(), [dette()]);
    assert.match(out.reason.fr, /4\s*500 HTG/);
    assert.match(out.reason.fr, /PP-7K9M2Q/);
    // Le créole n'est pas facultatif : la moitié des marchands lit celui-là.
    assert.ok(out.reason.ht.length > 0, 'la phrase créole manque');
  });

  test("un centime d'arrondi JSON ne casse pas le rapprochement", () => {
    // 4499.999999999999 est ce que rend parfois un nombre passé en JSON.
    const out = matchReceipt(recu({ amount: 4499.999999999999 }), [dette()]);
    assert.equal(out.decision, 'auto_confirm');
  });

  test("une gourde d'écart, elle, n'est PAS un arrondi", () => {
    const out = matchReceipt(recu({ amount: 4499 }), [dette()]);
    assert.equal(out.decision, 'needs_review');
    assert.equal(out.matchStatus, 'amount_mismatch');
  });
});

describe('Scénario 2 — 4 500 attendus, 4 000 reçus', () => {
  const out = matchReceipt(recu({ amount: 4000 }), [dette()]);

  test('anomalie de montant, jamais confirmée seule', () => {
    assert.equal(out.decision, 'needs_review');
    assert.equal(out.matchStatus, 'amount_mismatch');
    assert.equal(out.confidence, 'medium');
  });

  test("l'écart est rendu signé, pour que l'appelant sache de quel côté", () => {
    assert.equal(out.difference, -500);
  });

  test('rien n’est imputé sans décision du marchand', () => {
    assert.equal(out.applyAmount, null);
  });

  test('la phrase dit ce qui manque, en chiffres', () => {
    assert.match(out.reason.fr, /manque 500 HTG/);
  });
});

describe('Scénario 3 — 4 500 attendus, 5 000 reçus', () => {
  const out = matchReceipt(recu({ amount: 5000 }), [dette()]);

  test('trop-perçu constaté, pas crédité', () => {
    assert.equal(out.decision, 'needs_review');
    assert.equal(out.matchStatus, 'overpayment');
    assert.equal(out.difference, 500);
    assert.equal(out.applyAmount, null, 'un trop-perçu ne s’impute pas tout seul');
  });

  test('la dette visée est nommée : le marchand doit savoir laquelle', () => {
    assert.equal(out.intentId, 'aaaaaaaa-0000-4000-8000-000000000001');
  });
});

describe('Scénario 4 — 4 500 reçus deux fois', () => {
  test('un second versement sur une dette soldée est un doublon', () => {
    const soldee = dette({ status: 'confirmed', amountReceived: 4500 });
    const out = matchReceipt(recu({ transactionReference: 'MC9999999' }), [soldee]);

    assert.equal(out.decision, 'duplicate');
    assert.equal(out.matchStatus, 'duplicate');
    // Aucune dette n'est visée : il n'y a rien à imputer, seulement à trancher.
    assert.equal(out.intentId, null);
    assert.deepEqual(out.candidateIds, [soldee.id]);
    assert.match(out.reason.fr, /déjà payée/);
  });

  test('« payé en double » passe devant « il manque 500 » sur une autre commande', () => {
    // Le cas réel : le client repaie la commande soldée, et une autre commande
    // du même marchand attend 5 000. Lire un doublon est la bonne lecture — un
    // client qui paie deux fois le fait du même montant.
    const soldee = dette({ id: 'sol-de', status: 'confirmed', amountReceived: 4500 });
    const autre  = dette({ id: 'autre', reference: 'PP-ZZZ111', chargeAmount: 5000 });

    const out = matchReceipt(recu(), [soldee, autre]);
    assert.equal(out.decision, 'duplicate');
  });
});

describe('Scénario 5 — paiement reçu après expiration', () => {
  // 14 h 22 pour une session close à 14 h 15. L'argent est parti : il est arrivé.
  const tardif = recu({ receivedAt: '2026-09-27T14:22:00.000Z' });
  const out = matchReceipt(tardif, [dette()]);

  test('marqué tardif, et jamais rejeté automatiquement', () => {
    assert.equal(out.matchStatus, 'late');
    assert.equal(out.decision, 'needs_review');
    assert.notEqual(out.decision, 'unmatched');
  });

  test('la dette reste identifiée : le marchand n’a qu’à confirmer', () => {
    assert.equal(out.intentId, 'aaaaaaaa-0000-4000-8000-000000000001');
    assert.equal(out.confidence, 'high', 'le montant est exact : la confiance reste haute');
  });

  test('un délai expiré n’efface pas un virement — la phrase le dit', () => {
    assert.match(out.reason.fr, /bon montant/);
    assert.match(out.reason.fr, /expiration/);
  });
});

describe('Scénario 6 — paiement sans commande', () => {
  test('aucune dette ouverte : non rapproché, et visible', () => {
    const out = matchReceipt(recu(), []);
    assert.equal(out.decision, 'unmatched');
    assert.equal(out.matchStatus, 'unmatched');
    assert.equal(out.confidence, 'none');
    assert.equal(out.intentId, null);
  });

  test('la phrase ne parle pas d’erreur : l’argent est bien arrivé', () => {
    const out = matchReceipt(recu(), []);
    assert.match(out.reason.fr, /reçus/);
    assert.doesNotMatch(out.reason.fr, /erreur|invalide|refus/i);
  });
});

describe('Scénario 7 — deux commandes possibles', () => {
  const a = dette({ id: 'un',   reference: 'PP-AAA111' });
  const b = dette({ id: 'deux', reference: 'PP-BBB222' });
  const out = matchReceipt(recu(), [a, b]);

  test('ambiguïté : on ne choisit pas à la place du marchand', () => {
    assert.equal(out.decision, 'needs_review');
    assert.equal(out.matchStatus, 'ambiguous');
    assert.equal(out.confidence, 'low');
    assert.equal(out.intentId, null, 'désigner une dette au hasard serait pire que ne rien faire');
  });

  test('les deux candidates sont rendues, pour que l’écran les propose', () => {
    assert.deepEqual(out.candidateIds.sort(), ['deux', 'un']);
  });

  test('la référence déclarée par le client lève l’ambiguïté', () => {
    // Le client a recopié son numéro de transaction en disant « j'ai payé ».
    const bDeclaree = dette({
      id: 'deux',
      reference: 'PP-BBB222',
      declaredReferences: ['mc 8837451'],   // casse et espaces différents : exprès
    });
    const out2 = matchReceipt(recu(), [a, bDeclaree]);

    assert.equal(out2.decision, 'auto_confirm');
    assert.equal(out2.intentId, 'deux');
  });
});

describe('Scénario 8 — le même reçu envoyé dix fois', () => {
  test('dix envois, une seule clé', () => {
    const cles = new Set(
      Array.from({ length: 10 }, () =>
        dedupeKey({
          provider:             'moncash',
          amount:               4500,
          transactionReference: 'MC8837451',
          senderIdentifier:     '+50937123456',
          receivedAt:           PAIEMENT,
        }).key,
      ),
    );
    assert.equal(cles.size, 1);
  });

  test('la clé vient de la référence quand l’opérateur en donne une', () => {
    const k = dedupeKey({
      provider:             'moncash',
      amount:               4500,
      transactionReference: 'MC8837451',
      receivedAt:           PAIEMENT,
    });
    assert.equal(k.basis, 'reference');
    assert.equal(k.key, 'moncash:ref:MC8837451');
  });

  test('la même référence écrite de trois façons donne la même clé', () => {
    const formes = ['MC8837451', 'mc-8837451', 'MC 883 7451'];
    const cles = new Set(
      formes.map((r) => dedupeKey({
        provider: 'moncash', amount: 4500, transactionReference: r, receivedAt: PAIEMENT,
      }).key),
    );
    assert.equal(cles.size, 1, 'une casse différente créait un second encaissement');
  });

  test('sans référence, le repli tient encore les dix envois', () => {
    const cles = new Set(
      Array.from({ length: 10 }, () =>
        dedupeKey({
          provider:         'moncash',
          amount:           4500,
          senderIdentifier: '+509 3712 3456',
          receivedAt:       PAIEMENT,
        }).key,
      ),
    );
    assert.equal(cles.size, 1);
  });

  test('le repli se dit heuristique — il interdit la confirmation automatique', () => {
    const k = dedupeKey({ provider: 'moncash', amount: 4500, receivedAt: PAIEMENT });
    assert.equal(k.basis, 'heuristic');

    const out = matchReceipt(
      recu({ transactionReference: null, dedupeBasis: 'heuristic' }),
      [dette()],
    );
    assert.equal(out.decision, 'needs_review',
      'une clé faillible ne doit pas régler une commande toute seule');
    assert.equal(out.confidence, 'high');
    assert.match(out.reason.fr, /sans numéro de transaction/);
  });

  test('deux montants différents ne partagent pas une clé de repli', () => {
    const a = dedupeKey({ provider: 'moncash', amount: 4500, receivedAt: PAIEMENT }).key;
    const b = dedupeKey({ provider: 'moncash', amount: 4000, receivedAt: PAIEMENT }).key;
    assert.notEqual(a, b);
  });

  test('deux expéditeurs différents non plus', () => {
    const a = dedupeKey({ provider: 'moncash', amount: 4500, senderIdentifier: '37123456', receivedAt: PAIEMENT }).key;
    const b = dedupeKey({ provider: 'moncash', amount: 4500, senderIdentifier: '37999999', receivedAt: PAIEMENT }).key;
    assert.notEqual(a, b);
  });

  test('une référence vide ne devient pas la clé commune de tous les reçus', () => {
    // Le piège : `''` normalisé en `''` aurait donné « moncash:ref: » pour
    // chaque encaissement sans référence, et l'index unique les aurait réduits
    // à un seul par commerce. Un seul paiement par marchand, à vie.
    assert.equal(normalizeTransactionReference(''), null);
    assert.equal(normalizeTransactionReference('   '), null);
    assert.equal(normalizeTransactionReference('---'), null);

    const a = dedupeKey({ provider: 'moncash', amount: 4500, transactionReference: '', receivedAt: PAIEMENT });
    const b = dedupeKey({ provider: 'moncash', amount: 4000, transactionReference: '-', receivedAt: PAIEMENT });
    assert.equal(a.basis, 'heuristic');
    assert.equal(b.basis, 'heuristic');
    assert.notEqual(a.key, b.key);
  });
});

describe('Scénario 9 — deux confirmations simultanées', () => {
  // La sérialisation réelle est le `FOR UPDATE` de `pp_confirm_payment_intent` :
  // elle ne s'exécute pas dans Node. Ce qui se vérifie ici, c'est que la couche
  // applicative ne peut PAS écrire « confirmé » par un autre chemin — et donc
  // qu'il n'existe pas de seconde porte à garder.
  test('aucune transition applicative ne mène à « confirmé »', () => {
    for (const from of OPEN_STATUSES) {
      assert.equal(canTransition(from, 'confirmed'), false,
        `« ${from} » ouvrait une seconde porte vers la confirmation`);
    }
  });

  test('et la tentative est refusée avec un motif lisible', () => {
    const res = assertTransition('under_review', 'confirmed');
    assert.equal(res.ok, false);
    if (!res.ok) assert.match(res.reason, /rapprochement/);
  });

  test('un paiement confirmé ne change plus d’état', () => {
    assert.ok(isTerminal('confirmed'));
    for (const to of ['rejected', 'cancelled', 'under_review', 'partially_paid'] as const) {
      const res = assertTransition('confirmed', to);
      assert.equal(res.ok, false, `confirmé → ${to} devrait être refusé`);
    }
  });

  test('le même état demandé deux fois est accepté sans rien faire', () => {
    // Le double clic, la requête rejouée. Le refuser ferait échouer un geste
    // inoffensif et afficherait une erreur au marchand pour rien.
    assert.equal(assertTransition('under_review', 'under_review').ok, true);
    assert.equal(assertTransition('confirmed', 'confirmed').ok, true);
  });
});

describe('Scénario 10 — une entreprise n’atteint pas les paiements d’une autre', () => {
  // L'isolation vit dans la RLS (`is_business_member`) et dans la vérification
  // explicite de `pp_confirm_payment_intent`, qui compare `business_id` du reçu
  // et de la dette parce qu'elle tourne en SECURITY DEFINER, donc sans RLS.
  // Ni l'une ni l'autre ne s'exécute dans Node : voir supabase/migrations/
  // 20260927_payment_bridge.sql et son bloc de vérification.
  //
  // Ce que le moteur garantit, lui : il ne rapproche que ce qu'on lui donne. Il
  // n'a aucun moyen d'aller chercher une dette ailleurs — pas de base, pas de
  // réseau. C'est la propriété qui rend la garde SQL suffisante.
  test('le moteur ne retient jamais une dette absente de ses candidates', () => {
    const out = matchReceipt(recu(), []);
    assert.equal(out.intentId, null);
    assert.deepEqual(out.candidateIds, []);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Ce que les dix scénarios ne disaient pas
// ═══════════════════════════════════════════════════════════════════════════

describe('le reste dû, quand une dette a déjà reçu', () => {
  test('le second versement se compare au RESTE, pas au total', () => {
    // 4 000 déjà reçus sur 4 500. Le client envoie les 500 manquants : c'est un
    // montant exact, pas une anomalie de 4 000 gourdes.
    const partielle = dette({ status: 'partially_paid', amountReceived: 4000 });
    const out = matchReceipt(recu({ amount: 500 }), [partielle]);

    assert.equal(out.decision, 'auto_confirm');
    assert.equal(out.applyAmount, 500);
    assert.equal(out.difference, 0);
  });

  test('et le montant total, lui, devient un trop-perçu', () => {
    const partielle = dette({ status: 'partially_paid', amountReceived: 4000 });
    const out = matchReceipt(recu({ amount: 4500 }), [partielle]);

    assert.equal(out.matchStatus, 'overpayment');
    assert.equal(out.difference, 4000);
  });

  test('la dette d’origine cède la place à sa complémentaire : pas de fausse ambiguïté', () => {
    // Après 4 000 sur 4 500, la confirmation ouvre une dette complémentaire de
    // 500 rattachée à l'origine. Les deux attendent 500 : sans le lien de
    // parenté, le versement du reste aurait deux candidates.
    const origine = dette({ status: 'partially_paid', amountReceived: 4000 });
    const reste = dette({
      id:             'aaaaaaaa-0000-4000-8000-000000000009',
      reference:      'PP-R3ST3X',
      chargeAmount:   500,
      status:         'created',
      parentIntentId: origine.id,
    });
    const out = matchReceipt(recu({ amount: 500 }), [origine, reste]);

    assert.equal(out.decision, 'auto_confirm');
    assert.equal(out.intentId, reste.id);
  });

  test('une complémentaire close ne masque plus sa dette d’origine', () => {
    const origine = dette({ status: 'partially_paid', amountReceived: 4000 });
    const reste = dette({
      id: 'aaaaaaaa-0000-4000-8000-000000000009', chargeAmount: 500,
      status: 'cancelled', parentIntentId: origine.id,
    });
    const out = matchReceipt(recu({ amount: 500 }), [origine, reste]);

    assert.equal(out.intentId, origine.id);
  });
});

describe('l’opérateur et la devise ne se négocient pas', () => {
  test('un SMS MonCash ne règle pas une commande NatCash', () => {
    const out = matchReceipt(recu({ provider: 'natcash' }), [dette({ method: 'moncash' })]);
    assert.equal(out.decision, 'unmatched');
  });

  test('un versement en gourdes ne règle pas une dette libellée en dollars', () => {
    // C'est tout l'objet de `charge_amount` : une commande de 25 USD demande
    // 3 250 G, pas 25. Comparer 3 250 à 25 aurait fait une anomalie de montant
    // sur un paiement parfaitement juste.
    const enUsd = dette({ chargeCurrency: 'USD', chargeAmount: 25 });
    const out = matchReceipt(recu({ amount: 3250 }), [enUsd]);
    assert.equal(out.decision, 'unmatched');
  });

  test('un virement bancaire ne règle pas un paiement mobile', () => {
    const out = matchReceipt(recu({ provider: 'bank' }), [dette({ method: 'moncash' })]);
    assert.equal(out.decision, 'unmatched');
  });
});

describe('la fenêtre de temps', () => {
  test('dans la fenêtre : confirmé', () => {
    const dedans = new Date(Date.parse(COMMANDE) + (MATCH_WINDOW_MINUTES - 1) * 60_000);
    // Sans échéance de session, seule la fenêtre compte.
    const out = matchReceipt(
      recu({ receivedAt: dedans.toISOString() }),
      [dette({ sessionExpiresAt: null })],
    );
    assert.equal(out.decision, 'auto_confirm');
  });

  test('au-delà : proposé, jamais confirmé seul', () => {
    const dehors = new Date(Date.parse(COMMANDE) + (MATCH_WINDOW_MINUTES + 1) * 60_000);
    const out = matchReceipt(
      recu({ receivedAt: dehors.toISOString() }),
      [dette({ sessionExpiresAt: null })],
    );
    assert.equal(out.decision, 'needs_review');
    assert.match(out.reason.fr, /bien après la commande/);
  });

  test('la fenêtre est plus large que la session, et c’est voulu', () => {
    // Un client va chercher son téléphone, perd le réseau, revient. Caler la
    // fenêtre sur les 15 minutes de la session aurait envoyé en examen manuel la
    // majorité des paiements honnêtes.
    assert.ok(MATCH_WINDOW_MINUTES > SESSION_MINUTES);
  });

  test('une date illisible ne confirme rien', () => {
    const out = matchReceipt(recu({ receivedAt: 'pas une date' }), [dette()]);
    assert.equal(out.decision, 'needs_review');
  });
});

describe('les états ouverts', () => {
  test('une dette confirmée, annulée ou refusée n’est plus candidate', () => {
    for (const s of ['confirmed', 'cancelled', 'rejected'] as const) {
      assert.equal(isOpen(s), false, `« ${s} » ne devrait plus attendre de paiement`);
    }
  });

  test('une dette expirée se rouvre — elle n’est pas éteinte', () => {
    // Quinze minutes ferment un écran, pas un dû.
    assert.equal(canTransition('expired', 'awaiting_payment'), true);
    assert.equal(isTerminal('expired'), false);
  });

  test('un refus se conteste : c’est le seul recours du client', () => {
    assert.equal(canTransition('rejected', 'disputed'), true);
  });

  test('une dette partiellement payée ne retourne pas « en attente »', () => {
    // L'argent déjà reçu ne se dés-reçoit pas.
    assert.equal(canTransition('partially_paid', 'awaiting_payment'), false);
  });
});

describe('les numéros, normalisés', () => {
  test('avec ou sans indicatif, c’est le même client', () => {
    const attendu = '37123456';
    for (const forme of ['+509 3712 3456', '50937123456', '037123456', '3712-3456']) {
      assert.equal(normalizeSender(forme), attendu, `« ${forme} » n’a pas été reconnu`);
    }
  });

  test('un numéro absent ne devient pas une chaîne vide', () => {
    assert.equal(normalizeSender(null), null);
    assert.equal(normalizeSender(''), null);
    assert.equal(normalizeSender('   '), null);
  });
});
