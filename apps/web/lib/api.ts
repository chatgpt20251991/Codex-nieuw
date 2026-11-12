import { isOwnRequest, joinedSignals, type WorkspaceApi, type WorkspaceSnapshot } from './workspace';

export const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/v1';
const development = process.env.NODE_ENV === 'development';

export function authState() {
  if (!development || typeof window === 'undefined') return { token: '', actingOrg: '' };
  return { token: localStorage.getItem('eubp_token') || '', actingOrg: '' };
}
export class ApiResponseError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string) { super(message); this.name = 'ApiResponseError'; }
}

async function perform<T>(path: string, init: RequestInit, snapshot?: WorkspaceSnapshot, denied?: (error: ApiResponseError) => void, identityCheck?: () => Promise<void>, identityContext?: string): Promise<T> {
  await identityCheck?.();
  if (snapshot && !snapshot.isCurrent()) throw new Error('WORKSPACE_CHANGED');
  if (!path.startsWith('/') || path.startsWith('//')) throw new Error('Invalid API path.');
  // Never silently turn a customer action into an action on the provider itself.
  if (snapshot?.actingOrganisationId && isOwnRequest(path)) throw new Error('OWN_WORKSPACE_REQUIRED');
  const headers = new Headers(init.headers || {});
  headers.delete('authorization'); headers.delete('x-acting-organisation-id'); headers.delete('x-eubp-identity-context');
  if (development) {
    const { token } = authState();
    if (token) headers.set('authorization', `Bearer ${token}`);
  }
  if (snapshot?.actingOrganisationId) headers.set('x-acting-organisation-id', snapshot.actingOrganisationId);
  if (!development && identityContext) headers.set('x-eubp-identity-context', identityContext);
  if (init.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
  const signals = snapshot ? joinedSignals(snapshot.signal, init.signal) : { signal: init.signal, dispose() {} };
  try {
    const response = await fetch(`${development ? API_URL : '/api/backend'}${path}`, {
      ...init, headers, signal: signals.signal, credentials: development ? 'omit' : 'same-origin', mode: 'cors', cache: 'no-store', redirect: 'error',
    });
    if (snapshot && !snapshot.isCurrent()) throw new Error('WORKSPACE_CHANGED');
    const text = await response.text();
    await identityCheck?.();
    if (snapshot && !snapshot.isCurrent()) throw new Error('WORKSPACE_CHANGED');
    let data: any;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    if (!response.ok) {
      const code = typeof data?.code === 'string' && /^[A-Z][A-Z0-9_]{0,79}$/.test(data.code) ? data.code : '';
      const error = new ApiResponseError(response.status, code,
        typeof data?.message === 'string' ? data.message.slice(0, 500) : code || `HTTP ${response.status}`);
      if (!development && response.status === 401 && typeof window !== 'undefined') window.dispatchEvent(new Event('eubp-session-expired'));
      if ((response.status === 403 && ['NO_WRITTEN_AUTHORISATION', 'DELEGATION_NOT_ALLOWED'].includes(code))
        || (response.status === 409 && code === 'AUTH_CONTEXT_CHANGED')) denied?.(error);
      throw error;
    }
    return data;
  } finally { signals.dispose(); }
}

// Bootstrap/discovery requests have no acting header. Operator pages use the
// bound hook; arbitrary caller headers cannot substitute a customer here.
export function apiFetch<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  return perform<T>(path, init);
}

export function createApiFetch(snapshot: WorkspaceSnapshot, denied?: (error: ApiResponseError) => void, identityCheck?: () => Promise<void>, identityContext?: string): WorkspaceApi {
  const bound = <T = any>(path: string, init: RequestInit = {}) => perform<T>(path, init, snapshot, denied, identityCheck, identityContext);
  return Object.assign(bound, { signal: snapshot.signal, isCurrent: snapshot.isCurrent });
}
