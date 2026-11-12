export const AUTHORISATION_GROUPS = [
  { name: 'Organisation and models', actions: [
    ['organisationRead', 'Read organisation details'], ['organisationWrite', 'Update Registry preparation details'],
    ['modelRead', 'Read models and model dossiers'], ['modelWrite', 'Create battery models'],
    ['applicabilityReview', 'Review conditional applicability'], ['itemRead', 'Read battery items and dossiers'], ['itemWrite', 'Create battery items'],
  ] },
  { name: 'Values and evidence', actions: [
    ['valueRead', 'Read values and provenance'], ['valueWrite', 'Create or supersede draft values'], ['valueReview', 'Validate or reject values'],
    ['evidenceRead', 'Read evidence metadata and extraction results'], ['evidenceWrite', 'Upload and link evidence'],
    ['evidenceReview', 'Review private documents and verify evidence'], ['evidenceExtract', 'Request evidence extraction'],
  ] },
  { name: 'Suppliers and publication', actions: [
    ['supplierRead', 'Read suppliers and requests'], ['supplierWrite', 'Create supplier requests'], ['supplierReview', 'Review supplier submissions'],
    ['complianceRead', 'Read definitions and calculate readiness'], ['passportRead', 'Read passports and download QR codes'],
    ['passportValidate', 'Run publication validation'], ['passportPublish', 'Publish new passport versions'],
    ['passportExport', 'Export private history across all access tiers'],
  ] },
  { name: 'Lifecycle and restricted access', actions: [
    ['lifecycleRead', 'Read lifecycle events'], ['lifecycleWrite', 'Record lifecycle events and telemetry'],
    ['accessGrantWrite', 'Create or revoke restricted-reader links'],
  ] },
  { name: 'EU Registry preparation', actions: [
    ['registryRead', 'Read Registry preparation and local results'], ['registryPrepare', 'Prepare local Registry drafts and exports'],
    ['registrySubmit', 'Request separately gated Registry submission'],
  ] },
] as const;

export type AuthorisationAction = typeof AUTHORISATION_GROUPS[number]['actions'][number][0];
const actions = new Set<string>(AUTHORISATION_GROUPS.flatMap(group => group.actions.map(([name]) => name)));
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const validUuid = (value: unknown): value is string => typeof value === 'string' && UUID.test(value);
const date = (value: unknown): value is string => typeof value === 'string'
  && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value));
const nullableDate = (value: unknown): value is string | null => value === null || date(value);
const object = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value));

export type Authorisation = {
  id: string; responsibleOperatorId: string; serviceProviderId: string;
  scopeJson: Partial<Record<AuthorisationAction, boolean>>; scopeValid: boolean;
  validFrom: string; validUntil: string | null; revokedAt: string | null; createdAt: string;
};
export type AuthorisationInput = {
  serviceProviderId: string; evidenceId: string; scope: Partial<Record<AuthorisationAction, boolean>>;
  validFrom: string; validUntil: string;
};
export type AuthorisationEvidence = { id: string; originalFilename: string; eligibleForAuthorisation: boolean };

export function parseAuthorisationEvidence(value: unknown): AuthorisationEvidence[] {
  if (!Array.isArray(value) || value.length > 100 || value.some(row => !object(row) || !validUuid(row.id)
    || (row.originalFilename !== null && (typeof row.originalFilename !== 'string' || row.originalFilename.length > 1000))
    || typeof row.eligibleForAuthorisation !== 'boolean')) throw new Error('AUTHORISATION_RESPONSE_INVALID');
  return value.map(row => ({ id: row.id, originalFilename: row.originalFilename || `Document ${row.id}`, eligibleForAuthorisation: row.eligibleForAuthorisation }));
}

export function validScope(value: unknown): value is Partial<Record<AuthorisationAction, boolean>> {
  if (!object(value)) return false;
  const entries = Object.entries(value);
  return entries.length > 0 && entries.some(([, allowed]) => allowed === true)
    && entries.every(([name, allowed]) => actions.has(name) && typeof allowed === 'boolean');
}

export function parseAuthorisation(value: unknown, organisationId: string): Authorisation {
  if (!validUuid(organisationId) || !object(value) || !validUuid(value.id)
    || value.responsibleOperatorId !== organisationId || !validUuid(value.serviceProviderId)
    || !date(value.validFrom) || !nullableDate(value.validUntil) || !nullableDate(value.revokedAt)
    || !date(value.createdAt) || typeof value.scopeValid !== 'boolean'
    || (value.scopeValid && !validScope(value.scopeJson))) {
    throw new Error('AUTHORISATION_RESPONSE_INVALID');
  }
  // Invalid historical grants remain visible for revocation, without rendering
  // arbitrary persisted JSON or treating legacy keys as current permissions.
  return { id: value.id, responsibleOperatorId: organisationId, serviceProviderId: value.serviceProviderId,
    scopeJson: value.scopeValid ? { ...value.scopeJson as Partial<Record<AuthorisationAction, boolean>> } : {}, scopeValid: value.scopeValid,
    validFrom: value.validFrom, validUntil: value.validUntil, revokedAt: value.revokedAt, createdAt: value.createdAt };
}

export function parseAuthorisations(value: unknown, organisationId: string): Authorisation[] {
  if (!Array.isArray(value) || value.length > 1000) throw new Error('AUTHORISATION_RESPONSE_INVALID');
  const rows = value.map(row => parseAuthorisation(row, organisationId));
  if (new Set(rows.map(row => row.id)).size !== rows.length) throw new Error('AUTHORISATION_RESPONSE_INVALID');
  return rows;
}

export function prepareAuthorisation(input: { serviceProviderId: string; evidenceId: string; selected: string[];
  validFrom: string; validUntil: string }, organisationId: string, now = Date.now()): AuthorisationInput {
  const provider = input.serviceProviderId.trim().toLowerCase(), evidence = input.evidenceId.trim().toLowerCase();
  const from = input.validFrom ? Date.parse(input.validFrom) : now, until = Date.parse(input.validUntil);
  if (!validUuid(organisationId) || !validUuid(provider) || provider === organisationId.toLowerCase() || !validUuid(evidence)) {
    throw new Error('AUTHORISATION_IDENTIFIERS_REQUIRED');
  }
  if (!Number.isFinite(from) || !Number.isFinite(until) || until <= from || until <= now) throw new Error('AUTHORISATION_INTERVAL_INVALID');
  if (!input.selected.length || new Set(input.selected).size !== input.selected.length || input.selected.some(name => !actions.has(name))) {
    throw new Error('AUTHORISATION_SCOPES_REQUIRED');
  }
  return { serviceProviderId: provider, evidenceId: evidence,
    scope: Object.fromEntries(input.selected.map(name => [name, true])),
    validFrom: new Date(from).toISOString(), validUntil: new Date(until).toISOString() };
}

export function authorisationStatus(row: Authorisation, now = Date.now()) {
  if (row.revokedAt) return 'Revoked';
  if (!row.scopeValid) return 'Review and reissue';
  if (row.validUntil && Date.parse(row.validUntil) <= now) return 'Expired';
  if (Date.parse(row.validFrom) > now) return 'Scheduled';
  return 'Active';
}

// Each request captures an epoch and signal. A completed request from an older
// refresh, identity or unmounted page must never restore its private data.
export function createAuthorisationRequests() {
  let epoch = 0, controller: AbortController | undefined;
  return {
    invalidate() { epoch++; controller?.abort(); controller = undefined; },
    start() {
      controller?.abort(); controller = new AbortController(); const current = ++epoch, signal = controller.signal;
      return { signal, current: () => current === epoch && !signal.aborted };
    },
  };
}
