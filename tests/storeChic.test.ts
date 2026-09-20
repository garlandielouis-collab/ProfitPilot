// ─────────────────────────────────────────────────────────────────────────────
// « Style Chic » : ce qu'il ajoute, et ce qu'il ne doit changer nulle part
// ailleurs
//
// Le gabarit a introduit trois réglages partagés — la couleur d'appel, la
// photo de promotion, la place de la bande de preuves. Chacun a une valeur par
// défaut censée laisser les vingt-deux autres gabarits exactement comme avant.
// C'est cette promesse qu'on tient ici : elle se casse sans bruit, la page
// s'affiche toujours, seulement avec l'or d'un autre.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { parseThemeConfig, themeCssVars, TEMPLATE_IDS } from '../lib/storeTheme';
import { designFor, proofStripFor, designCssVars } from '../lib/storeDesign';
import { templateArt } from '../lib/storeArt';
import { presetFor } from '../lib/storeSections';

describe('la couleur d\'appel', () => {
  test('Style Chic pose son or', () => {
    const vars = themeCssVars(parseThemeConfig({}, undefined, 'chic'));
    assert.equal(vars['--st-highlight'], '#C9A45C');
  });

  test('ailleurs, elle vaut la couleur d\'action — rien ne change', () => {
    for (const id of TEMPLATE_IDS.filter((t) => t !== 'chic')) {
      const vars = themeCssVars(parseThemeConfig({}, undefined, id));
      assert.equal(vars['--st-highlight'], vars['--st-accent'], id);
    }
  });

  test('une palette enregistrée avant son arrivée ne prend pas d\'or', () => {
    const theme = parseThemeConfig(
      { palette: { primary: '#111111', accent: '#222222', surface: '#FFFFFF', surface2: '#F5F5F5', ink: '#000000' } },
      undefined,
      'chic',
    );
    assert.equal(themeCssVars(theme)['--st-highlight'], '#222222');
  });
});

describe('les réglages partagés gardent leur défaut', () => {
  test('la bande de preuves reste sous la bannière, sauf chez Style Chic', () => {
    for (const id of TEMPLATE_IDS) {
      const rule = proofStripFor(designFor(id));
      if (id === 'chic') assert.deepEqual(rule, { place: 'section', look: 'inline' });
      else assert.deepEqual(rule, { place: 'hero', look: 'marks' }, id);
    }
  });

  test('le bouton d\'invitation a la forme du bouton d\'achat, sauf chez Style Chic', () => {
    for (const id of TEMPLATE_IDS) {
      const vars = designCssVars(designFor(id));
      if (id === 'chic') assert.equal(vars['--st-radius-cta'], '999px');
      else assert.equal(vars['--st-radius-cta'], vars['--st-radius-btn'], id);
    }
  });

  test('la promotion de Style Chic est une photo ; les bandes des autres restent dessinées', () => {
    assert.equal(templateArt('chic', 'band'), '/gabarits/photo/chic-band.webp');
    assert.equal(templateArt('fashion', 'band'), '/gabarits/art/fashion-band.webp');
  });
});

describe('l\'accueil de Style Chic', () => {
  test('l\'ordre de sa maquette, et la réassurance à sa place', () => {
    assert.deepEqual(presetFor('chic'), [
      'announcement', 'hero', 'categories', 'bestsellers', 'benefits',
      'promotion', 'brand_story', 'testimonials', 'cta_band',
    ]);
  });
});
