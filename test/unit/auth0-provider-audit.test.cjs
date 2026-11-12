'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { configuration, clientContract, apiContract, actionContract, bindingContract, factorContract,
  policyContract, codeHash, documentAt, run } = require('../../scripts/ops/auth0-provider-audit.cjs');
const env = { AUTH0_AUDIT_DOMAIN: 'synthetic.eu2.auth0.com', AUTH0_AUDIT_MANAGEMENT_TOKEN: 'synthetic-runtime-token',
  AUTH0_AUDIT_CLIENT_ID: 'synthetic-client', AUTH0_AUDIT_RESOURCE_SERVER_ID: 'synthetic-api',
  AUTH0_AUDIT_ACTION_ID: '11111111-1111-4111-8111-111111111111',
  APP_BASE_URL: 'https://console.example', AUTH0_AUDIT_AUDIENCE: 'https://api.example' };
const config = configuration(env);
const source = readFileSync(resolve(__dirname, '../../infra/auth0/post-login-action.cjs'), 'utf8');
const client = { client_id: config.clientId, app_type: 'regular_web', oidc_conformant: true,
  grant_types: ['authorization_code'], callbacks: [config.appOrigin + '/auth/callback'],
  allowed_logout_urls: [config.appOrigin], web_origins: [config.appOrigin],
  token_endpoint_auth_method: 'client_secret_post', jwt_configuration: { alg: 'RS256' } };
const resource = { id: config.resourceServerId, identifier: config.audience, signing_alg: 'RS256',
  allow_offline_access: false, token_lifetime: 3600, token_lifetime_for_web: 3600 };
const action = { id: config.actionId, all_changes_deployed: true, supported_triggers: [{ id: 'post-login' }],
  deployed_version: { id: '22222222-2222-4222-8222-222222222222', action_id: config.actionId,
    deployed: true, status: 'built', runtime: 'node22', dependencies: [], code: source,
    secrets: [{ name: 'EUBP_API_AUDIENCE' }] } };
const bindings = { total: 1, page: 0, bindings: [{ trigger_id: 'post-login',
  action: { id: config.actionId, deployed_version: { id: action.deployed_version.id } } }] };
function providerFixture(url) {
  const path = url.pathname;
  if (path.includes('/clients/')) return client;
  if (path.includes('/resource-servers/')) return resource;
  if (path.includes('/actions/actions/')) return action;
  if (path.includes('/bindings')) return bindings;
  if (path.endsWith('/factors')) return [{ name: 'otp', enabled: true, trial_expired: false }];
  if (path.endsWith('/policies')) return ['all-applications'];
  throw Error('Unexpected fixture endpoint');
}
test('provider audit sends no credentials until explicit native EU destination and all identifiers are valid', async () => {
  for (const domain of ['attacker.example', 'tenant.auth0.com', 'tenant.eu.auth0.com.attacker.example',
    'https://tenant.eu.auth0.com', 'tenant.eu.auth0.com:443', 'tenant.eu.auth0.com/path',
    'tenant.eu.auth0.com?x=1', 'tenant.eu.auth0.com@attacker.example', '127.0.0.1', 'tenant.eu.auth0.com\n']) {
    let calls = 0;
    const report = await run({ ...env, AUTH0_AUDIT_DOMAIN: domain }, () => { calls++; });
    assert.equal(calls, 0); assert.equal(report.providerConfigurationChecksPassed, false);
  }
  for (const patch of [{ AUTH0_AUDIT_CLIENT_ID: '../secrets' }, { AUTH0_AUDIT_ACTION_ID: 'not-an-action' },
    { AUTH0_AUDIT_MANAGEMENT_TOKEN: 'token\nwith-newline' }, { APP_BASE_URL: 'https://console.example/path' },
    { AUTH0_AUDIT_AUDIENCE: 'https://user:password@api.example' }]) assert.throws(() => configuration({ ...env, ...patch }));
});
test('provider audit catches unsafe redirect, grant, token lifetime, algorithm and offline-access drift', () => {
  clientContract(client, config); apiContract(resource, config);
  for (const patch of [{ callbacks: ['https://*.example/auth/callback'] }, { grant_types: ['authorization_code', 'refresh_token'] },
    { grant_types: ['authorization_code', 'authorization_code'] }, { app_type: 'spa' }, { token_endpoint_auth_method: 'none' },
    { web_origins: [config.appOrigin, 'https://foreign.example'] }, { jwt_configuration: { alg: 'HS256' } }]) {
    assert.throws(() => clientContract({ ...client, ...patch }, config));
  }
  for (const patch of [{ token_lifetime: 3601 }, { token_lifetime_for_web: 0 }, { token_lifetime: '3600' },
    { signing_alg: 'HS256' }, { identifier: 'https://wrong-api.example' }, { allow_offline_access: true }]) {
    assert.throws(() => apiContract({ ...resource, ...patch }, config));
  }
});
test('saved Action drafts and stale deployments cannot satisfy source and binding checks', () => {
  const expected = codeHash(source);
  assert.equal(actionContract(action, config, expected), action.deployed_version.id);
  assert.equal(codeHash(source.replace(/\n/g, '\r\n')), expected);
  for (const change of [copy => { copy.all_changes_deployed = false; }, copy => { copy.deployed_version.code += '// changed'; },
    copy => { copy.deployed_version.deployed = false; }, copy => { copy.deployed_version.secrets = []; },
    copy => { copy.deployed_version.dependencies = [{ name: 'unreviewed' }]; }, copy => { copy.deployed_version.runtime = 'node18'; }]) {
    const copy = structuredClone(action); change(copy); assert.throws(() => actionContract(copy, config, expected));
  }
  bindingContract(bindings, config, action.deployed_version.id);
  for (const copy of [{ ...bindings, total: 2 }, { ...bindings, page: 1 }, { ...bindings, bindings: [] },
    { ...bindings, bindings: [{ trigger_id: 'post-login', action: { id: config.actionId, deployed_version: { id: 'stale' } } }] }]) {
    assert.throws(() => bindingContract(copy, config, action.deployed_version.id));
  }
  assert.throws(() => bindingContract({ ...bindings, bindings: [{ trigger_id: 'post-login', action: { id: config.actionId } }] }, config, undefined));
});
test('MFA inspection rejects dependent-only, disabled and expired factors and adaptive-only policy', () => {
  factorContract([{ name: 'otp', enabled: true, trial_expired: false }]);
  factorContract([{ name: 'otp', enabled: true }]); // The provider schema makes the expiry marker optional.
  policyContract(['all-applications']);
  for (const factors of [[], [{ name: 'email', enabled: true }], [{ name: 'recovery-code', enabled: true }],
    [{ name: 'webauthn-platform', enabled: true }], [{ name: 'otp', enabled: false }],
    [{ name: 'otp', enabled: true, trial_expired: true }]]) assert.throws(() => factorContract(factors));
  for (const policy of [[], ['confidence-score'], ['all-applications', 'confidence-score']]) assert.throws(() => policyContract(policy));
});
test('malformed reported MFA trial expiry cannot pass the provider configuration audit', async () => {
  for (const trialExpired of [true, 'true', 'false', 0, 1, null, {}, []]) {
    const report = await run(env, async url => Response.json(url.pathname.endsWith('/factors')
      ? [{ name: 'otp', enabled: true, trial_expired: trialExpired }] : providerFixture(url)));
    assert.equal(report.providerConfigurationChecksPassed, false);
    assert.deepEqual(report.results.find(result => result.check === 'mfa_factors'),
      { check: 'mfa_factors', status: 'failed' });
    assert.equal(report.realProviderAcceptancePassed, false);
    assert.equal(report.customerLaunchApproved, false);
  }
});
test('provider probes use fixed GETs, one native HTTPS origin, no redirects, deadlines and secret-excluding client projection', async () => {
  const paths = [];
  const report = await run(env, async (url, options) => {
    paths.push(url.pathname); assert.equal(url.origin, config.managementOrigin);
    assert.equal(options.method, 'GET'); assert.equal(options.redirect, 'error'); assert.equal(options.cache, 'no-store');
    assert.ok(options.signal); assert.equal(options.headers.authorization, 'Bearer ' + env.AUTH0_AUDIT_MANAGEMENT_TOKEN);
    if (url.pathname.includes('/clients/')) { assert.equal(url.searchParams.get('include_fields'), 'true'); assert.ok(!url.searchParams.get('fields').includes('client_secret')); }
    return Response.json(providerFixture(url));
  });
  assert.equal(paths.length, 6); assert.equal(report.providerConfigurationChecksPassed, true);
  assert.equal(report.realProviderAcceptancePassed, false); assert.equal(report.customerLaunchApproved, false);
  assert.equal(report.registryRegistrationVerified, false); assert.equal(report.requiredExternalEvidence.length, 6);
  const serialized = JSON.stringify(report);
  for (const privateValue of [config.token, config.clientId, config.actionId, config.managementOrigin, source]) assert.ok(!serialized.includes(privateValue));
});
test('provider failures are redacted and one broken control prevents successful configuration assessment', async () => {
  for (const failingPath of ['/clients/', '/resource-servers/', '/actions/actions/', '/bindings', '/factors', '/policies']) {
    const report = await run(env, async url => {
      if (url.pathname.includes(failingPath)) throw Error('secret-token private-user@host.example');
      return Response.json(providerFixture(url));
    });
    assert.equal(report.providerConfigurationChecksPassed, false);
    assert.ok(!JSON.stringify(report).includes('secret-token')); assert.ok(report.results.some(result => result.status === 'failed'));
  }
});
test('provider response transport rejects oversized, redirect, error, non-JSON and invalid UTF-8 bodies', async () => {
  for (const response of [new Response('{}', { status: 302, headers: { location: 'https://attacker.example' } }),
    new Response('{}', { status: 401 }), new Response('<html>not JSON</html>'),
    Response.json({}, { headers: { 'content-length': String(512 * 1024 + 1) } }),
    new Response(' '.repeat(512 * 1024 + 1), { headers: { 'content-type': 'application/json' } }),
    new Response(Uint8Array.from([0x7b, 0xff, 0x7d]), { headers: { 'content-type': 'application/json' } })]) {
    await assert.rejects(documentAt(config, 'guardian/factors', async () => response));
  }
});
