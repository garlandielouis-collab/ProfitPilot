// ─────────────────────────────────────────────────────────────────────────────
// Ce que Pilot AI propose, et où il se montre
//
// Deux choses se cassent en silence dans ce genre de table, et aucune des deux
// ne fait échouer un build :
//
//   · une adresse profonde qui retombe sur le repli — le marchand ouvre la
//     bulle depuis la fiche d'un produit et reçoit « Dites-moi ce que vous
//     cherchez », c'est-à-dire un chatbot ;
//   · la bulle qui se montre là où elle n'a rien à faire : la vitrine d'un
//     marchand, la page de connexion, la conversation plein écran.
//
// Ces tests tiennent les deux.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_PILOT_ROUTE,
  EXPIRED_PILOT_ROUTE,
  isPilotSurface,
  pilotRouteFor,
} from '../lib/pilotContext';

describe('pilotRouteFor — le copilote sait où il est', () => {
  test('un écran connu donne sa propre capsule', () => {
    assert.equal(pilotRouteFor('/dashboard').key, 'dashboard');
    assert.equal(pilotRouteFor('/inventory').key, 'inventory');
    assert.equal(pilotRouteFor('/sales').key,     'sales');
  });

  test('le préfixe le plus long gagne — /rapports/comptabilite n’est pas /rapports', () => {
    assert.equal(pilotRouteFor('/rapports').key,               'rapports');
    assert.equal(pilotRouteFor('/rapports/comptabilite').key,  'comptabilite');
  });

  test('une adresse profonde hérite de son parent sans être écrite', () => {
    // La fiche d'un produit, le détail d'un document : ce sont des centaines
    // d'adresses qu'on ne peut pas énumérer.
    assert.equal(pilotRouteFor('/products/42').key,           'products');
    assert.equal(pilotRouteFor('/documents/7/apercu').key,    'documents');
    assert.equal(pilotRouteFor('/customers/abc-123').key,     'customers');
  });

  test('un écran hors périmètre retombe sur le repli, qui ne promet rien', () => {
    // Réglages, rôles, sécurité : l'assistant ne reçoit aucune donnée là-dessus.
    // Une question toute faite y recevrait une réponse inventée.
    assert.equal(pilotRouteFor('/settings').key, DEFAULT_PILOT_ROUTE.key);
    assert.equal(pilotRouteFor('/roles').key,    DEFAULT_PILOT_ROUTE.key);
    assert.equal(pilotRouteFor('/security').key, DEFAULT_PILOT_ROUTE.key);
  });

  test('une adresse absente ou vide ne lève pas', () => {
    assert.equal(pilotRouteFor(null).key,      DEFAULT_PILOT_ROUTE.key);
    assert.equal(pilotRouteFor(undefined).key, DEFAULT_PILOT_ROUTE.key);
    assert.equal(pilotRouteFor('').key,        DEFAULT_PILOT_ROUTE.key);
  });

  test('une adresse sans barre oblique de tête est acceptée', () => {
    assert.equal(pilotRouteFor('dashboard').key, 'dashboard');
  });

  test('/dashboards ne prend pas la capsule de /dashboard', () => {
    // Le préfixe se compare sur un segment entier, pas sur des caractères :
    // sinon une future page « /salesforce » hériterait des ventes.
    assert.equal(pilotRouteFor('/dashboards').key, DEFAULT_PILOT_ROUTE.key);
    assert.equal(pilotRouteFor('/salesforce').key, DEFAULT_PILOT_ROUTE.key);
  });
});

describe('les capsules tiennent leurs promesses', () => {
  const routes = [
    '/dashboard', '/products', '/inventory', '/sales', '/purchases', '/expenses',
    '/rapports', '/rapports/comptabilite', '/rentabilite', '/analytics',
    '/creances', '/dettes', '/customers', '/suppliers', '/boutique',
    '/documents', '/plus',
  ];

  test('chaque écran a une capsule courte et au moins deux questions', () => {
    for (const path of routes) {
      const route = pilotRouteFor(path);
      assert.notEqual(route.key, DEFAULT_PILOT_ROUTE.key, `${path} devrait avoir sa propre entrée`);
      assert.ok(route.capsule.length > 0, `${path} : capsule vide`);
      // 120 caractères : au-delà, la capsule de 230 px de large dépasse deux
      // lignes et se fait fermer avant d'être lue.
      assert.ok(route.capsule.length <= 120, `${path} : capsule trop longue (${route.capsule.length})`);
      assert.ok(route.prompts.length >= 2, `${path} : moins de deux questions proposées`);
      assert.ok(route.prompts.length <= 3, `${path} : plus de trois questions, choisir coûte plus que taper`);
    }
  });

  test('aucune question proposée n’est vide, et aucune ne se répète', () => {
    for (const path of routes) {
      const { prompts } = pilotRouteFor(path);
      for (const prompt of prompts) assert.ok(prompt.trim().length > 0, `${path} : question vide`);
      assert.equal(new Set(prompts).size, prompts.length, `${path} : deux fois la même question`);
    }
  });

  test('chaque clé est unique — c’est elle qui mémorise le « déjà montré »', () => {
    const keys = routes.map((p) => pilotRouteFor(p).key);
    assert.equal(new Set(keys).size, keys.length);
  });

  test('l’essai terminé passe avant l’écran, et mène aux abonnements', () => {
    assert.equal(EXPIRED_PILOT_ROUTE.next?.href, '/pricing');
    assert.equal(EXPIRED_PILOT_ROUTE.prompts.length, 0);
  });
});

describe('isPilotSurface — où la bulle se montre', () => {
  test('elle se montre sur les écrans de travail', () => {
    assert.equal(isPilotSurface('/dashboard'),  true);
    assert.equal(isPilotSurface('/products/9'), true);
    assert.equal(isPilotSurface('/settings'),   true);
  });

  test('jamais au-dessus de la conversation plein écran', () => {
    // Une bulle qui propose d'ouvrir ce qui est déjà ouvert.
    assert.equal(isPilotSurface('/ai-assistant'), false);
  });

  test('jamais sur la vitrine d’un marchand ni sur un aperçu de gabarit', () => {
    // Ce sont les pages de SES clients : un assistant de gestion n'y a rien à
    // faire, et il révélerait que la boutique tourne sur ProfitPilot.
    assert.equal(isPilotSurface('/store/chez-marie'), false);
    assert.equal(isPilotSurface('/apercu/modern'),    false);
  });

  test('jamais sur les pages publiques, ni avant la connexion', () => {
    assert.equal(isPilotSurface('/'),              false);
    assert.equal(isPilotSurface('/auth/login'),    false);
    assert.equal(isPilotSurface('/pricing'),       false);
    assert.equal(isPilotSurface('/checkout'),      false);
    assert.equal(isPilotSurface('/onboarding'),    false);
    assert.equal(isPilotSurface('/blog/un-article'), false);
  });

  test('une adresse absente ne montre rien', () => {
    assert.equal(isPilotSurface(null),      false);
    assert.equal(isPilotSurface(undefined), false);
  });
});
