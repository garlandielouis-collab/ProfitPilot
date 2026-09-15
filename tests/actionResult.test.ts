import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  attempt,
  unwrap,
  screenMessage,
  UserFacingError,
  type ActionResult,
} from '../lib/actionResult';

// Le message qu'une action renvoie quand l'erreur n'était pas écrite pour le
// marchand. Dupliqué ici volontairement : si quelqu'un le change dans
// `lib/actionResult.ts`, ce test le lui dit, parce que c'est la phrase que des
// milliers d'écrans afficheront.
const GENERIC = "L'opération n'a pas abouti. Réessayez ; si cela persiste, prévenez-nous.";

describe('attempt — ce qui atteint le marchand', () => {
  test('rend la valeur quand tout va bien', async () => {
    const res = await attempt(async () => 42);
    assert.deepEqual(res, { ok: true, data: 42 });
  });

  test('laisse passer un message écrit pour le marchand', async () => {
    const res = await attempt(async () => {
      throw new UserFacingError('Votre catalogue est plein : 50 fiches.');
    });
    assert.deepEqual(res, { ok: false, message: 'Votre catalogue est plein : 50 fiches.' });
  });

  test('laisse passer les gardes d’offre, reconnues par leur nom', async () => {
    // `FeatureLockedError` et `PlanLimitError` vivent dans `lib/entitlements`,
    // qui tire `next/headers` : on ne peut pas l'importer ici, et c'est
    // précisément pour ça que `attempt` les reconnaît à leur `name`.
    const locked = Object.assign(new Error("Fonctionnalité disponible à partir de l'offre Kwasans."), {
      name: 'FeatureLockedError',
    });
    const res = await attempt(async () => { throw locked; });
    assert.equal(res.ok, false);
    assert.equal(
      (res as { message: string }).message,
      "Fonctionnalité disponible à partir de l'offre Kwasans.",
    );
  });

  test('laisse passer le refus de rôle, reconnu à son texte', async () => {
    const res = await attempt(async () => {
      throw new Error('Action non autorisée pour le rôle "caissier".');
    });
    assert.equal((res as { message: string }).message, 'Action non autorisée pour le rôle "caissier".');
  });

  test('ne laisse PAS passer un message de base de données', async () => {
    const res = await attempt(async () => {
      throw new Error('duplicate key value violates unique constraint "products_pkey"');
    });
    assert.deepEqual(res, { ok: false, message: GENERIC });
  });

  test('ne laisse pas passer une panne quelconque', async () => {
    const res = await attempt(async () => { throw new TypeError('x is not a function'); });
    assert.deepEqual(res, { ok: false, message: GENERIC });
  });

  test('relaie les sauts de contrôle de Next au lieu de les avaler', async () => {
    // `redirect()` lève une erreur marquée d'un digest. L'attraper annulerait
    // la redirection en silence.
    const signal = Object.assign(new Error('NEXT_REDIRECT'), { digest: 'NEXT_REDIRECT;replace;/x;307;' });
    await assert.rejects(() => attempt(async () => { throw signal; }), (e: unknown) => e === signal);
  });

  test('relaie la sortie de rendu statique — vue en vrai au build sur /products', async () => {
    // `DynamicServerError` : « cette route lit les cookies, elle doit être
    // dynamique ». Avalée, la page se fige en statique avec des données vides.
    const bailout = Object.assign(
      new Error("Route /products couldn't be rendered statically because it used `cookies`."),
      { digest: 'DYNAMIC_SERVER_USAGE' },
    );
    await assert.rejects(() => attempt(async () => { throw bailout; }), (e: unknown) => e === bailout);
  });

  test('une erreur applicative n’a pas de digest et reste attrapée', async () => {
    const res = await attempt(async () => { throw new Error('panne quelconque'); });
    assert.equal(res.ok, false);
  });
});

describe('unwrap — le résultat rouvert côté écran', () => {
  test('rend la donnée', () => {
    assert.equal(unwrap({ ok: true, data: 'abc' }), 'abc');
  });

  test('lève avec le message, dans le navigateur cette fois', () => {
    const res: ActionResult<string> = { ok: false, message: 'Stock insuffisant.' };
    assert.throws(() => unwrap(res), (e: unknown) => {
      assert.ok(e instanceof UserFacingError);
      assert.equal((e as Error).message, 'Stock insuffisant.');
      return true;
    });
  });
});

describe('screenMessage — pour les actions qui lèvent encore', () => {
  test('remplace la phrase que Next met à la place du vrai message', () => {
    const stripped = new Error(
      'An error occurred in the Server Components render. The specific message is '
      + 'omitted in production builds to avoid leaking sensitive details.',
    );
    assert.equal(screenMessage(stripped, 'Repli.'), 'Repli.');
  });

  test('remplace aussi un message de base de données', () => {
    assert.equal(screenMessage(new Error('PGRST202 function not found'), 'Repli.'), 'Repli.');
    assert.equal(screenMessage(new Error('null value in column "name"'), 'Repli.'), 'Repli.');
  });

  test('laisse passer un message écrit pour le marchand', () => {
    const e = new UserFacingError('Seul le propriétaire peut modifier les rôles.');
    assert.equal(screenMessage(e, 'Repli.'), 'Seul le propriétaire peut modifier les rôles.');
  });

  test('laisse passer un message ordinaire (utile en développement)', () => {
    assert.equal(screenMessage(new Error('Pas de réseau'), 'Repli.'), 'Pas de réseau');
  });

  test('rend le repli pour ce qui n’est pas une erreur', () => {
    assert.equal(screenMessage(null, 'Repli.'), 'Repli.');
    assert.equal(screenMessage(undefined, 'Repli.'), 'Repli.');
    assert.equal(screenMessage({}, 'Repli.'), 'Repli.');
  });
});
