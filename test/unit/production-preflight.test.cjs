'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { configuration, oidcContract, storageContract, scannerContract, jsonDocument, run } = require('../../scripts/ops/production-preflight.cjs');
const env = {
  NODE_ENV: 'production', AUTH_MODE: 'oidc', BATTERY_SEMANTIC_CATALOGUE_AVAILABLE: 'false', REGISTRY_BATTERY_SUBMISSION_AVAILABLE: 'false',
  DATABASE_URL: 'postgresql://runtime:synthetic@database.example/app?sslmode=require&sslaccept=strict',
  S3_REGION: 'eu-central-1', S3_BUCKET: 'fixture', MALWARE_SCANNER: 'clamav', CLAMAV_HOST: 'scanner.internal',
  OIDC_ALLOWED_ALGORITHMS: 'RS256', OIDC_AUDIENCE: 'https://api.example', OIDC_ISSUER: 'https://issuer.example/',
  OIDC_JWKS_URL: 'https://issuer.example/.well-known/jwks.json',
  OIDC_ORGANISATION_CLAIM: 'https://eubatterypassport.nl/organisation_id', OIDC_ROLE_CLAIM: 'https://eubatterypassport.nl/role',
  WEB_ORIGIN: 'https://console.example', RESOLVER_BASE_URL: 'https://api.example/v1/public/b',
  SUPPLIER_PORTAL_BASE_URL: 'https://console.example/supplier', RESTRICTED_ACCESS_BASE_URL: 'https://console.example/access',
};
const discovery = { issuer: env.OIDC_ISSUER, jwks_uri: env.OIDC_JWKS_URL,
  authorization_endpoint: 'https://issuer.example/authorize', token_endpoint: 'https://issuer.example/oauth/token',
  end_session_endpoint: 'https://issuer.example/oidc/logout', response_types_supported: ['code'], id_token_signing_alg_values_supported: ['RS256'] };
const keys = { keys: [{ kid: 'test', use: 'sig', kty: 'RSA', alg: 'RS256', n: 'synthetic', e: 'AQAB' }] };
const storage = { location: { LocationConstraint: 'eu-central-1' }, versioning: { Status: 'Enabled' },
  publicAccess: { PublicAccessBlockConfiguration: { BlockPublicAcls: true, IgnorePublicAcls: true, BlockPublicPolicy: true, RestrictPublicBuckets: true } },
  policy: { PolicyStatus: { IsPublic: false } },
  encryption: { ServerSideEncryptionConfiguration: { Rules: [{ ApplyServerSideEncryptionByDefault: {
    SSEAlgorithm: 'aws:kms', KMSMasterKeyID: 'arn:aws:kms:eu-central-1:123456789012:key/00000000-0000-0000-0000-000000000000' } }] } },
  lock: { ObjectLockConfiguration: { ObjectLockEnabled: 'Enabled', Rule: { DefaultRetention: { Mode: 'GOVERNANCE', Days: 30 } } } },
  cors: { CORSRules: [{ AllowedOrigins: ['https://console.example'], AllowedMethods: ['PUT'], AllowedHeaders: ['content-type', 'x-amz-*'] }] },
};
test('production preflight rejects incomplete and unsafe environments before any network probe', async () => {
  assert.equal(configuration(env), true);
  const patches = [{ NODE_ENV: 'development' }, { DATABASE_URL: env.DATABASE_URL.replace('strict', 'accept_invalid_certs') },
    { S3_REGION: 'us-east-1' }, { S3_REGION: 'eu-west-2' }, { S3_ENDPOINT: 'http://localhost:9000' },
    { OIDC_ROLE_CLAIM: 'user_metadata.role' }, { OIDC_ISSUER: 'https://issuer.example/path/' },
    { WEB_ORIGIN: '*' }, { REGISTRY_BATTERY_SUBMISSION_AVAILABLE: 'true' }, { MALWARE_SCANNER: 'disabled' }];
  for (const patch of patches) assert.throws(() => configuration({ ...env, ...patch }));
  let calls = 0;
  const report = await run({}, { database: () => { calls++; } });
  assert.equal(calls, 0); assert.equal(report.technicalChecksPassed, false);
});
test('OIDC preflight rejects issuer/key substitution, absent logout and private key material', () => {
  oidcContract(discovery, keys, env);
  for (const patch of [{ issuer: 'https://other.example/' }, { jwks_uri: 'https://other.example/keys' },
    { end_session_endpoint: undefined }, { token_endpoint: 'http://issuer.example/token' }, { response_types_supported: ['token'] }]) {
    assert.throws(() => oidcContract({ ...discovery, ...patch }, keys, env));
  }
  for (const value of [{ keys: [] }, { keys: [keys.keys[0], keys.keys[0]] }, { keys: [{ ...keys.keys[0], d: 'private' }] }]) {
    assert.throws(() => oidcContract(discovery, value, env));
  }
});
test('storage acceptance rejects non-EU, unversioned, public, unencrypted and unrestricted browser configurations', () => {
  storageContract(storage, env);
  const mutations = [s => { s.location.LocationConstraint = 'us-east-1'; }, s => { s.versioning.Status = 'Suspended'; },
    s => { s.publicAccess.PublicAccessBlockConfiguration.IgnorePublicAcls = false; }, s => { s.policy.PolicyStatus.IsPublic = true; },
    s => { s.encryption.ServerSideEncryptionConfiguration.Rules[0].ApplyServerSideEncryptionByDefault.SSEAlgorithm = 'AES256'; },
    s => { s.lock.ObjectLockConfiguration.Rule.DefaultRetention.Days = 0; },
    s => { s.cors.CORSRules[0].AllowedOrigins = ['*']; }, s => { s.cors.CORSRules[0].AllowedHeaders = ['content-type']; }];
  for (const mutate of mutations) { const copy = structuredClone(storage); mutate(copy); assert.throws(() => storageContract(copy, env)); }
});
test('scanner readiness requires a complete ping and current UTC signature timestamp', () => {
  const version = 'ClamAV 1.4.6/28000/Sat Oct  3 12:00:00 2026';
  const now = Date.parse('2026-10-03T13:00:00Z');
  scannerContract(version, 'PONG', now);
  assert.throws(() => scannerContract(version, 'PONG', now + 49 * 3600_000));
  assert.throws(() => scannerContract(version, 'PONG', now - 2 * 3600_000));
  assert.throws(() => scannerContract(version, 'OK', now));
  assert.throws(() => scannerContract('ClamAV 1.4.6', 'PONG', now));
});
test('preflight output redacts failures and never equates infrastructure checks with customer launch or registration', async () => {
  const pass = async () => {};
  const checks = { database: pass, oidc: pass, storage: pass, scanner: pass };
  const good = await run(env, checks);
  assert.equal(good.technicalChecksPassed, true); assert.equal(good.customerLaunchApproved, false);
  assert.equal(good.registryRegistrationVerified, false); assert.equal(good.requiredExternalEvidence.length, 6);
  for (const name of Object.keys(checks)) {
    const bad = await run(env, { ...checks, [name]: async () => { throw Error('secret-password@private-host'); } });
    assert.equal(bad.technicalChecksPassed, false);
    assert.ok(!JSON.stringify(bad).includes('secret-password'));
    assert.equal(bad.results.find(r => r.check === name).status, 'failed');
  }
});
test('OIDC documents have bounded responses, verified HTTP success, a deadline and no redirects', async () => {
  const good = await jsonDocument('https://issuer.example/doc', async (_url, options) => {
    assert.equal(options.redirect, 'error'); assert.ok(options.signal); return Response.json({ issuer: 'fixture' });
  });
  assert.equal(good.issuer, 'fixture');
  await assert.rejects(jsonDocument('https://issuer.example/doc', async () => new Response('x'.repeat(128 * 1024 + 1))));
  await assert.rejects(jsonDocument('https://issuer.example/doc', async () => new Response('{}', { status: 503 })));
});
