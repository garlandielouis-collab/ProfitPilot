import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { parseThemeConfig, type ThemeConfig } from '../lib/storeTheme';
import {
  INFO_PAGES, infoPageBySlug, infoPagesFor, type StorefrontLike,
} from '../lib/storefrontPages';
import { resolveTemplateId, templateChoices } from '../components/store/templates/registry';
import { infoPageSections } from '../lib/storefrontPages';

// ─────────────────────────────────────────────────────────────────────────────
// Les pages internes d'une vitrine
//
// Ce que ces tests tiennent : une page n'existe que si le marchand en a la
// matière. C'est la même promesse des deux côtés — le pied de page ne propose
// pas un lien mort, et l'adresse rend 404 plutôt qu'une page blanche.
//
// Les prédicats de `storefrontPages.ts` recopient la garde de chaque section,
// parce qu'on ne peut pas décider d'ouvrir une adresse en rendant un composant
// React. Cette duplication est le seul endroit fragile du mécanisme : si
// quelqu'un change la garde d'une section sans revenir ici, un lien mènera à
// une page vide. Chaque cas ci-dessous nomme donc la garde qu'il reflète.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Un thème sans une ligne de contenu.
 *
 * `parseThemeConfig` POSE le contenu par défaut du gabarit là où le marchand
 * n'a rien écrit — c'est voulu, et c'est pour cela qu'une vitrine neuve a déjà
 * une FAQ et une histoire sur sa page d'accueil. On éteint donc explicitement
 * chaque bloc : sans cela, ces tests mesureraient les textes du préréglage, pas
 * la règle.
 */
function themeVide(): ThemeConfig {
  const t = parseThemeConfig({});
  return {
    ...t,
    brandStory:   { ...t.brandStory,   enabled: false, body: '' },
    presentation: { ...t.presentation, enabled: false, intro: '', items: [] },
    process:      { ...t.process,      enabled: false, steps: [] },
    ingredients:  { ...t.ingredients,  enabled: false, body: '', items: [] },
    team:         { ...t.team,         enabled: false, members: [] },
    gallery:      { ...t.gallery,      enabled: false, images: [] },
    stats:        { ...t.stats,        enabled: false, items: [] },
    partners:     { ...t.partners,     enabled: false, items: [] },
    journal:      { ...t.journal,      enabled: false, items: [] },
    faq:          { ...t.faq,          enabled: false, items: [] },
    shipping:     { ...t.shipping,     enabled: false, note: '', returns: '' },
    payments:     { ...t.payments,     enabled: false, note: '' },
    sizeGuide:    { ...t.sizeGuide,    enabled: false, columns: '', rows: [] },
    contact:      { ...t.contact,      enabled: false, body: '', hours: [] },
    socialProof:  { ...t.socialProof,  enabled: false, items: [] },
    social:       { ...t.social, instagram: '', facebook: '', tiktok: '' },
  };
}

function vitrine(over: Partial<StorefrontLike> = {}): StorefrontLike {
  return {
    theme:          themeVide(),
    paymentMethods: [],
    shippingModes:  [],
    whatsappPhone:  null,
    contactPhone:   null,
    contactEmail:   null,
    contactAddress: null,
    hasReviews:     false,
    ...over,
  };
}

const clefs = (store: StorefrontLike) => infoPagesFor(store).map((p) => p.key);

describe('infoPagesFor — une page vide n’existe pas', () => {
  test('une vitrine sans un mot n’ouvre aucune page', () => {
    assert.deepEqual(clefs(vitrine()), []);
  });

  test('cinq pages au plus, et jamais deux fois la même', () => {
    const slugs = INFO_PAGES.map((p) => p.slug);
    assert.equal(new Set(slugs).size, slugs.length);
    assert.equal(slugs.length, 5);
  });
});

describe('Fonds de gabarit', () => {
  test('le gabarit par défaut doit être le premier métier premium, pas le legacy modern', () => {
    assert.equal(resolveTemplateId(undefined), 'proximite');
    assert.deepEqual(
      templateChoices(undefined).map((t) => t.id),
      ['proximite', 'social', 'artisan', 'services', 'agri', 'traiteur', 'wellness', 'skincare', 'animalerie', 'magazine', 'sport', 'maker', 'naturel', 'monoproduit', 'chic', 'retail', 'fashion', 'beauty', 'tech', 'food'],
    );
  });
});

describe('Questions fréquentes', () => {
  test('une paire question/réponse ouvre la page, et elle seule', () => {
    const t = themeVide();
    const store = vitrine({
      theme: {
        ...t,
        faq: { ...t.faq, enabled: true, items: [{ question: 'Livrez-vous ?', answer: 'Oui.' }] },
      },
    });
    assert.deepEqual(clefs(store), ['faq']);
  });

  test('une question sans réponse ne suffit pas — `FaqSection` la jette aussi', () => {
    const t = themeVide();
    const store = vitrine({
      theme: { ...t, faq: { ...t.faq, enabled: true, items: [{ question: 'Livrez-vous ?', answer: '   ' }] } },
    });
    assert.deepEqual(clefs(store), []);
  });

  test('une FAQ éteinte n’ouvre rien, même remplie', () => {
    const t = themeVide();
    const store = vitrine({
      theme: { ...t, faq: { ...t.faq, enabled: false, items: [{ question: 'A', answer: 'B' }] } },
    });
    assert.deepEqual(clefs(store), []);
  });
});

describe('Livraison & retours', () => {
  test('un mode de livraison suffit', () => {
    const t = themeVide();
    const store = vitrine({
      theme: { ...t, shipping: { ...t.shipping, enabled: true } },
      shippingModes: [{ label: 'Port-au-Prince' }],
    });
    assert.deepEqual(clefs(store), ['livraison-retours']);
  });

  test('la politique de retour seule suffit : c’est la question qui arrête une commande', () => {
    const t = themeVide();
    const store = vitrine({
      theme: { ...t, shipping: { ...t.shipping, enabled: true, returns: 'Échange sous 7 jours.' } },
    });
    assert.deepEqual(clefs(store), ['livraison-retours']);
  });

  test('un mode sans libellé ne compte pas', () => {
    const t = themeVide();
    const store = vitrine({
      theme: { ...t, shipping: { ...t.shipping, enabled: true } },
      shippingModes: [{ label: '  ' }],
    });
    assert.deepEqual(clefs(store), []);
  });

  test('un moyen de paiement ouvre la page à lui seul', () => {
    const t = themeVide();
    const store = vitrine({
      theme: { ...t, payments: { ...t.payments, enabled: true } },
      paymentMethods: ['moncash'],
    });
    assert.deepEqual(clefs(store), ['livraison-retours']);
  });
});

describe('À propos', () => {
  test('l’histoire de la boutique ouvre la page', () => {
    const t = themeVide();
    const store = vitrine({
      theme: { ...t, brandStory: { ...t.brandStory, enabled: true, body: 'Nous avons ouvert en 2019.' } },
    });
    assert.deepEqual(clefs(store), ['a-propos']);
  });

  test('une histoire activée mais vide n’ouvre rien', () => {
    const t = themeVide();
    const store = vitrine({
      theme: { ...t, brandStory: { ...t.brandStory, enabled: true, body: '' } },
    });
    assert.deepEqual(clefs(store), []);
  });

  test('un membre d’équipe suffit', () => {
    const t = themeVide();
    const store = vitrine({
      theme: { ...t, team: { ...t.team, enabled: true, members: [{ name: 'Mirlande', role: '', photoUrl: '' }] } },
    });
    assert.deepEqual(clefs(store), ['a-propos']);
  });
});

describe('Témoignages', () => {
  test('un avis d’acheteur ouvre la page', () => {
    assert.deepEqual(clefs(vitrine({ hasReviews: true })), ['temoignages']);
  });

  test('sans avis, les citations du marchand la portent', () => {
    const t = themeVide();
    const store = vitrine({
      theme: {
        ...t,
        socialProof: { ...t.socialProof, enabled: true, items: [{ author: 'Nadège', text: 'Service rapide.', rating: 5 }] },
      },
    });
    assert.deepEqual(clefs(store), ['temoignages']);
  });

  test('une citation vide ne porte rien', () => {
    const t = themeVide();
    const store = vitrine({
      theme: { ...t, socialProof: { ...t.socialProof, enabled: true, items: [{ author: 'Nadège', text: '', rating: 5 }] } },
    });
    assert.deepEqual(clefs(store), []);
  });
});

describe('Nous joindre', () => {
  test('une adresse postale suffit, même sans bloc contact', () => {
    assert.deepEqual(clefs(vitrine({ contactAddress: 'Rue Capois, Port-au-Prince' })), ['contact']);
  });

  test('un numéro WhatsApp suffit quand le bloc est activé', () => {
    const t = themeVide();
    const store = vitrine({
      theme: { ...t, contact: { ...t.contact, enabled: true } },
      whatsappPhone: '+50912345678',
    });
    assert.deepEqual(clefs(store), ['contact']);
  });

  test('un réseau social suffit : la page dit au moins où nous trouver', () => {
    const t = themeVide();
    const store = vitrine({ theme: { ...t, social: { ...t.social, instagram: 'laloustore' } } });
    assert.deepEqual(clefs(store), ['contact']);
  });

  test('un bloc contact activé mais sans rien dedans n’ouvre rien', () => {
    const t = themeVide();
    const store = vitrine({ theme: { ...t, contact: { ...t.contact, enabled: true, body: '' } } });
    assert.deepEqual(clefs(store), []);
  });
});

describe('L’ordre et les adresses', () => {
  test('les pages sortent dans l’ordre du pied de page, pas dans celui du thème', () => {
    const t = themeVide();
    const store = vitrine({
      theme: {
        ...t,
        faq:        { ...t.faq, enabled: true, items: [{ question: 'A', answer: 'B' }] },
        brandStory: { ...t.brandStory, enabled: true, body: 'Notre histoire.' },
        shipping:   { ...t.shipping, enabled: true, returns: 'Sous 7 jours.' },
      },
      contactAddress: 'Rue Capois',
      hasReviews:     true,
    });
    assert.deepEqual(clefs(store), [
      'livraison-retours', 'faq', 'a-propos', 'temoignages', 'contact',
    ]);
  });

  test('chaque page connaît son adresse, et une adresse inconnue n’en est pas une', () => {
    for (const page of INFO_PAGES) {
      assert.equal(infoPageBySlug(page.slug)?.key, page.key);
    }
    // La garde de la route : tout le reste doit rendre 404.
    for (const inconnu of ['', 'cart', 'products', 'a-propos/', 'A-PROPOS', 'panier']) {
      assert.equal(infoPageBySlug(inconnu), null);
    }
  });

  test('chaque page nomme au moins une section à rendre', () => {
    for (const page of INFO_PAGES) {
      assert.ok(page.sections.length > 0, `${page.key} ne rend aucune section`);
      assert.ok(page.label.trim().length > 0, `${page.key} n’a pas de libellé`);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Ce qu'une page interne CONTIENT
//
// L'autre moitié de la promesse. Ouvrir l'adresse ne suffit pas : encore
// faut-il que la page porte ses sections. Elles venaient de l'ordre du gabarit,
// qui décrit la page d'ACCUEIL — et un préréglage qui ne montre pas les avis
// sur son accueil (`agri`, `flash`) rendait une page « Témoignages » réduite à
// son titre, annoncée dans le pied de page. Douze préréglages faisaient pareil
// pour « Nous joindre » (neuf autres n’en montraient qu’un morceau), six pour
// la FAQ.
// ─────────────────────────────────────────────────────────────────────────────

describe('Les sections d’une page interne', () => {
  test('une page porte ses sections même quand l’accueil du gabarit ne les montre pas', () => {
    // `agri` ne porte pas `testimonials` dans son préréglage, `flash` non plus.
    for (const templateId of ['agri', 'flash'] as const) {
      const page     = infoPageBySlug('temoignages')!;
      const sections = infoPageSections(templateId, [], page);
      assert.deepEqual(sections.map((s) => s.key), ['testimonials']);
      assert.ok(sections.every((s) => s.enabled), 'une section de page doit être active');
    }
  });

  test('aucun gabarit ne rend une page interne vide', () => {
    for (const { id } of templateChoices('proximite')) {
      for (const page of INFO_PAGES) {
        const sections = infoPageSections(id, [], page);
        assert.deepEqual(
          sections.map((s) => s.key),
          page.sections,
          `${id} / ${page.key} ne rend pas les sections de sa page`,
        );
      }
    }
  });

  test('la section réglée par le marchand passe devant celle par défaut', () => {
    const page = infoPageBySlug('faq')!;
    const [section] = infoPageSections('agri', [
      { section_key: 'faq', position: 9, is_enabled: false, config: { title: 'Vos questions' } },
    ], page);
    assert.equal(section.key, 'faq');
    // Décrochée de l'accueil, la section reste sur sa propre page.
    assert.equal(section.enabled, true);
    assert.equal(section.config.title, 'Vos questions');
  });

  test('le titre de la page ne se répète pas dans sa première section', () => {
    const page = infoPageBySlug('temoignages')!;
    const [section] = infoPageSections('agri', [
      { section_key: 'testimonials', position: 0, is_enabled: true, config: { title: 'Témoignages' } },
    ], page);
    assert.equal(section.config.title, '');
  });
});
