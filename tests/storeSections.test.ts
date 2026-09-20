// ─────────────────────────────────────────────────────────────────────────────
// L'ordre des gabarits : « Notre histoire » partout, « Présentation » nulle part
//
// Deux règles posées le 18/09/2026, valables pour les vingt-trois gabarits, et
// qui se cassent sans bruit. Un préréglage réécrit à la main peut réintroduire
// `presentation` ou oublier `brand_story` : la page s'affiche quand même, il
// lui manque juste un bloc. Et une vitrine qui a enregistré ses sections avant
// le retrait porte encore une ligne `presentation` en base.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { presetFor, resolveSections } from '../lib/storeSections';
import { TEMPLATE_IDS } from '../lib/storeTheme';

describe('presetFor — la place de « Notre histoire »', () => {
  for (const id of TEMPLATE_IDS) {
    test(`${id} : l'histoire suit les meilleures ventes, ou à défaut les rayons`, () => {
      const preset = presetFor(id);
      assert.equal(preset.includes('presentation'), false, 'la présentation est retirée');
      assert.equal(preset.filter((k) => k === 'brand_story').length, 1, 'une histoire, une seule');

      const anchor = preset.includes('bestsellers') ? 'bestsellers'
        : preset.includes('categories') ? 'categories'
        : null;
      // `services` et `monoproduit` n'ont ni l'un ni l'autre : leur place est
      // décidée à la main, dans le préréglage. `chic` suit l'ordre exact de sa
      // maquette, où la réassurance et la collection passent avant l'histoire.
      if (anchor && id !== 'chic') {
        assert.equal(preset[preset.indexOf('brand_story') - 1], anchor);
      }
    });
  }
});

describe('resolveSections — une section retirée ne revient pas par la base', () => {
  test('une ligne `presentation` enregistrée est écartée', () => {
    const sections = resolveSections('modern', [
      { section_key: 'presentation', position: 0, is_enabled: true, config: {} },
      { section_key: 'hero',         position: 1, is_enabled: true, config: {} },
    ]);
    assert.equal(sections.some((s) => s.key === 'presentation'), false);
    assert.equal(sections.some((s) => s.key === 'hero'), true);
  });
});
