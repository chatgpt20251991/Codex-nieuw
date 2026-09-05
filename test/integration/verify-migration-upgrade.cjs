const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const { mkdtempSync, mkdirSync, copyFileSync, readFileSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { resolve, join, sep, basename } = require('node:path');
const { spawn } = require('node:child_process');
const { Client } = require('pg');
const { PrismaClient } = require('@prisma/client');
const { hashJson } = require('../../apps/api/dist/common/crypto/canonical.js');
const root = resolve(__dirname, '../..');

// Separate from the fresh-install suite: apply the old migration, retain a
// published fixture, and then deploy the new migration with real Prisma history.
module.exports = async function verifyMigrationUpgrade(adminUrl) {
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(adminUrl.hostname) || adminUrl.pathname !== '/postgres') {
    throw new Error('Migration upgrade verification requires the dedicated local test cluster.');
  }
  const database = `eubp_upgrade_${randomBytes(8).toString('hex')}`;
  const tempRoot = resolve(tmpdir());
  const schemaDir = mkdtempSync(join(tempRoot, 'eubp-migration-'));
  const initial = '20260905000000_initial';
  mkdirSync(join(schemaDir, 'migrations', initial), { recursive: true });
  for (const file of ['schema.prisma', 'migrations/migration_lock.toml', `migrations/${initial}/migration.sql`]) {
    copyFileSync(join(root, 'apps/api/prisma', file), join(schemaDir, file));
  }
  const urlFor = (user, password) => {
    const url = new URL(adminUrl); url.pathname = `/${database}`;
    if (user) { url.username = user; url.password = password; }
    return url.toString();
  };
  const env = { ...process.env, CHECKPOINT_DISABLE: '1',
    DATABASE_URL: urlFor('eubp_runtime', 'eubp_runtime_local'),
    DIRECT_DATABASE_URL: urlFor('eubp_migrator', 'eubp_migrator_local') };
  const deploy = schema => new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'deploy', '--schema', schema],
      { cwd: root, env, windowsHide: true, stdio: 'inherit' });
    child.once('error', reject);
    child.once('exit', code => code === 0 ? resolve() : reject(new Error(`Upgrade migration exited with ${code}`)));
  });
  const control = new Client({ connectionString: adminUrl.toString() });
  let created = false, db, prisma;
  await control.connect();
  try {
    await control.query(`CREATE DATABASE "${database}" OWNER eubp_migrator`); created = true;
    db = new Client({ connectionString: urlFor() }); await db.connect();
    await db.query('REVOKE CREATE ON SCHEMA public FROM PUBLIC');
    await deploy(join(schemaDir, 'schema.prisma'));
    prisma = new PrismaClient({ datasources: { db: { url: urlFor() } } });
    const org = await prisma.organisation.create({ data: { legalName: 'Synthetic upgrade fixture', countryCode: 'NL' } });
    const legacyEvidenceId = require('node:crypto').randomUUID();
    await db.query('INSERT INTO "EvidenceObject" ("id", "organisationId", "objectKey", "evidenceType", "verificationStatus", "sha256", "updatedAt") VALUES ($1,$2,$3,$4,$5,$6,NOW())',
      [legacyEvidenceId, org.id, 'legacy-unscanned-fixture', 'test', 'verified', 'a'.repeat(64)]);
    const model = await prisma.batteryModel.create({ data: { organisationId: org.id, modelIdentifier: 'upgrade', category: 'EV' } });
    const item = await prisma.batteryItem.create({ data: { organisationId: org.id, modelId: model.id,
      serialOrItemIdentifier: 'upgrade-fixture', passportState: 'published' } });
    const canonicalJson = { schema: 'upgrade-test-fixture', battery: { id: item.id }, values: [] };
    const original = await prisma.passportVersion.create({ data: { organisationId: org.id, batteryItemId: item.id,
      versionNo: 1, ruleSetVersion: 'fixture', canonicalJson, sha256: hashJson(canonicalJson),
      publicationState: 'published', publishedAt: new Date() } });
    const policies = readFileSync(join(root, 'infra/postgres/001_rls.sql'), 'utf8');
    const grants = readFileSync(join(root, 'infra/postgres/002_runtime_grants.sql'), 'utf8');
    await db.query(policies); await db.query(grants);
    // Reproduce the old runtime grants before testing their removal.
    await db.query('GRANT UPDATE, DELETE ON "PassportVersion" TO eubp_runtime');
    assert.equal((await db.query(`SELECT has_table_privilege('eubp_runtime', '"PassportVersion"', 'UPDATE') AS allowed`)).rows[0].allowed, true);

    await deploy(join(root, 'apps/api/prisma/schema.prisma'));
    await db.query(policies); await db.query(grants);
    assert.equal((await db.query('SELECT count(*)::int AS count FROM "_prisma_migrations" WHERE finished_at IS NOT NULL')).rows[0].count, 3);
    assert.deepEqual(await prisma.passportVersion.findUniqueOrThrow({ where: { id: original.id } }), original);
    const legacyEvidence = await prisma.evidenceObject.findUniqueOrThrow({ where: { id: legacyEvidenceId } });
    assert.equal(legacyEvidence.verificationStatus, 'verified');
    for (const field of ['malwareScanSha256', 'malwareScannedAt', 'malwareScannerVersion', 'storageVersionId']) assert.equal(legacyEvidence[field], null, 'Upgrade must not fabricate scan evidence');
    for (const permission of ['UPDATE', 'DELETE']) {
      assert.equal((await db.query(`SELECT has_table_privilege('eubp_runtime', '"PassportVersion"', $1) AS allowed`, [permission])).rows[0].allowed, false);
    }
    // Administrator writes bypass RLS and grants, so these exercise the trigger.
    await assert.rejects(prisma.$executeRaw`UPDATE "PassportVersion" SET "sha256" = ${'0'.repeat(64)} WHERE "id" = ${original.id}`, /immutable/);
    await assert.rejects(prisma.$executeRaw`DELETE FROM "BatteryItem" WHERE "id" = ${item.id}`, /immutable/);
    assert.deepEqual(await prisma.passportVersion.findUniqueOrThrow({ where: { id: original.id } }), original);
    console.log('Gate 5 migration upgrade: PASS (existing version preserved; grants and cascade protections enforced)');
  } finally {
    if (prisma) await prisma.$disconnect();
    if (db) await db.end();
    if (created) await control.query(`DROP DATABASE "${database}" WITH (FORCE)`);
    await control.end();
    const target = resolve(schemaDir);
    if (!target.startsWith(tempRoot + sep) || !basename(target).startsWith('eubp-migration-')) {
      throw new Error('Refusing cleanup outside the generated migration fixture directory.');
    }
    rmSync(target, { recursive: true, force: true });
  }
};
