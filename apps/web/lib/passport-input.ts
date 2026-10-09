export type ValueKind = 'text' | 'number' | 'boolean' | 'structured';

export function parsePassportInput(input: string, kind: ValueKind): unknown {
  if (!input.trim()) throw new Error('Enter a value.');
  if (kind === 'text') return input.trim();
  if (kind === 'number') {
    if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(input.trim())) throw new Error('Enter a number using a decimal point.');
    const value = Number(input);
    if (!Number.isFinite(value)) throw new Error('Enter a finite number.');
    return value;
  }
  if (kind === 'boolean') {
    if (!['true', 'false'].includes(input)) throw new Error('Select yes or no.');
    return input === 'true';
  }
  let value: unknown;
  try { value = JSON.parse(input); } catch { throw new Error('Structured data must be valid JSON.'); }
  if (value === null || typeof value !== 'object') throw new Error('Use an object or list for structured data.');
  return value;
}

export function publicPassportLink(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  try {
    const url = new URL(value);
    if (url.username || url.password || url.protocol !== 'https:') return undefined;
    return url.href;
  } catch { return undefined; }
}
