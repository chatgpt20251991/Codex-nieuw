import { createHash, randomBytes } from 'node:crypto';

export function canonicalize(value: unknown): string {
  // Hash the JSON representation that is actually persisted: omit undefined
  // object properties, use null for array holes and honour Date.toJSON().
  const json = JSON.stringify(value);
  if (json === undefined) throw new TypeError('A canonical hash requires a JSON value');
  const sort = (data: any): string => {
    if (data === null || typeof data !== 'object') return JSON.stringify(data);
    if (Array.isArray(data)) return `[${data.map(sort).join(',')}]`;
    return `{${Object.keys(data).sort().map(key => `${JSON.stringify(key)}:${sort(data[key])}`).join(',')}}`;
  };
  return sort(JSON.parse(json));
}

export function sha256Hex(value: string | Buffer) {
  return createHash('sha256').update(value).digest('hex');
}

export function hashJson(value: unknown) {
  return sha256Hex(canonicalize(value));
}

export function secureToken(bytes = 32) {
  return randomBytes(bytes).toString('base64url');
}
