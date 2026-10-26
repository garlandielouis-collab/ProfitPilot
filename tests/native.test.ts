import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  EXIT_WINDOW_MS, backHandlerCount, isRootPath, pushBackHandler, runBackHandler, shouldExit,
} from '../lib/backStack';
import { isExternalUrl, isNativeUserAgent } from '../lib/native';

describe('le bouton retour d’Android', () => {
  test('la dernière feuille ouverte se referme en premier', () => {
    const closed: string[] = [];
    const releaseSale = pushBackHandler(() => closed.push('vente'));
    const releaseCredit = pushBackHandler(() => closed.push('crédit'));

    assert.equal(runBackHandler(), true);
    assert.deepEqual(closed, ['crédit']);

    releaseCredit();
    assert.equal(runBackHandler(), true);
    assert.deepEqual(closed, ['crédit', 'vente']);
    releaseSale();
  });

  test('sans feuille ouverte, le retour n’est pas intercepté', () => {
    assert.equal(backHandlerCount(), 0);
    assert.equal(runBackHandler(), false);
  });

  test('se désinscrire deux fois ne retire pas la feuille d’un autre', () => {
    const release = pushBackHandler(() => {});
    const releaseOther = pushBackHandler(() => {});
    release();
    release();
    assert.equal(backHandlerCount(), 1);
    releaseOther();
  });

  test('sur l’accueil, il faut deux retours rapprochés pour sortir', () => {
    assert.equal(shouldExit(null, 10_000), false);
    assert.equal(shouldExit(10_000, 10_000 + EXIT_WINDOW_MS - 1), true);
    assert.equal(shouldExit(10_000, 10_000 + EXIT_WINDOW_MS + 1), false);
  });

  test('l’accueil et la connexion sont des racines, pas la vente ni la caisse', () => {
    assert.equal(isRootPath('/dashboard'), true);
    assert.equal(isRootPath('/auth/login'), true);
    assert.equal(isRootPath('/caisse'), false);
    assert.equal(isRootPath('/sales'), false);
  });
});

describe('la coque Android', () => {
  test('se reconnaît au marqueur du user-agent', () => {
    assert.equal(isNativeUserAgent('Mozilla/5.0 (Linux; Android 13) Chrome/131 Mobile ProfitPilotApp/1'), true);
    assert.equal(isNativeUserAgent('Mozilla/5.0 (Linux; Android 13) Chrome/131 Mobile'), false);
    assert.equal(isNativeUserAgent(null), false);
  });

  test('WhatsApp et les sites tiers sortent de l’application, pas les écrans de ProfitPilot', () => {
    const origin = 'https://profitpilot-ten.vercel.app';
    assert.equal(isExternalUrl('https://wa.me/50937123456?text=Bonjou', origin), true);
    assert.equal(isExternalUrl('tel:+50935045946', origin), true);
    assert.equal(isExternalUrl('/caisse', origin), false);
    assert.equal(isExternalUrl('https://profitpilot-ten.vercel.app/sol', origin), false);
  });
});
