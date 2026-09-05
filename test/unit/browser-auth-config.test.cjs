'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { runInNewContext } = require('node:vm');
const ts = require('typescript');

// Exercise the real pure helper without Next startup, credentials or an issuer.
const source = readFileSync(resolve(__dirname, '../../apps/web/lib/auth-config.ts'), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
const exportsObject = {};
runInNewContext(compiled.outputText, { exports: exportsObject, URL });
const { readAuth0Config, hasSameOrigin, hasTrustedRequestHost, assertProvisionedIdentity, ORGANISATION_CLAIM, ROLE_CLAIM } = exportsObject;
const configured = {
  NODE_ENV: 'production', AUTH0_DOMAIN: 'identity.example.test',
  APP_BASE_URL: 'https://passport.example.test', AUTH0_CLIENT_ID: 'browser-fixture',
  AUTH0_CLIENT_SECRET: 'synthetic-client-value-'.repeat(3), AUTH0_SECRET: 'a7'.repeat(32),
  AUTH0_AUDIENCE: 'https://api.example.test', OIDC_AUDIENCE: 'https://api.example.test',
  OIDC_ISSUER: 'https://identity.example.test/',
};

test('browser auth requires complete configuration without choosing a default provider or credential', () => {
  assert.equal(readAuth0Config({ NODE_ENV: 'production' }), null);
  for (const key of ['AUTH0_DOMAIN', 'APP_BASE_URL', 'AUTH0_CLIENT_ID', 'AUTH0_CLIENT_SECRET', 'AUTH0_SECRET', 'AUTH0_AUDIENCE']) {
    const env = { ...configured }; delete env[key];
    assert.equal(readAuth0Config(env), null, `Missing ${key} must disable auth`);
    assert.equal(readAuth0Config({ ...configured, [key]: configured[key] + ' ' }), null, `Ambiguous ${key} must disable auth`);
  }
  const config = readAuth0Config(configured);
  assert(config && config.secure);
  assert.equal(config.appBaseUrl, configured.APP_BASE_URL);
  assert.equal(config.domain, configured.AUTH0_DOMAIN);
  assert(Object.isFrozen(config));
});

test('production auth rejects insecure origins, userinfo, paths and redirect-bearing configuration', () => {
  for (const patch of [
    { APP_BASE_URL: 'http://passport.example.test' }, { APP_BASE_URL: 'http://localhost:3000' },
    { APP_BASE_URL: 'https://user:secret@passport.example.test' }, { APP_BASE_URL: 'https://passport.example.test/app' },
    { APP_BASE_URL: 'https://passport.example.test/?next=https://attacker.test' }, { APP_BASE_URL: 'https://passport.example.test/#fragment' },
    { AUTH0_DOMAIN: 'http://identity.example.test' }, { AUTH0_DOMAIN: 'https://user:secret@identity.example.test' },
    { AUTH0_DOMAIN: 'https://identity.example.test/path' }, { AUTH0_DOMAIN: 'https://identity.example.test/?issuer=other' },
    { AUTH0_DOMAIN: 'https://identity.example.test:8443/' }, { AUTH0_DOMAIN: 'identity.example.test:8443' },
    { AUTH0_DOMAIN: 'https://127.0.0.1/' }, { AUTH0_DOMAIN: 'https://[::1]/' },
    { AUTH0_DOMAIN: 'https://localhost/' }, { AUTH0_DOMAIN: 'https://identity.local/' },
  ]) assert.equal(readAuth0Config({ ...configured, ...patch }), null, Object.keys(patch)[0]);
  assert(readAuth0Config({ ...configured, AUTH0_DOMAIN: 'https://identity.example.test/' }));
  assert(readAuth0Config({ ...configured, AUTH0_DOMAIN: 'https://identity.example.test:443/' }));
});

test('actual Auth0 SDK accepts the application factory settings and reads an empty session without network I/O', async () => {
  const sdk = await import('@auth0/nextjs-auth0/server');
  const next = require('next/server');
  const factorySource = readFileSync(resolve(__dirname, '../../apps/web/lib/auth0.ts'), 'utf8');
  const factoryCode = ts.transpileModule(factorySource, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
  const factoryExports = {};
  const modules = {
    '@auth0/nextjs-auth0/server': sdk,
    'next/server': next,
    './auth-config': { ...exportsObject, readAuth0Config: () => readAuth0Config(configured) },
  };
  runInNewContext(factoryCode.outputText, { exports: factoryExports, URL,
    require: name => { assert(Object.hasOwn(modules, name), 'Unexpected factory dependency'); return modules[name]; } });
  const client = factoryExports.getAuth0Client();
  assert(client instanceof sdk.Auth0Client);
  assert.equal(client, factoryExports.getAuth0Client());
  const request = new next.NextRequest(configured.APP_BASE_URL + '/api/session', { headers: { host: 'passport.example.test' } });
  assert.equal(await client.getSession(request), null);
});

test('only explicit local development may use an HTTP application origin; issuer TLS is always mandatory', () => {
  assert.equal(readAuth0Config({ ...configured, GITHUB_ACTIONS: 'true', APP_BASE_URL: 'http://localhost:3000' }), null);
  assert.equal(readAuth0Config({ ...configured, NODE_ENV: 'test', APP_BASE_URL: 'http://localhost:3000' }), null);
  assert.equal(readAuth0Config({ ...configured, NODE_ENV: 'development', APP_BASE_URL: 'http://public.example.test' }), null);
  assert.equal(readAuth0Config({ ...configured, NODE_ENV: 'development', APP_BASE_URL: 'http://localhost:3000' }).secure, false);
});

test('browser and API must agree on issuer and resource audience', () => {
  for (const patch of [{ OIDC_ISSUER: 'https://other.example.test/' }, { OIDC_AUDIENCE: 'different-api' },
    { AUTH0_AUDIENCE: 'api identifier with spaces' }, { AUTH0_AUDIENCE: 'a'.repeat(1025) }]) {
    assert.equal(readAuth0Config({ ...configured, ...patch }), null);
  }
});

test('browser session encryption and confidential client settings reject unusable secrets', () => {
  for (const patch of [{ AUTH0_SECRET: 'a'.repeat(63) }, { AUTH0_SECRET: 'x'.repeat(64) },
    { AUTH0_CLIENT_SECRET: 'too-short' }, { AUTH0_CLIENT_ID: 'client id with spaces' }]) {
    assert.equal(readAuth0Config({ ...configured, ...patch }), null);
  }
});

test('auth CSRF checks require the exact configured Origin and Host, never forwarded fallbacks', () => {
  const origin = configured.APP_BASE_URL;
  const headers = new Headers({ host: 'passport.example.test', origin });
  assert.equal(hasSameOrigin(headers, origin), true);
  assert.equal(hasTrustedRequestHost(new Headers({ host: 'PASSPORT.EXAMPLE.TEST' }), origin), true);
  for (const patch of [
    { origin: 'https://attacker.example.test' }, { origin: 'null' }, { origin: origin + '.attacker.test' },
    { origin: origin + '/' }, { host: 'attacker.example.test' }, { host: 'passport.example.test:444' },
    { host: 'attacker.example.test', 'x-forwarded-host': 'passport.example.test', 'x-forwarded-proto': 'https' },
  ]) assert.equal(hasSameOrigin(new Headers({ host: 'passport.example.test', origin, ...patch }), origin), false);
  assert.equal(hasSameOrigin(new Headers({ host: 'passport.example.test' }), origin), false);
  assert.equal(hasSameOrigin(new Headers({ origin, 'x-forwarded-host': 'passport.example.test' }), origin), false);
});

test('a valid provider identity cannot create an app session without explicit canonical tenant and role claims', () => {
  const provisioned = { sub: 'fixture-user', [ORGANISATION_CLAIM]: 'b75efc93-a2a5-4e9c-9f7c-3e5c845eef34', [ROLE_CLAIM]: 'operator_user' };
  assert.doesNotThrow(() => assertProvisionedIdentity(provisioned));
  assert.throws(() => assertProvisionedIdentity({ sub: 'fixture-user' }));
  assert.throws(() => assertProvisionedIdentity(Object.create(provisioned)));
  for (const patch of [
    { [ORGANISATION_CLAIM]: undefined }, { [ORGANISATION_CLAIM]: 'org_provider_identifier' },
    { [ORGANISATION_CLAIM]: 'B75EFC93-A2A5-4E9C-9F7C-3E5C845EEF34' },
    { [ORGANISATION_CLAIM]: ['b75efc93-a2a5-4e9c-9f7c-3e5c845eef34'] },
    { [ROLE_CLAIM]: undefined }, { [ROLE_CLAIM]: 'admin' }, { [ROLE_CLAIM]: ['operator_admin'] },
    { [ROLE_CLAIM]: 'operator_admin ' },
  ]) assert.throws(() => assertProvisionedIdentity({ ...provisioned, ...patch }));
  for (const role of ['operator_user', 'operator_admin', 'compliance_manager', 'service_provider', 'service_provider_admin']) {
    assert.doesNotThrow(() => assertProvisionedIdentity({ ...provisioned, [ROLE_CLAIM]: role }));
  }
});

test('present email must be verified before a browser session is persisted', () => {
  const provisioned = { [ORGANISATION_CLAIM]: 'b75efc93-a2a5-4e9c-9f7c-3e5c845eef34', [ROLE_CLAIM]: 'operator_user', email: 'fixture@example.test' };
  assert.throws(() => assertProvisionedIdentity(provisioned));
  assert.throws(() => assertProvisionedIdentity({ ...provisioned, email_verified: false }));
  assert.throws(() => assertProvisionedIdentity({ ...provisioned, email_verified: 'true' }));
  assert.throws(() => assertProvisionedIdentity({ ...provisioned, email_verified: true, email: '' }));
  assert.doesNotThrow(() => assertProvisionedIdentity({ ...provisioned, email_verified: true }));
});
