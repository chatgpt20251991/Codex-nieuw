'use strict';
const { resolve } = require('node:path');
const { readFileSync } = require('node:fs');
const root = resolve(__dirname, '../..');
try {
  if (process.env.NODE_ENV !== 'production') throw Error('Production only');
  const service = process.argv[2];
  if (service === 'api') {
    // Database privilege inspection is performed by PrismaService before listen.
    require(resolve(root, 'apps/api/dist/main.js'));
  } else if (service === 'web') {
    const { readAuth0Config } = require(resolve(root, '.ops/auth-config.js'));
    if (!readAuth0Config()) throw Error('Incomplete browser authentication');
    const { publicOrigins } = require('./build-origins.cjs');
    const expected = JSON.parse(readFileSync(resolve(root, '.ops/public-origins.json'), 'utf8'));
    const actual = publicOrigins(process.env);
    for (const key of Object.keys(actual)) if (expected[key] !== actual[key]) throw Error('Rebuild required');
    if (process.env.API_BASE_URL !== actual.NEXT_PUBLIC_API_URL) throw Error('Unexpected backend origin');
    const port = process.env.PORT || '3000';
    if (!/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535) throw Error('Invalid port');
    const next = require.resolve('next/dist/bin/next');
    process.argv = [process.execPath, next, 'start', resolve(root, 'apps/web'), '--hostname', '0.0.0.0', '--port', port];
    require(next);
  } else throw Error('Unknown service');
} catch {
  console.error('Service startup blocked: verify production configuration and matching build origins.');
  process.exitCode = 1;
}
