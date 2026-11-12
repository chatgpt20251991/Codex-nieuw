'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { webcrypto, createHmac } = require('node:crypto');
const ts = require('typescript');
const source = fs.readFileSync(path.join(__dirname, '../../apps/web/lib/auth-config.ts'), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const auth = {}; new Function('exports', 'crypto', compiled)(auth, webcrypto);
const secret = 'b'.repeat(64); // Synthetic test secret; never used for a provider or deployment.
const organisationId = '10000000-0000-4000-8000-000000000001';
const user = () => ({ sub: 'auth0|synthetic-workspace-account', amr: ['pwd', 'mfa'],
  [auth.ORGANISATION_CLAIM]: organisationId, [auth.ROLE_CLAIM]: 'service_provider_admin',
  name: 'Synthetic owner', email: 'synthetic@example.invalid', email_verified: true });

test('browser identity contexts are stable keyed domain-separated digests without exposing identity claims', async () => {
  const identity = user(), before = structuredClone(identity);
  const context = await auth.authorizationContext(secret, identity);
  assert.match(context, /^[a-f0-9]{64}$/);
  assert.equal(await auth.authorizationContext(secret, user()), context); assert.deepEqual(identity, before);
  const expected = createHmac('sha256', secret).update(JSON.stringify([
    'eubp.browser-auth-context.v1', identity.sub, organisationId, identity[auth.ROLE_CLAIM],
  ])).digest('hex');
  assert.equal(context, expected);
  for (const privateValue of [identity.sub, organisationId, identity[auth.ROLE_CLAIM], identity.email, secret]) {
    assert.equal(context.includes(privateValue), false);
  }
  assert.equal(await auth.authorizationContext(secret, { ...user(), name: 'Updated display name',
    email: 'new-address@example.invalid', amr: ['mfa', 'pwd'] }), context);
});

test('a changed subject, organisation, role or server secret produces a different identity context', async () => {
  const original = await auth.authorizationContext(secret, user());
  for (const change of [{ sub: 'auth0|another-synthetic-account' },
    { [auth.ORGANISATION_CLAIM]: '20000000-0000-4000-8000-000000000002' },
    { [auth.ROLE_CLAIM]: 'operator_user' }]) {
    assert.notEqual(await auth.authorizationContext(secret, { ...user(), ...change }), original);
  }
  assert.notEqual(await auth.authorizationContext('c'.repeat(64), user()), original);
});

test('identity contexts cannot be minted before verified MFA and administrator-provisioned application claims', async () => {
  for (const change of [{ amr: undefined }, { amr: [] }, { amr: ['pwd'] }, { amr: ['mfa', 7] },
    { [auth.ROLE_CLAIM]: undefined }, { [auth.ROLE_CLAIM]: 'owner' }, { [auth.ROLE_CLAIM]: true },
    { [auth.ORGANISATION_CLAIM]: undefined }, { [auth.ORGANISATION_CLAIM]: 'not-a-uuid' },
    { sub: '' }, { sub: undefined }, { sub: 'x'.repeat(256) }, { email_verified: false }]) {
    await assert.rejects(auth.authorizationContext(secret, { ...user(), ...change }));
  }
  const inheritedMfa = Object.assign(Object.create({ amr: ['mfa'] }), user()); delete inheritedMfa.amr;
  await assert.rejects(auth.authorizationContext(secret, inheritedMfa), /Multi-factor/);
  const inheritedRole = Object.assign(Object.create({ [auth.ROLE_CLAIM]: 'operator_admin' }), user()); delete inheritedRole[auth.ROLE_CLAIM];
  await assert.rejects(auth.authorizationContext(secret, inheritedRole), /not provisioned/);
});

test('legacy or malformed sessions lack the required own authorization context field', async () => {
  assert.equal(auth.hasAuthorizationContext(user()), false);
  const context = await auth.authorizationContext(secret, user());
  assert.equal(auth.hasAuthorizationContext({ [auth.AUTH_CONTEXT_CLAIM]: context }), true);
  for (const value of [undefined, null, true, {}, organisationId, '', 'a'.repeat(63), 'a'.repeat(65), 'A'.repeat(64), ' ' + context]) {
    assert.equal(auth.hasAuthorizationContext({ [auth.AUTH_CONTEXT_CLAIM]: value }), false);
  }
  assert.equal(auth.hasAuthorizationContext(Object.create({ [auth.AUTH_CONTEXT_CLAIM]: context })), false);
});
