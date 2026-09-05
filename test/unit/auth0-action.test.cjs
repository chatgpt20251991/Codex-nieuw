'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { onExecutePostLogin } = require('../../infra/auth0/post-login-action.cjs');

const audience = 'https://api.eubatterypassport.nl';
const organisationId = 'b13a59ab-8c6f-4e31-9cf2-427590f76b52';
function event() {
  return { secrets: { EUBP_API_AUDIENCE: audience }, resource_server: { identifier: audience },
    user: { user_id: 'auth0|synthetic-user', email: 'synthetic@example.invalid', email_verified: true,
      app_metadata: { eubp_organisation_id: organisationId, eubp_role: 'operator_user' } } };
}
async function execute(input) {
  const result = { denied: [], access: [], identity: [] };
  await onExecutePostLogin(input, { access: { deny: reason => result.denied.push(reason) },
    accessToken: { setCustomClaim: (key, value) => result.access.push([key, value]) },
    idToken: { setCustomClaim: (key, value) => result.identity.push([key, value]) } });
  return result;
}
function denied(result, reason) {
  assert.deepEqual(result, { denied: [reason], access: [], identity: [] });
}

test('Auth0 action: approved provisioning emits only the namespaced tenant and role', async () => {
  const input = event();
  input.organization = { id: 'org_nativeAuth0' };
  input.user.user_metadata = { eubp_organisation_id: 'forged', eubp_role: 'operator_admin' };
  input.request = { query: { organisation_id: 'forged', role: 'operator_admin' } };
  const result = await execute(input);
  assert.deepEqual(result.denied, []);
  assert.deepEqual(result.access, [
    ['https://eubatterypassport.nl/organisation_id', organisationId],
    ['https://eubatterypassport.nl/role', 'operator_user'],
  ]);
  assert.deepEqual(result.identity, result.access);
});
test('Auth0 action: every approved role is preserved without an administrator fallback', async () => {
  for (const role of ['operator_user', 'operator_admin', 'compliance_manager', 'service_provider', 'service_provider_admin']) {
    const input = event(); input.user.app_metadata.eubp_role = role;
    const result = await execute(input); assert.deepEqual(result.denied, []); assert.equal(result.access[1][1], role);
  }
});
test('Auth0 action: unrelated and missing audiences receive no EUBP claims', async () => {
  for (const resourceServer of [{ identifier: audience + '/other' }, { identifier: audience.toUpperCase() }, {}, undefined]) {
    const input = event(); input.resource_server = resourceServer; delete input.user;
    assert.deepEqual(await execute(input), { denied: [], access: [], identity: [] });
  }
});
test('Auth0 action: absent or invalid audience secret denies instead of silently granting access', async () => {
  for (const value of [undefined, '', ' ' + audience, 42]) {
    const input = event(); input.secrets.EUBP_API_AUDIENCE = value;
    denied(await execute(input), 'EUBP_CONFIGURATION_REQUIRED');
  }
});
test('Auth0 action: user metadata and inherited properties cannot supply provisioning', async () => {
  for (const metadata of [undefined, null, {}, Object.create({ eubp_organisation_id: organisationId, eubp_role: 'operator_admin' })]) {
    const input = event(); input.user.user_metadata = { eubp_organisation_id: organisationId, eubp_role: 'operator_admin' };
    input.user.app_metadata = metadata;
    denied(await execute(input), 'EUBP_ACCESS_NOT_PROVISIONED');
  }
});
test('Auth0 action: native Auth0 organisation IDs, malformed UUIDs and unknown roles are denied', async () => {
  for (const value of ['org_nativeAuth0', '00000000-0000-0000-0000-000000000000', organisationId.toUpperCase(),
    organisationId + ' ', 42, [organisationId]]) {
    const input = event(); input.user.app_metadata.eubp_organisation_id = value;
    denied(await execute(input), 'EUBP_ACCESS_NOT_PROVISIONED');
  }
  for (const role of [undefined, '', 'admin', 'operator_admin ', ['operator_admin'], null]) {
    const input = event(); input.user.app_metadata.eubp_role = role;
    denied(await execute(input), 'EUBP_ACCESS_NOT_PROVISIONED');
  }
});
test('Auth0 action: provided email must be verified with a boolean true', async () => {
  for (const verified of [undefined, false, 'true', 1]) {
    const input = event(); input.user.email_verified = verified;
    denied(await execute(input), 'EUBP_VERIFIED_EMAIL_REQUIRED');
  }
  for (const email of ['', ' ', null, 42, ' synthetic@example.invalid']) {
    const input = event(); input.user.email = email;
    denied(await execute(input), 'EUBP_VERIFIED_EMAIL_REQUIRED');
  }
});
test('Auth0 action: email-free enterprise identities use explicit provisioning without inventing email', async () => {
  const input = event(); delete input.user.email; delete input.user.email_verified;
  const result = await execute(input); assert.deepEqual(result.denied, []);
  assert.equal(result.access.length, 2); assert.ok(result.access.every(([key]) => !key.includes('email')));
});
