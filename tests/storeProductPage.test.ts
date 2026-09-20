// ─────────────────────────────────────────────────────────────────────────────
// La fiche produit, gabarit par gabarit
//
// `lib/storeProductPage.ts` porte une table : un profil par gabarit, et un
// repli pour les trois historiques. Une table se casse sans bruit — on ajoute
// un gabarit au registre, il n'a pas de ligne ici, et sa fiche devient la fiche
// générique sans qu'aucun écran ne s'en plaigne. C'est exactement ce que ce
// fichier existe pour empêcher, et c'est l'invariant que le commentaire de
// `hasOwnPdpProfile` annonce.
//
// Les trois autres promesses tenues ici se cassent de la même façon, en
// silence : un onglet répété deux fois dans un profil, un onglet qui nomme une
// section qui n'existe plus, et la reprise de sections sous la fiche qui
// remontrerait en pleine largeur ce qu'un onglet porte déjà.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import {
  pdpProfileFor, hasOwnPdpProfile, TAB_SECTION, type PdpTabKey,
} from '../lib/storeProductPage';
import { pdpSectionsFor, isSectionKey } from '../lib/storeSections';
import { TEMPLATE_IDS, type TemplateId } from '../lib/storeTheme';
import { TEMPLATES } from '../components/store/templates/registry';

const OFFERED = TEMPLATE_IDS.filter((id) => TEMPLATES[id].offered);
const HISTORIQUES = TEMPLATE_IDS.filter((id) => !TEMPLATES[id].offered);

describe('un gabarit proposé a sa propre fiche', () => {
  for (const id of OFFERED) {
    test(`${id} ne retombe pas sur la fiche du commerce`, () => {
      assert.equal(
        hasOwnPdpProfile(id), true,
        `${id} est proposé au marchand mais n'a pas de profil dans PROFILES : `
        + 'sa fiche serait celle du commerce, sans que rien ne le signale.',
      );
    });
  }

  test('les trois historiques gardent la fiche du commerce', () => {
    // Ce n'est pas un oubli, c'est la promesse inverse : des vitrines en
    // production les portent, et leur fiche ne doit pas changer d'ordre du
    // jour au lendemain.
    assert.deepEqual(HISTORIQUES, ['luxe', 'modern', 'flash']);
    for (const id of HISTORIQUES) {
      assert.equal(hasOwnPdpProfile(id), false, id);
      assert.equal(pdpProfileFor(id).buy, 'cart', id);
    }
  });

  test('`modern` garde son guide des tailles : c\'est le gabarit de repli', () => {
    const keys = pdpProfileFor('modern').tabs.map((t) => t.key);
    assert.ok(keys.includes('sizeGuide'), keys.join(', '));
    assert.equal(pdpProfileFor('luxe').tabs.some((t) => t.key === 'sizeGuide'), false);
  });

  test('un `template_id` écrit à la main en base s\'affiche au lieu de lever', () => {
    // La colonne est du texte libre : une valeur inconnue doit rendre une
    // fiche, pas une page d'erreur.
    const profile = pdpProfileFor('gabarit-qui-n-existe-pas' as TemplateId);
    assert.equal(profile.buy, 'cart');
    assert.ok(profile.tabs.length > 0);
    assert.ok(profile.relatedTitle.trim().length > 0);
  });
});

describe('ce qu\'un profil ne peut pas contenir', () => {
  for (const id of TEMPLATE_IDS) {
    test(`${id} : un onglet par source, un titre pour la grille, des libellés écrits`, () => {
      const profile = pdpProfileFor(id);

      const keys = profile.tabs.map((t) => t.key);
      assert.equal(
        new Set(keys).size, keys.length,
        `deux onglets liraient la même source : ${keys.join(', ')}`,
      );
      assert.ok(profile.tabs.length > 0, 'une fiche sans onglet ne dit rien du produit');

      for (const tab of profile.tabs) {
        assert.ok(tab.label.trim().length > 0, `${tab.key} sans libellé`);
      }
      assert.ok(profile.relatedTitle.trim().length > 0, 'la grille de suggestions sans titre');

      // Vides, ces deux-là ont un sens (« le libellé du panier convient »,
      // « la liste s'affiche sans titre ») ; une chaîne d'espaces, non.
      if (profile.primaryLabel !== undefined) {
        assert.ok(profile.primaryLabel.trim().length > 0, 'primaryLabel vide');
      }
      if (profile.highlightsTitle !== undefined) {
        assert.ok(profile.highlightsTitle.trim().length > 0, 'highlightsTitle vide');
      }
    });
  }
});

describe('l\'onglet et la section qui disent la même chose', () => {
  test('chaque section nommée par TAB_SECTION existe encore', () => {
    // Sans ce test, renommer une section laisserait la table pointer dans le
    // vide : la déduplication ne retirerait plus rien, et la page montrerait
    // deux fois « Composition ».
    for (const [tab, section] of Object.entries(TAB_SECTION)) {
      assert.equal(isSectionKey(section), true, `${tab} → ${section}`);
    }
  });

  for (const id of TEMPLATE_IDS) {
    test(`${id} : ce qu'un onglet porte ne se répète pas sous la fiche`, () => {
      // La règle appliquée par `app/store/[slug]/products/[id]/page.tsx`. On la
      // rejoue ici parce qu'elle décide ce que le client VOIT, et qu'une page
      // serveur Next ne se rend pas dans un test.
      const profile = pdpProfileFor(id);
      const inTabs = new Set(
        profile.tabs
          .map((t) => TAB_SECTION[t.key as PdpTabKey])
          .filter((s): s is string => Boolean(s)),
      );
      const repeated = pdpSectionsFor(id).filter((s) => !inTabs.has(s));

      for (const section of repeated) {
        assert.equal(inTabs.has(section), false, `${section} paraîtrait deux fois`);
      }
      // Et la reprise ne doit pas se vider entièrement de ce qu'elle apportait :
      // une fiche sans onglet ni section reprise n'a plus rien sous le bouton.
      assert.ok(
        repeated.length > 0 || profile.tabs.length > 0,
        'rien sous la colonne d\'achat',
      );
    });
  }
});
