// ─────────────────────────────────────────────────────────────────────────────
// Les trois blocs ajoutés à la fiche produit, d'après les maquettes
//
// Chacun tient sur une règle qui se casse en silence :
//
//   les tuiles      le gabarit qui les pose ne doit PAS garder son onglet
//                   « Caractéristiques ». La même donnée deux fois sur une
//                   page fait douter de la deuxième, et rien ne le signale.
//   l'avis du rail  il n'y monte que s'il a un texte et une bonne note. Un
//                   avis à deux étoiles posé dans un bloc de réassurance se
//                   lit comme le meilleur qu'on ait trouvé.
//   le co-achat     il vient d'un fait, pas d'un rayon. C'est ce qui lui donne
//                   le droit de porter un bouton d'ajout — et c'est pourquoi
//                   il ne se remplit pas avec la catégorie quand il est vide.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { specIconFor, specRows } from '../lib/storeSpecs';
import { pickRailReview, RAIL_REVIEW_MIN_RATING } from '../lib/storeReviewPick';
import { pdpProfileFor } from '../lib/storeProductPage';
import { TEMPLATE_IDS } from '../lib/storeTheme';

// ── Les tuiles de caractéristiques ──────────────────────────────────────────

describe('specIconFor — le pictogramme suit le mot du marchand', () => {
  test('reconnaît les intitulés du rayon technique', () => {
    assert.equal(specIconFor('Écran'), 'screen');
    assert.equal(specIconFor('Processeur'), 'chip');
    assert.equal(specIconFor('Mémoire vive'), 'memory');
    assert.equal(specIconFor('Stockage'), 'storage');
    assert.equal(specIconFor('Appareil photo'), 'camera');
    assert.equal(specIconFor('Batterie'), 'battery');
  });

  test('le mot qui qualifie l’emporte sur celui qui précède', () => {
    // « Mémoire de stockage » parle de stockage : c'est le dernier mot qui
    // dit de quoi il s'agit, et la règle du stockage passe donc avant.
    assert.equal(specIconFor('Mémoire de stockage'), 'storage');
  });

  test('sans accent et en majuscules, c’est le même mot', () => {
    // Un marchand tape « ECRAN » depuis un téléphone sans accents.
    assert.equal(specIconFor('ECRAN'), 'screen');
    assert.equal(specIconFor('memoire'), 'memory');
  });

  test('un intitulé inconnu n’est pas approximé', () => {
    // Une icône fausse coûte plus cher qu'une icône neutre : elle annonce une
    // caractéristique que la tuile ne porte pas.
    assert.equal(specIconFor('Indice de protection'), 'other');
    assert.equal(specIconFor(''), 'other');
  });
});

describe('specRows — rien n’est ajouté, rien n’est réordonné', () => {
  test('garde l’ordre de saisie du marchand', () => {
    const rows = specRows({ Écran: '6,1 pouces', Batterie: '3 200 mAh', Poids: '187 g' });
    assert.deepEqual(rows.map((r) => r.label), ['Écran', 'Batterie', 'Poids']);
  });

  test('une valeur vide disparaît plutôt que de faire croire à un oubli', () => {
    const rows = specRows({ Écran: '6,1 pouces', Garantie: '   ', Poids: '187 g' });
    assert.deepEqual(rows.map((r) => r.label), ['Écran', 'Poids']);
  });

  test('aucune fiche sans attributs ne produit de tuile', () => {
    assert.deepEqual(specRows(null), []);
    assert.deepEqual(specRows(undefined), []);
    assert.deepEqual(specRows({}), []);
  });
});

describe('un gabarit qui pose les tuiles n’a pas l’onglet qui les redit', () => {
  for (const id of TEMPLATE_IDS) {
    const profile = pdpProfileFor(id);
    if (!profile.specGrid) continue;
    test(`${id} : la bande remplace l’onglet « Caractéristiques »`, () => {
      assert.equal(
        profile.tabs.some((t) => t.key === 'attributes'), false,
        `${id} pose la bande de tuiles ET garde un onglet d'attributs : `
        + 'les mêmes caractéristiques paraîtraient deux fois sur la page.',
      );
    });
  }

  test('au moins un gabarit la pose — sinon le bloc est mort', () => {
    const posent = TEMPLATE_IDS.filter((id) => pdpProfileFor(id).specGrid);
    assert.ok(posent.length > 0, 'aucun profil ne demande la bande de tuiles');
  });
});

// ── L'avis du rail ──────────────────────────────────────────────────────────

const avis = (over: Partial<{ id: string; author_name: string; rating: number; body: string | null; created_at: string }>) => ({
  id:          'a',
  author_name: 'Marie L.',
  rating:      5,
  body:        'Livraison rapide et produit conforme.',
  created_at:  '2026-09-01T00:00:00.000Z',
  ...over,
});

describe('pickRailReview — un seul avis, et le bon', () => {
  test('sans avis, le rail s’en tient aux engagements', () => {
    assert.equal(pickRailReview([]), null);
  });

  test('une note sans texte ne monte pas : les étoiles sont déjà sous le titre', () => {
    assert.equal(pickRailReview([avis({ body: null }), avis({ id: 'b', body: '  ' })]), null);
  });

  test('un avis tiède ne sert pas de réassurance', () => {
    const tiede = avis({ rating: RAIL_REVIEW_MIN_RATING - 1 });
    assert.equal(pickRailReview([tiede]), null);
  });

  test('la meilleure note passe devant', () => {
    const quatre = avis({ id: 'quatre', rating: 4 });
    const cinq   = avis({ id: 'cinq',   rating: 5 });
    assert.equal(pickRailReview([quatre, cinq])?.id, 'cinq');
  });

  test('à note égale, celui qui tient dans le rail passe devant le fleuve', () => {
    const fleuve = avis({ id: 'fleuve', body: 'x'.repeat(600), created_at: '2026-09-10T00:00:00.000Z' });
    const court  = avis({ id: 'court',  body: 'Parfait, je recommande.', created_at: '2026-09-02T00:00:00.000Z' });
    assert.equal(pickRailReview([fleuve, court])?.id, 'court');
  });

  test('à note et longueur comparables, le plus récent parle de la boutique d’aujourd’hui', () => {
    const vieux  = avis({ id: 'vieux',  created_at: '2026-01-05T00:00:00.000Z' });
    const recent = avis({ id: 'recent', created_at: '2026-09-15T00:00:00.000Z' });
    assert.equal(pickRailReview([vieux, recent])?.id, 'recent');
  });

  test('la liste reçue n’est pas réordonnée sur place', () => {
    // L'onglet « Avis » lit la MÊME liste, dans l'ordre du serveur : un tri en
    // place y remonterait silencieusement le plus élogieux.
    const liste = [avis({ id: 'a', rating: 4 }), avis({ id: 'b', rating: 5 })];
    pickRailReview(liste);
    assert.deepEqual(liste.map((r) => r.id), ['a', 'b']);
  });
});
