import { AUTHORISATION_GROUPS, type AuthorisationAction } from './authorisations';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const actions = new Set<string>(AUTHORISATION_GROUPS.flatMap(group => group.actions.map(([name]) => name)));
const object = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const date = (value: unknown): value is string => typeof value === 'string'
  && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value));
export const OPERATOR_PATHS = ['/dashboard', '/models', '/passports', '/suppliers', '/evidence', '/authorisations', '/registry', '/registry-onboarding', '/onboarding'];
export const isOperatorPath = (path: string) => OPERATOR_PATHS.includes(path);
export const isOwnWorkspacePath = (path: string) => path === '/authorisations' || path === '/onboarding';
export function workspaceNavigation(path: string, acting: boolean, granted: readonly string[]) {
  if (!acting) return OPERATOR_PATHS.includes(path);
  const requirements: Record<string, string[]> = { '/dashboard': [], '/authorisations': [], '/onboarding': [],
    '/models': ['modelRead'], '/passports': ['itemRead', 'modelRead', 'passportRead', 'complianceRead'],
    '/suppliers': ['supplierRead', 'modelRead'], '/evidence': ['evidenceRead'],
    '/registry': ['registryRead'], '/registry-onboarding': ['registryRead'] };
  return Object.hasOwn(requirements, path) && requirements[path].every(action => granted.includes(action));
}
export function isOwnRequest(path: string) {
  const pathname = path.split('?', 1)[0];
  return pathname === '/authorisations' || pathname.startsWith('/authorisations/')
    || pathname === '/organisations/bootstrap' || pathname === '/organisations/authorised-customers';
}

export type WorkspaceOrganisation = { id: string; legalName: string; countryCode: string };
export type WorkspaceGrant = { id: string; validFrom: string; validUntil: string | null; availableActions: AuthorisationAction[] };
export type CustomerWorkspace = WorkspaceOrganisation & { grants: WorkspaceGrant[]; availableActions: AuthorisationAction[]; nextExpiry: string | null };
export type WorkspaceSnapshot = Readonly<{ epoch: number; actingOrganisationId: string | null; signal: AbortSignal; isCurrent: () => boolean }>;
export type ApiRequest = <T = any>(path: string, init?: RequestInit) => Promise<T>;
export type WorkspaceApi = ApiRequest & { signal: AbortSignal; isCurrent: () => boolean };

export function parseWorkspaceOrganisation(value: unknown): WorkspaceOrganisation {
  if (!object(value) || typeof value.id !== 'string' || !UUID.test(value.id)
    || typeof value.legalName !== 'string' || !value.legalName.trim() || value.legalName.length > 1000
    || typeof value.countryCode !== 'string' || !/^[A-Za-z]{2}$/.test(value.countryCode)) throw new Error('WORKSPACE_RESPONSE_INVALID');
  return { id: value.id.toLowerCase(), legalName: value.legalName, countryCode: value.countryCode.toUpperCase() };
}

export function currentCustomer(value: CustomerWorkspace, now = Date.now()): CustomerWorkspace | undefined {
  const grants = value.grants.filter(grant => Date.parse(grant.validFrom) <= now && (!grant.validUntil || Date.parse(grant.validUntil) > now));
  if (!grants.length) return undefined;
  const availableActions = [...new Set(grants.flatMap(grant => grant.availableActions))].sort();
  const expires = grants.map(grant => grant.validUntil).filter((end): end is string => end !== null).sort((a, b) => Date.parse(a) - Date.parse(b));
  return { id: value.id, legalName: value.legalName, countryCode: value.countryCode,
    grants, availableActions, nextExpiry: expires[0] || null };
}

export function parseCustomerWorkspaces(value: unknown, ownId: string | null, now = Date.now()): CustomerWorkspace[] {
  if (!Array.isArray(value) || value.length > 1000) throw new Error('WORKSPACE_RESPONSE_INVALID');
  const customers = new Map<string, CustomerWorkspace>(), seen = new Set<string>();
  for (const row of value) {
    if (!object(row) || typeof row.id !== 'string' || !UUID.test(row.id) || seen.has(row.id.toLowerCase())
      || !date(row.validFrom) || !(row.validUntil === null || date(row.validUntil))
      || (row.validUntil !== null && Date.parse(row.validUntil) <= Date.parse(row.validFrom))
      || !Array.isArray(row.availableActions) || !row.availableActions.length || row.availableActions.length > actions.size
      || row.availableActions.some(action => typeof action !== 'string' || !actions.has(action))
      || new Set(row.availableActions).size !== row.availableActions.length) throw new Error('WORKSPACE_RESPONSE_INVALID');
    seen.add(row.id.toLowerCase());
    const organisation = parseWorkspaceOrganisation(row.responsibleOperator);
    if (organisation.id === ownId) throw new Error('WORKSPACE_RESPONSE_INVALID');
    const previous = customers.get(organisation.id);
    if (previous && (previous.legalName !== organisation.legalName || previous.countryCode !== organisation.countryCode)) throw new Error('WORKSPACE_RESPONSE_INVALID');
    const grant = { id: row.id.toLowerCase(), validFrom: row.validFrom, validUntil: row.validUntil,
      availableActions: [...row.availableActions] as AuthorisationAction[] };
    customers.set(organisation.id, { ...organisation, availableActions: [], nextExpiry: null, grants: [...(previous?.grants || []), grant] });
  }
  return [...customers.values()].map(customer => currentCustomer(customer, now)).filter((customer): customer is CustomerWorkspace => Boolean(customer))
    .sort((a, b) => a.legalName.localeCompare(b.legalName) || a.id.localeCompare(b.id));
}

export function customerFingerprint(customer: CustomerWorkspace | undefined) {
  if (!customer) return '';
  return JSON.stringify({ id: customer.id, legalName: customer.legalName, countryCode: customer.countryCode,
    grants: customer.grants.map(grant => ({ ...grant, availableActions: [...grant.availableActions].sort() })).sort((a, b) => a.id.localeCompare(b.id)) });
}

// One instance belongs to one mounted provider, never a server-global user store.
// Old clients retain their immutable epoch: they cannot start another request
// under a newly selected customer after an earlier awaited operation completes.
export function createWorkspaceContext(now: () => number = Date.now) {
  let epoch = 0, controller: AbortController | undefined;
  return {
    invalidate() { epoch++; controller?.abort(); controller = undefined; },
    activate(actingOrganisationId: string | null, choices: CustomerWorkspace[] = []): WorkspaceSnapshot {
      const customer = actingOrganisationId === null ? undefined : choices.find(row => row.id === actingOrganisationId);
      const current = customer ? currentCustomer(customer, now()) : undefined;
      if (actingOrganisationId !== null && (!UUID.test(actingOrganisationId) || !current)) throw new Error('WORKSPACE_ACCESS_UNAVAILABLE');
      controller?.abort(); const abort = new AbortController(); controller = abort; const selectedEpoch = ++epoch;
      const expires = current?.nextExpiry ? Date.parse(current.nextExpiry) : Infinity;
      return Object.freeze({ epoch: selectedEpoch, actingOrganisationId, signal: abort.signal,
        isCurrent: () => selectedEpoch === epoch && controller === abort && !abort.signal.aborted && now() < expires });
    },
  };
}

export function joinedSignals(first: AbortSignal, second?: AbortSignal | null) {
  if (!second || first === second) return { signal: first, dispose() {} };
  const controller = new AbortController(), abort = () => controller.abort();
  if (first.aborted || second.aborted) controller.abort();
  else { first.addEventListener('abort', abort, { once: true }); second.addEventListener('abort', abort, { once: true }); }
  return { signal: controller.signal, dispose() { first.removeEventListener('abort', abort); second.removeEventListener('abort', abort); } };
}
