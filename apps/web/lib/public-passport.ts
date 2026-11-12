import 'server-only';
import { fields, publicFieldIds } from '@eubp/rules';
import { appOrigin, backendUrl, readBoundedBody } from './backend-policy';

export const MAX_PUBLIC_PASSPORT_BYTES = 512 * 1024;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const publicIds = new Set(publicFieldIds());
const names = new Map(fields.map(field => [field.id, field.name]));
const privateKeys = new Set(['organisationId', 'batteryItemId', 'modelId', 'evidenceId', 'evidenceIds',
  'evidenceLinks', 'canonicalJson', 'accessTier', 'access_tier', 'validationStatus', 'sourceKind',
  'objectKey', 'storageVersionId', 'registryIdentifier', 'registryState']);

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
export type PublicPassport = {
  battery: { publicId: string; modelIdentifier: string; serial: string; batch?: string; category?: string };
  ruleSetVersion?: string;
  generatedAt?: string;
  values: { fieldId: number; name: string; value: JsonValue; unit?: string }[];
};
export type PublicPassportResult = { status: 'ok'; passport: PublicPassport }
  | { status: 'not_found' | 'unavailable' };

function text(value: unknown, maximum: number) {
  return typeof value === 'string' && value.length > 0 && value.length <= maximum && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)
    ? value : undefined;
}

function publicValue(value: unknown, depth = 0): JsonValue {
  if (depth > 10) throw new Error('Invalid public value');
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.length <= 16000) return value;
  if (Array.isArray(value) && value.length <= 256) return value.map(entry => publicValue(entry, depth + 1));
  if (typeof value === 'object' && value && Object.getPrototypeOf(value) === Object.prototype) {
    const entries = Object.entries(value);
    if (entries.length > 256) throw new Error('Invalid public value');
    return Object.fromEntries(entries.filter(([key]) => !privateKeys.has(key) && !['__proto__', 'constructor', 'prototype'].includes(key))
      .map(([key, entry]) => [key, publicValue(entry, depth + 1)]));
  }
  throw new Error('Invalid public value');
}

// Re-project even the public API response. Stored field names or access-tier
// labels cannot make a restricted field public, and metadata is never copied.
export function projectPublicPassport(raw: unknown, expectedPublicId: string): PublicPassport | null {
  if (!uuid.test(expectedPublicId) || !raw || typeof raw !== 'object') return null;
  const data = raw as Record<string, any>;
  const battery = data.battery;
  if (!battery || typeof battery !== 'object' || typeof battery.publicId !== 'string'
    || battery.publicId.toLowerCase() !== expectedPublicId.toLowerCase()
    || !Array.isArray(data.values) || data.values.length > 71) return null;
  const modelIdentifier = text(battery.modelIdentifier, 240);
  const serial = text(battery.serial, 240);
  if (!modelIdentifier || !serial) return null;
  try {
    const seen = new Set<number>();
    const values: PublicPassport['values'] = [];
    for (const entry of data.values) {
      if (!entry || !Number.isInteger(entry.fieldId) || !publicIds.has(entry.fieldId)) continue;
      if (seen.has(entry.fieldId)) return null;
      seen.add(entry.fieldId);
      values.push({ fieldId: entry.fieldId, name: names.get(entry.fieldId)!, value: publicValue(entry.value), unit: text(entry.unit, 40) });
    }
    if (!values.length) return null;
    const generatedAt = text(data.generatedAt, 40);
    const ruleSetVersion = text(data.ruleSetVersion, 80);
    return {
      battery: { publicId: expectedPublicId.toLowerCase(), modelIdentifier, serial,
        batch: text(battery.batch, 240), category: text(battery.category, 40) },
      ...(generatedAt && Number.isFinite(Date.parse(generatedAt)) ? { generatedAt } : {}),
      ...(ruleSetVersion && /^[A-Za-z0-9_.:-]+$/.test(ruleSetVersion) ? { ruleSetVersion } : {}),
      values: values.sort((a, b) => a.fieldId - b.fieldId),
    };
  } catch { return null; }
}

export async function loadPublicPassport(publicId: string): Promise<PublicPassportResult> {
  if (!uuid.test(publicId)) return { status: 'not_found' };
  try {
    // Reuse the reviewed backend-origin checks, then fix the only reachable
    // route. The UUID can never supply an origin, path, query or fragment.
    const target = backendUrl(['battery-items'], '', appOrigin());
    if (!target) return { status: 'unavailable' };
    target.pathname = `/v1/public/b/${publicId.toLowerCase()}`;
    const response = await fetch(target, { method: 'GET', headers: { accept: 'application/json' },
      credentials: 'omit', cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(10000) });
    if (response.status === 404) return { status: 'not_found' };
    if (!response.ok || !/^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type') || '')) return { status: 'unavailable' };
    const declared = response.headers.get('content-length');
    if (declared && (!/^\d+$/.test(declared) || Number(declared) > MAX_PUBLIC_PASSPORT_BYTES)) return { status: 'unavailable' };
    const bytes = await readBoundedBody(response.body, MAX_PUBLIC_PASSPORT_BYTES);
    const data = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    const passport = projectPublicPassport(data, publicId);
    return passport ? { status: 'ok', passport } : { status: 'unavailable' };
  } catch { return { status: 'unavailable' }; }
}

export function displayPublicValue(value: PublicPassport['values'][number]['value']) {
  return value === null ? 'Not supplied' : typeof value === 'object' ? JSON.stringify(value) : String(value);
}
