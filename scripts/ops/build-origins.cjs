'use strict';
const { mkdirSync, writeFileSync } = require('node:fs');
const { resolve } = require('node:path');
function publicOrigins(env) {
  const values = {};
  for (const key of ['NEXT_PUBLIC_API_URL', 'NEXT_PUBLIC_EVIDENCE_UPLOAD_ORIGIN']) {
    const value = env[key]; const url = new URL(value);
    if (!value || value.trim() !== value || url.protocol !== 'https:' || url.username || url.password || url.search || url.hash
      || (key === 'NEXT_PUBLIC_API_URL' ? url.pathname !== '/v1' : url.origin !== value)) throw Error('Invalid public build origin');
    values[key] = value;
  }
  return values;
}
module.exports = { publicOrigins };
if (require.main === module) {
  try {
    const values = publicOrigins(process.env); const folder = resolve(__dirname, '../../.ops');
    mkdirSync(folder, { recursive: true });
    writeFileSync(resolve(folder, 'public-origins.json'), JSON.stringify(values) + '\n');
  } catch { console.error('Both exact HTTPS public build origins are required.'); process.exitCode = 1; }
}
