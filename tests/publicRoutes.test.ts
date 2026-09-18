import test from 'node:test';
import assert from 'node:assert/strict';

import { isPublicAppPath } from '../lib/publicRoutes';

test('isPublicAppPath — routes publiques et vitrines', () => {
  assert.equal(isPublicAppPath('/'), true);
  assert.equal(isPublicAppPath('/pricing'), true);
  assert.equal(isPublicAppPath('/auth/login'), true);
  assert.equal(isPublicAppPath('/onboarding'), true);
  assert.equal(isPublicAppPath('/store/demo'), true);
  assert.equal(isPublicAppPath('/apercu/demo'), true);
});

test('isPublicAppPath — routes applicatives protégées', () => {
  assert.equal(isPublicAppPath('/dashboard'), false);
  assert.equal(isPublicAppPath('/sales'), false);
  assert.equal(isPublicAppPath('/settings'), false);
  assert.equal(isPublicAppPath('/products'), false);
});
