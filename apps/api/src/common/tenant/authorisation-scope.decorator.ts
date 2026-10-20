import { SetMetadata } from '@nestjs/common';
import { z } from 'zod';

export const AUTHORISATION_SCOPE_KEY = 'eubp:authorisationScope';
export const AUTHORISATION_SCOPES = [
  'organisationRead', 'organisationWrite', 'modelRead', 'modelWrite', 'applicabilityReview',
  'itemRead', 'itemWrite', 'valueRead', 'valueWrite', 'valueReview',
  'evidenceRead', 'evidenceWrite', 'evidenceReview', 'evidenceExtract',
  'supplierRead', 'supplierWrite', 'supplierReview', 'complianceRead',
  'passportRead', 'passportValidate', 'passportPublish', 'passportExport',
  'lifecycleRead', 'lifecycleWrite', 'accessGrantWrite',
  'registryRead', 'registryPrepare', 'registrySubmit',
] as const;
export type AuthorisationScope = typeof AUTHORISATION_SCOPES[number];
const scopeNames = new Set<string>(AUTHORISATION_SCOPES);

// No wildcard, nested grant, coercion or legacy broad passportManagement flag.
// Validate persisted grants too: old/malformed records never gain permissions.
export function isAuthorisationScopeRecord(value: unknown): value is Partial<Record<AuthorisationScope, boolean>> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const entries = Object.entries(value);
  return entries.length > 0 && entries.some(([, allowed]) => allowed === true) &&
    entries.every(([key, allowed]) => scopeNames.has(key) && typeof allowed === 'boolean');
}
export function permitsAuthorisationScope(value: unknown, scope: AuthorisationScope): boolean {
  return isAuthorisationScopeRecord(value) && Object.prototype.hasOwnProperty.call(value, scope) && value[scope] === true;
}
export const AuthorisationScopeSchema = z.record(z.string(), z.boolean()).refine(isAuthorisationScopeRecord,
  { message: 'Provide known Boolean action scopes, with at least one explicit permission. Wildcards are not supported.' });

// Every delegated handler must opt in to one named action. Unannotated/new
// handlers and explicit own-only routes fail closed for cross-tenant callers.
export const RequireAuthorisationScope = (scope: AuthorisationScope) => SetMetadata(AUTHORISATION_SCOPE_KEY, scope);
export const OwnTenantOnly = () => SetMetadata(AUTHORISATION_SCOPE_KEY, null);
