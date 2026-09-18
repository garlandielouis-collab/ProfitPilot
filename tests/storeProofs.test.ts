// ─────────────────────────────────────────────────────────────────────────────
// La bande de preuves : ce qu'elle montre, et dans quel ordre
//
// Deux choses se cassent sans bruit ici. L'ordre — si les engagements repassent
// devant les références, la bande recommence à ne montrer que des promesses,
// et personne ne le verra puisqu'elle s'affiche quand même. Et le vide — une
// bande qui se rend avec zéro élément laisse un trait et 32 px de fond sous la
// bannière, ce qui ressemble à un bug d'affichage.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { proofStripItems, paymentBrand } from '../lib/storeProofs';
import { themeConfigSchema } from '../lib/storeTheme';
import type { ThemeConfig } from '../lib/storeTheme';

/**
 * Un thème complet à partir de ce qu'on veut éprouver.
 *
 * Le SCHÉMA, et non `parseThemeConfig` : celui-ci pose par-dessus le contenu
 * par défaut du gabarit, qui remplit lui-même « Ils nous font confiance » avec
 * MonCash, NatCash, Visa et Mastercard. Un test qui passerait par là
 * n'éprouverait plus sa propre entrée, mais ce préréglage.
 */
function theme(partial: Record<string, unknown>): ThemeConfig {
  return themeConfigSchema.parse(partial);
}

const PARTNERS = {
  enabled: true,
  items: [
    { name: 'Digicel',     logoUrl: 'https://example.com/digicel.png' },
    { name: 'Caribbean Supply', logoUrl: null },
  ],
};

const STATS = {
  enabled: true,
  items: [
    { value: '1 200', label: 'Commandes livrées', note: 'Depuis 2024' },
    { value: '4,8/5', label: 'Note moyenne',      note: '' },
  ],
};

const TRUST = {
  enabled: true,
  badges: [
    { icon: 'truck', label: 'Livraison rapide',  note: 'Port-au-Prince et régions' },
    { icon: 'card',  label: 'MonCash & NatCash', note: 'Ou à la livraison' },
  ],
};

describe('proofStripItems — la preuve passe avant la promesse', () => {
  test('les partenaires viennent en premier, les engagements en dernier', () => {
    const items = proofStripItems(theme({ partners: PARTNERS, stats: STATS, trust: TRUST }));
    assert.deepEqual(items.map((i) => i.kind), [
      'partner', 'partner', 'stat', 'stat', 'trust', 'trust',
    ]);
  });

  test('un partenaire garde son logo, et son nom sert de texte de remplacement', () => {
    const [first, second] = proofStripItems(theme({ partners: PARTNERS }));
    assert.equal(first.label,   'Digicel');
    assert.equal(first.logoUrl, 'https://example.com/digicel.png');
    // Sans logo, le nom EST la preuve : la référence reste dans la bande.
    assert.equal(second.label,   'Caribbean Supply');
    assert.equal(second.logoUrl, null);
  });

  test('un chiffre porte sa valeur, et son libellé passe en dessous', () => {
    // « 1 200 » d'abord, « commandes livrées » ensuite : l'inverse enterre la
    // seule chose qui se retienne.
    const [stat] = proofStripItems(theme({ stats: STATS }));
    assert.equal(stat.label, '1 200');
    assert.equal(stat.note,  'Commandes livrées');
  });

  test('un engagement garde son icône et sa précision', () => {
    const [badge] = proofStripItems(theme({ trust: TRUST }));
    assert.equal(badge.label, 'Livraison rapide');
    assert.equal(badge.note,  'Port-au-Prince et régions');
    assert.equal(badge.icon,  'truck');
  });

  test('une note vide ne devient pas une ligne vide', () => {
    const items = proofStripItems(theme({ stats: STATS, trust: {
      enabled: true, badges: [{ icon: 'shield', label: 'Retours acceptés', note: '' }],
    } }));
    const badge = items.find((i) => i.kind === 'trust');
    assert.equal(badge?.note, undefined);
  });
});

describe('proofStripItems — ce qui n’y entre pas', () => {
  test('une vitrine qui n’a rien saisi n’a pas de bande', () => {
    // Le composant rend `null` sur une liste vide : la bannière est alors
    // suivie directement des produits, plutôt que d'un trait et d'un fond.
    const items = proofStripItems(theme({
      partners: { enabled: false, items: [] },
      stats:    { enabled: false, items: [] },
      trust:    { enabled: false, badges: [] },
    }));
    assert.equal(items.length, 0);
  });

  test('une famille désactivée disparaît, même si elle a du contenu', () => {
    const items = proofStripItems(theme({
      partners: { ...PARTNERS, enabled: false },
      trust:    TRUST,
    }));
    assert.equal(items.some((i) => i.kind === 'partner'), false);
    assert.equal(items.filter((i) => i.kind === 'trust').length, 2);
  });

  test('un nom ou un chiffre vide est sauté, pas rendu à blanc', () => {
    const items = proofStripItems(theme({
      partners: { enabled: true, items: [{ name: '   ', logoUrl: null }, { name: 'Unibank', logoUrl: null }] },
      stats:    { enabled: true, items: [{ value: '', label: 'Sans valeur', note: '' },
                                         { value: '9', label: '', note: '' }] },
    }));
    assert.deepEqual(items.map((i) => i.label), ['Unibank']);
  });

  test('la bande s’arrête à dix, et ce sont les engagements qui tombent', () => {
    // Un marchand très fourni perd ses promesses, jamais ses références.
    const items = proofStripItems(theme({
      partners: { enabled: true, items: Array.from({ length: 8 }, (_, i) => ({ name: `Marque ${i}`, logoUrl: null })) },
      stats:    { enabled: true, items: Array.from({ length: 4 }, (_, i) => ({ value: `${i}`, label: `Chiffre ${i}`, note: '' })) },
      trust:    TRUST,
    }));
    assert.equal(items.length, 10);
    assert.equal(items.filter((i) => i.kind === 'partner').length, 8);
    assert.equal(items.filter((i) => i.kind === 'stat').length,    2);
    assert.equal(items.some((i) => i.kind === 'trust'), false);
  });

  test('un engagement qui répète une marque déjà montrée tombe', () => {
    // Le préréglage des gabarits met MonCash et NatCash dans les références ET
    // un badge « MonCash & NatCash » dans les engagements. Sans cette règle, la
    // bande dirait trois fois MonCash en six pastilles.
    const items = proofStripItems(theme({
      partners: { enabled: true, items: [{ name: 'MonCash', logoUrl: null }, { name: 'NatCash', logoUrl: null }] },
      trust:    TRUST,
    }));
    assert.deepEqual(items.map((i) => i.label), ['MonCash', 'NatCash', 'Livraison rapide']);
  });

  test('une marque ne se reconnaît pas au milieu d’un autre mot', () => {
    // « Visa » vit dans « devis » : comparer des lettres plutôt que des mots
    // aurait fait disparaître cet engagement sans que personne ne comprenne.
    const items = proofStripItems(theme({
      partners: { enabled: true, items: [{ name: 'Visa', logoUrl: null }] },
      trust:    { enabled: true, badges: [{ icon: 'clock', label: 'Devis à la demande', note: '' }] },
    }));
    assert.deepEqual(items.map((i) => i.label), ['Visa', 'Devis à la demande']);
  });

  test('chaque clé est unique, y compris entre deux entrées homonymes', () => {
    const items = proofStripItems(theme({
      partners: { enabled: true, items: [{ name: 'Digicel', logoUrl: null }, { name: 'Digicel', logoUrl: null }] },
    }));
    assert.equal(new Set(items.map((i) => i.key)).size, items.length);
  });
});

describe('paymentBrand — les marques que la bande sait dessiner', () => {
  test('la casse, l’espace et le tiret ne changent pas la marque', () => {
    assert.equal(paymentBrand('MonCash'),     'moncash');
    assert.equal(paymentBrand('Mon Cash'),    'moncash');
    assert.equal(paymentBrand('NATCASH'),     'natcash');
    assert.equal(paymentBrand('Master-Card'), 'mastercard');
    assert.equal(paymentBrand('visa'),        'visa');
  });

  test('un nom qui CONTIENT une marque n’est pas cette marque', () => {
    // Dessiner le monogramme Visa sur « Boutique Visa » ferait passer une
    // boutique pour un partenaire de paiement.
    assert.equal(paymentBrand('Boutique Visa'), null);
    assert.equal(paymentBrand('Visa Premium'),  null);
    assert.equal(paymentBrand('Digicel'),       null);
  });

  test('un partenaire avec son propre logo garde son image, pas notre dessin', () => {
    const items = proofStripItems(theme({ partners: { enabled: true, items: [
      { name: 'Visa',    logoUrl: 'https://example.com/visa.png' },
      { name: 'MonCash', logoUrl: null },
    ] } }));
    assert.equal(items[0].brand, undefined);
    assert.equal(items[1].brand, 'moncash');
  });
});
