export const ACTOR_ROLES = ['operator_admin', 'operator_user', 'service_provider', 'compliance_manager', 'service_provider_admin'] as const;

export function httpsUrl(value: string | undefined, name: string): URL {
  if (!value || value.trim() !== value) throw new Error(name + ' must be an explicit HTTPS URL.');
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.hash) throw new Error(name + ' must use HTTPS without credentials or fragments.');
  return url;
}

export function boundedInteger(value: string | undefined, fallback: number, min: number, max: number, name: string) {
  if (value === undefined || value === '') return fallback;
  const number = Number(value);
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(number) || number < min || number > max) throw new Error(name + ' is outside its allowed range.');
  return number;
}

export function claimName(value: string | undefined, fallback: string) {
  const name = value || fallback;
  if (name.length > 256 || name.trim() !== name || ['__proto__', 'constructor', 'prototype', 'sub', 'iss', 'aud', 'exp', 'iat', 'nbf'].includes(name)) throw new Error('Invalid OIDC claim mapping.');
  return name;
}
