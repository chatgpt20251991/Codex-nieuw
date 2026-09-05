'use strict';

// Copy this complete, dependency-free source into an Auth0 Login/Post Login
// Action. Deploy and bind it to the login flow; see docs/22_AUTH0_SETUP.md.
const ORGANISATION_CLAIM = 'https://eubatterypassport.nl/organisation_id';
const ROLE_CLAIM = 'https://eubatterypassport.nl/role';
const ROLES = new Set(['operator_user', 'operator_admin', 'compliance_manager',
  'service_provider', 'service_provider_admin']);
// Application IDs are canonical lowercase UUIDs, not Auth0's org_* identifiers.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const owns = (object, key) => object !== null && typeof object === 'object' &&
  Object.prototype.hasOwnProperty.call(object, key);

exports.onExecutePostLogin = async (event, api) => {
  const audience = event?.secrets?.EUBP_API_AUDIENCE;
  if (typeof audience !== 'string' || !audience || audience.trim() !== audience) {
    return api.access.deny('EUBP_CONFIGURATION_REQUIRED');
  }
  // Do not add EUBP tenant/role claims to tokens for any other resource server.
  if (event.resource_server?.identifier !== audience) return;

  const metadata = event.user?.app_metadata;
  if (!owns(metadata, 'eubp_organisation_id') || !owns(metadata, 'eubp_role')) {
    return api.access.deny('EUBP_ACCESS_NOT_PROVISIONED');
  }
  const organisationId = metadata.eubp_organisation_id, role = metadata.eubp_role;
  if (typeof organisationId !== 'string' || !UUID.test(organisationId) ||
      typeof role !== 'string' || !ROLES.has(role)) {
    return api.access.deny('EUBP_ACCESS_NOT_PROVISIONED');
  }
  // Email is never an organisation selector or an account-linking key. When a
  // connection provides it, only a verified, nonempty email may enter this flow.
  if (owns(event.user, 'email') && (typeof event.user.email !== 'string' ||
      !event.user.email.trim() || event.user.email !== event.user.email.trim() ||
      event.user.email_verified !== true)) {
    return api.access.deny('EUBP_VERIFIED_EMAIL_REQUIRED');
  }

  // Only trusted administrator-controlled app_metadata supplies these claims.
  // Never read user_metadata, request parameters, native org_id or a default role.
  api.accessToken.setCustomClaim(ORGANISATION_CLAIM, organisationId);
  api.accessToken.setCustomClaim(ROLE_CLAIM, role);
  api.idToken.setCustomClaim(ORGANISATION_CLAIM, organisationId);
  api.idToken.setCustomClaim(ROLE_CLAIM, role);
};
