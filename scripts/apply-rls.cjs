const { Client } = require('pg');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
if (!process.env.DATABASE_ADMIN_URL) throw new Error('Set DATABASE_ADMIN_URL for the administrative policy/grant step.');
async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_ADMIN_URL });
  await client.connect();
  try {
    await client.query('BEGIN');
    for (const file of ['001_rls.sql', '002_runtime_grants.sql']) {
      await client.query(readFileSync(resolve(__dirname, '../infra/postgres', file), 'utf8'));
    }
    await client.query('COMMIT');
    console.log('RLS policies and runtime/resolver grants applied.');
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { await client.end(); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
