// Creates and drops only a uniquely named test database on an explicitly local cluster.
const { Client } = require('pg');
const { randomBytes } = require('node:crypto');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { spawn } = require('node:child_process');
const root = resolve(__dirname, '..');
const database = `eubp_test_${randomBytes(8).toString('hex')}`;
const adminUrl = new URL(process.env.TEST_DATABASE_ADMIN_URL || 'postgresql://postgres:eubp_integration_admin@127.0.0.1:55432/postgres');
if (!['127.0.0.1', 'localhost', '[::1]'].includes(adminUrl.hostname) || adminUrl.pathname !== '/postgres') {
  throw new Error('Integration tests require a local, dedicated PostgreSQL cluster and the /postgres admin database.');
}
function urlFor(user, password) {
  const url = new URL(adminUrl);
  url.pathname = `/${database}`;
  if (user) { url.username = user; url.password = password; }
  return url.toString();
}
const env = { ...process.env, NODE_ENV: 'test', AUTH_MODE: 'dev', CHECKPOINT_DISABLE: '1',
  DATABASE_URL: urlFor('eubp_runtime', 'eubp_runtime_local'),
  DIRECT_DATABASE_URL: urlFor('eubp_migrator', 'eubp_migrator_local'),
  TEST_ADMIN_DATABASE_URL: urlFor(),
  DEV_JWT_SECRET: randomBytes(32).toString('hex'),
  BATTERY_SEMANTIC_CATALOGUE_AVAILABLE: 'false', REGISTRY_BATTERY_SUBMISSION_AVAILABLE: 'false',
};
function run(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { cwd: root, env, stdio: 'inherit', windowsHide: true });
    child.once('error', reject);
    child.once('exit', code => code === 0 ? resolve() : reject(new Error(`${args[0]} exited with ${code}`)));
  });
}
async function main() {
  const admin = new Client({ connectionString: adminUrl.toString() });
  await admin.connect();
  let created = false;
  let db;
  let browserTrust;
  try {
    await admin.query(readFileSync(resolve(root, 'infra/postgres/000_roles.sql'), 'utf8'));
    await require('../test/integration/verify-migration-upgrade.cjs')(adminUrl);
    await require('../test/integration/verify-backup-restore.cjs')(adminUrl);
    await admin.query(`CREATE DATABASE "${database}" OWNER eubp_migrator`);
    created = true;
    db = new Client({ connectionString: urlFor() });
    await db.connect();
    await db.query('REVOKE CREATE ON SCHEMA public FROM PUBLIC');
    await run(['node_modules/prisma/build/index.js', 'migrate', 'deploy', '--schema', 'apps/api/prisma/schema.prisma']);
    await db.query(readFileSync(resolve(root, 'infra/postgres/001_rls.sql'), 'utf8'));
    await db.query(readFileSync(resolve(root, 'infra/postgres/002_runtime_grants.sql'), 'utf8'));
    // Re-applying the policy/grant pack must not fail or duplicate policies.
    await db.query(readFileSync(resolve(root, 'infra/postgres/001_rls.sql'), 'utf8'));
    await db.query(readFileSync(resolve(root, 'infra/postgres/002_runtime_grants.sql'), 'utf8'));
    browserTrust = require('../test/fixtures/browser-oidc.cjs').createBrowserTrust();
    env.TEST_BROWSER_TLS_DIRECTORY = browserTrust.directory;
    env.NODE_EXTRA_CA_CERTS = browserTrust.caFile;
    delete env.NODE_TLS_REJECT_UNAUTHORIZED;
    await run(['--test', '--test-concurrency=1', 'test/integration/tenant-isolation.test.cjs', 'test/integration/passport-disclosure.test.cjs', 'test/integration/evidence-integrity.test.cjs', 'test/integration/passport-lifecycle.test.cjs', 'test/integration/registry-contract.test.cjs', 'test/integration/oidc-auth.test.cjs', 'test/integration/malware-scanning.test.cjs', 'test/integration/web-security.test.cjs', 'test/integration/browser-login.test.cjs', 'test/integration/supplier-review-security.test.cjs']);
  } finally {
    try {
      if (db) await db.end();
      // Name is generated above; never accept a user-provided database deletion target.
      if (created) await admin.query(`DROP DATABASE "${database}" WITH (FORCE)`);
    } finally {
      try { await admin.end(); }
      finally { if (browserTrust) browserTrust.cleanup(); }
    }
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
