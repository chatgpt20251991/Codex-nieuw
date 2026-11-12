'use strict';

// Read-only inspection of existing Auth0 configuration. A supplied management
// token is used only for fixed GET endpoints on an explicit native EU tenant.
// No identity, token, Action, subscription or configuration is created/changed.
const { createHash } = require('node:crypto');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const MAX_BYTES = 512 * 1024;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const CHECKS = Object.freeze(['console_client', 'api_configuration', 'deployed_action', 'login_binding', 'mfa_factors', 'mfa_policy']);
const REQUIRED_REAL_EVIDENCE = Object.freeze([
  'plan_entitlement_region_privacy_and_administrator_review',
  'action_audience_secret_value_and_complete_flow_review',
  'connection_signup_protection_and_client_grant_review',
  'real_https_login_mfa_enrolment_cancel_and_recovery',
  'real_access_token_rejection_cases_and_two_tenant_isolation',
  'secure_cookie_logout_expiry_and_existing_token_revocation_window',
]);
function requireThat(value) { if (!value) throw Error('Auth0 audit requirement not satisfied.'); }
function origin(value) {
  requireThat(typeof value === 'string' && value === value.trim());
  const url = new URL(value);
  requireThat(url.protocol === 'https:' && !url.username && !url.password && !url.port &&
    url.pathname === '/' && !url.search && !url.hash && url.hostname.includes('.') &&
    !url.hostname.endsWith('.local') && !url.hostname.endsWith('.localhost') &&
    !/^\d+\.\d+\.\d+\.\d+$/.test(url.hostname) && !url.hostname.includes(':'));
  requireThat(value === url.origin);
  return url.origin;
}
function configuration(env) {
  // Native Auth0 EU domains only. Custom domains need a separately reviewed
  // management destination; arbitrary hosts never receive a bearer token.
  const domain = env.AUTH0_AUDIT_DOMAIN;
  requireThat(typeof domain === 'string' && /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.eu(?:2)?\.auth0\.com$/.test(domain));
  const token = env.AUTH0_AUDIT_MANAGEMENT_TOKEN;
  requireThat(typeof token === 'string' && /^[A-Za-z0-9._~-]{10,32768}$/.test(token));
  const clientId = env.AUTH0_AUDIT_CLIENT_ID, resourceServerId = env.AUTH0_AUDIT_RESOURCE_SERVER_ID;
  for (const id of [clientId, resourceServerId]) requireThat(typeof id === 'string' && /^[A-Za-z0-9_-]{1,256}$/.test(id));
  const actionId = env.AUTH0_AUDIT_ACTION_ID;
  requireThat(typeof actionId === 'string' && UUID.test(actionId));
  return { managementOrigin: 'https://' + domain, token, clientId, resourceServerId, actionId,
    appOrigin: origin(env.APP_BASE_URL), audience: origin(env.AUTH0_AUDIT_AUDIENCE) };
}
function sameStrings(actual, expected) {
  return Array.isArray(actual) && actual.length === expected.length &&
    actual.every(value => typeof value === 'string') && new Set(actual).size === actual.length &&
    expected.every(value => actual.includes(value));
}
function clientContract(data, config) {
  requireThat(data.client_id === config.clientId && data.app_type === 'regular_web' && data.oidc_conformant === true);
  requireThat(sameStrings(data.grant_types, ['authorization_code']));
  requireThat(sameStrings(data.callbacks, [config.appOrigin + '/auth/callback']));
  requireThat(sameStrings(data.allowed_logout_urls, [config.appOrigin]) && sameStrings(data.web_origins, [config.appOrigin]));
  requireThat(data.token_endpoint_auth_method === 'client_secret_post');
  requireThat(data.jwt_configuration?.alg === 'RS256');
}
function apiContract(data, config) {
  requireThat(data.id === config.resourceServerId && data.identifier === config.audience && data.signing_alg === 'RS256');
  requireThat(data.allow_offline_access === false);
  for (const key of ['token_lifetime', 'token_lifetime_for_web']) {
    requireThat(Number.isSafeInteger(data[key]) && data[key] > 0 && data[key] <= 3600);
  }
}
function codeHash(code) {
  requireThat(typeof code === 'string' && code.length > 0 && Buffer.byteLength(code) <= MAX_BYTES);
  return createHash('sha256').update(code.replace(/\r\n/g, '\n').replace(/\n?$/, '\n')).digest('hex');
}
function actionContract(data, config, expectedCodeHash) {
  const version = data.deployed_version;
  requireThat(data.id === config.actionId && data.all_changes_deployed === true &&
    Array.isArray(data.supported_triggers) && data.supported_triggers.some(trigger => trigger.id === 'post-login'));
  requireThat(version?.action_id === config.actionId && UUID.test(version?.id || '') &&
    version.deployed === true && version.status === 'built' && version.runtime === 'node22');
  requireThat(Array.isArray(version.dependencies) && version.dependencies.length === 0);
  requireThat(Array.isArray(version.secrets) && version.secrets.some(secret => secret.name === 'EUBP_API_AUDIENCE'));
  requireThat(codeHash(version.code) === expectedCodeHash);
  return version.id;
}
function bindingContract(data, config, deployedVersionId) {
  requireThat(typeof deployedVersionId === 'string' && UUID.test(deployedVersionId));
  requireThat(data.total === 1 && data.page === 0 && Array.isArray(data.bindings) && data.bindings.length === 1);
  const binding = data.bindings[0];
  requireThat(binding.trigger_id === 'post-login' && binding.action?.id === config.actionId);
  requireThat(binding.action?.deployed_version?.id === deployedVersionId);
}
function factorContract(data) {
  const independent = new Set(['otp', 'webauthn-roaming', 'push-notification', 'sms', 'duo']);
  requireThat(Array.isArray(data) && data.length <= 50 && data.some(factor =>
    independent.has(factor.name) && factor.enabled === true &&
    (!Object.hasOwn(factor, 'trial_expired') || factor.trial_expired === false)));
}
function policyContract(data) { requireThat(sameStrings(data, ['all-applications'])); }
async function documentAt(config, relative, fetcher = fetch) {
  const url = new URL('/api/v2/' + relative, config.managementOrigin);
  requireThat(url.origin === config.managementOrigin && url.pathname.startsWith('/api/v2/'));
  const response = await fetcher(url, { method: 'GET', redirect: 'error', cache: 'no-store',
    signal: AbortSignal.timeout(10_000), headers: { accept: 'application/json', authorization: 'Bearer ' + config.token } });
  requireThat(response.status === 200 && response.body && /^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type') || ''));
  const declared = response.headers.get('content-length');
  requireThat(declared === null || /^\d+$/.test(declared) && Number(declared) <= MAX_BYTES);
  const reader = response.body.getReader(), chunks = []; let length = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      length += value.byteLength; requireThat(length <= MAX_BYTES); chunks.push(Buffer.from(value));
    }
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)));
}
function repositoryActionHash() { return codeHash(readFileSync(resolve(__dirname, '../../infra/auth0/post-login-action.cjs'), 'utf8')); }
async function run(env, fetcher = fetch) {
  const results = []; let config, expectedCodeHash, deployedVersionId;
  try { config = configuration(env); expectedCodeHash = repositoryActionHash(); results.push({ check: 'configuration', status: 'passed' }); }
  catch { results.push({ check: 'configuration', status: 'failed' }); }
  if (config && expectedCodeHash) {
    const clientFields = 'client_id,app_type,oidc_conformant,grant_types,callbacks,allowed_logout_urls,web_origins,token_endpoint_auth_method,jwt_configuration';
    const checks = [
      ['console_client', 'clients/' + config.clientId + '?include_fields=true&fields=' + clientFields, data => clientContract(data, config)],
      ['api_configuration', 'resource-servers/' + config.resourceServerId, data => apiContract(data, config)],
      ['deployed_action', 'actions/actions/' + config.actionId, data => { deployedVersionId = actionContract(data, config, expectedCodeHash); }],
      ['login_binding', 'actions/triggers/post-login/bindings?page=0&per_page=100', data => bindingContract(data, config, deployedVersionId)],
      ['mfa_factors', 'guardian/factors', factorContract],
      ['mfa_policy', 'guardian/policies', policyContract],
    ];
    for (const [check, relative, inspect] of checks) {
      try { inspect(await documentAt(config, relative, fetcher)); results.push({ check, status: 'passed' }); }
      catch { results.push({ check, status: 'failed' }); }
    }
  }
  return { schema: 'eubp.auth0-provider-configuration-audit.v1', inspectedAt: new Date().toISOString(),
    providerConfigurationChecksPassed: results.length === CHECKS.length + 1 && results.every(result => result.status === 'passed'),
    realProviderAcceptancePassed: false, customerLaunchApproved: false, registryRegistrationVerified: false,
    ...(expectedCodeHash ? { expectedActionCodeSha256: expectedCodeHash } : {}), results,
    requiredExternalEvidence: REQUIRED_REAL_EVIDENCE };
}
module.exports = { configuration, clientContract, apiContract, actionContract, bindingContract, factorContract, policyContract, codeHash, documentAt, run };
if (require.main === module) {
  if (process.argv.length !== 2) { console.error('Use environment configuration only; command-line arguments are not accepted.'); process.exitCode = 1; }
  else run(process.env).then(report => { console.log(JSON.stringify(report, null, 2)); process.exitCode = report.providerConfigurationChecksPassed ? 0 : 1; })
    .catch(() => { console.error('Auth0 configuration audit could not complete.'); process.exitCode = 1; });
}
