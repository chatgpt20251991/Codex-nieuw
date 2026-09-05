export const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/v1';
const development = process.env.NODE_ENV === 'development';

export function authState() {
  if (!development || typeof window === 'undefined') return { token: '', actingOrg: '' };
  return { token: localStorage.getItem('eubp_token') || '', actingOrg: localStorage.getItem('eubp_acting_org') || '' };
}

export async function apiFetch<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  if (!path.startsWith('/') || path.startsWith('//')) throw new Error('Invalid API path.');
  const headers = new Headers(init.headers || {});
  if (development) {
    const { token, actingOrg } = authState();
    if (token) headers.set('authorization', `Bearer ${token}`);
    if (actingOrg) headers.set('x-acting-organisation-id', actingOrg);
  } else {
    headers.delete('authorization');
  }
  if (init.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
  const response = await fetch(`${development ? API_URL : '/api/backend'}${path}`, {
    ...init, headers, credentials: development ? 'omit' : 'same-origin', cache: 'no-store',
  });
  const text = await response.text();
  let data: any;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!response.ok) {
    if (!development && response.status === 401) window.dispatchEvent(new Event('eubp-session-expired'));
    throw new Error(data?.message || data?.code || `HTTP ${response.status}`);
  }
  return data;
}
