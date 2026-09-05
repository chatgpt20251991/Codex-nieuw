const assert = require('node:assert/strict');
const { randomBytes, randomUUID, createHash } = require('node:crypto');
const { mkdtempSync, readFileSync, openSync, closeSync, createReadStream, fstatSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { resolve, join, relative, isAbsolute, basename } = require('node:path');
const { spawn, execFile } = require('node:child_process');
const { pipeline } = require('node:stream/promises');
const { promisify } = require('node:util');
const { Client } = require('pg');
const { PrismaClient } = require('@prisma/client');
const { hashJson } = require('../../apps/api/dist/common/crypto/canonical.js');

const root = resolve(__dirname, '../..');
const execute = promisify(execFile);
const quoteIdentifier = identifier => `"${identifier.replace(/"/g, '""')}"`;

async function run(command, args, { env, inputStream, stdout = 'inherit' } = {}) {
  const child = spawn(command, args, { cwd: root, env, windowsHide: true, timeout: 120000,
    stdio: [inputStream ? 'pipe' : 'ignore', stdout, 'pipe'] });
  let stderr = '';
  child.stderr.on('data', bytes => { stderr = (stderr + bytes).slice(-10000); });
  const exited = new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', code => code === 0 ? resolve() : reject(new Error(`${command} failed (${code}): ${stderr}`)));
  });
  try {
    if (inputStream) await Promise.all([exited, pipeline(inputStream, child.stdin)]);
    else await exited;
  } catch (error) {
    if (child.exitCode === null && child.signalCode === null) child.kill();
    await exited.catch(() => {});
    throw error;
  }
}

async function fileSha256(fd) {
  const hash = createHash('sha256');
  // Explicit positions use pread: each hash begins at byte zero independently
  // of the dump writer's shared offset. Never reopen a path.
  for await (const bytes of createReadStream('', { fd, autoClose: false, start: 0 })) hash.update(bytes);
  return hash.digest('hex');
}

async function databaseShape(db) {
  const tables = (await db.query(`SELECT c.relname AS name, pg_get_userbyid(c.relowner) AS owner,
    c.relrowsecurity AS rls, c.relforcerowsecurity AS force_rls
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind='r' ORDER BY c.relname`)).rows;
  for (const table of tables) table.rows = (await db.query(`SELECT count(*)::int AS count FROM ${quoteIdentifier(table.name)}`)).rows[0].count;
  const policies = (await db.query(`SELECT tablename, policyname, permissive, roles::text[], cmd, qual, with_check
    FROM pg_policies WHERE schemaname='public' ORDER BY tablename, policyname`)).rows;
  return { tables, policies };
}

async function seed(prisma) {
  const fixtures = [];
  for (const name of ['A', 'B']) {
    const organisation = await prisma.organisation.create({ data: { legalName: `Synthetic restore tenant ${name}`, countryCode: 'NL' } });
    const model = await prisma.batteryModel.create({ data: { organisationId: organisation.id,
      modelIdentifier: `synthetic-restore-${name}`, category: 'EV' } });
    const item = await prisma.batteryItem.create({ data: { organisationId: organisation.id, modelId: model.id,
      serialOrItemIdentifier: `synthetic-restore-item-${name}`, passportState: 'published',
      upi: `https://id.example.invalid/b/${randomUUID()}` } });
    const versions = [];
    for (let number = 1; number <= (name === 'A' ? 2 : 1); number++) {
      // Persistence fixtures only: deliberately not claimed to be API-validated
      // battery passports or proof that real evidence objects have been restored.
      const canonicalJson = { schema: 'synthetic-backup-fixture.v1', ruleSetVersion: 'restore-fixture',
        battery: { id: item.id, publicId: item.publicId, serial: item.serialOrItemIdentifier, upi: item.upi },
        values: [{ fieldId: 11, value: 100 + number, accessTier: 'public' },
          { fieldId: 50, value: `private-restored-${name}-${number}`, accessTier: 'authority_only' }] };
      const version = await prisma.passportVersion.create({ data: { organisationId: organisation.id, batteryItemId: item.id,
        versionNo: number, schemaVersion: 'synthetic-backup-fixture.v1', ruleSetVersion: 'restore-fixture',
        canonicalJson, sha256: hashJson(canonicalJson), previousVersionHash: versions.at(-1)?.sha256 ?? null,
        publicationState: 'published', publishedAt: new Date() } });
      versions.push(version);
    }
    const latest = versions.at(-1);
    const publicJson = { schema: 'synthetic-backup-public.v1', battery: { publicId: item.publicId, upi: item.upi },
      values: latest.canonicalJson.values.filter(value => value.accessTier === 'public') };
    const snapshot = await prisma.publicPassportSnapshot.create({ data: { organisationId: organisation.id,
      batteryItemId: item.id, passportVersionId: latest.id, publicId: item.publicId, upi: item.upi,
      publicJson, sha256: hashJson(publicJson), active: true } });
    await prisma.auditEvent.create({ data: { organisationId: organisation.id, actorSubject: 'synthetic-restore-fixture',
      action: 'backup.fixture_seed', resourceType: 'passport_version', resourceId: latest.id,
      metadata: { synthetic: true, versionHash: latest.sha256 } } });
    fixtures.push({ organisation, model, item, versions, snapshot });
  }
  return fixtures;
}

module.exports = async function verifyBackupRestore(inputUrl) {
  const adminUrl = new URL(inputUrl);
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(adminUrl.hostname) || adminUrl.pathname !== '/postgres' ||
      !['postgres:', 'postgresql:'].includes(adminUrl.protocol)) {
    throw new Error('Backup verification requires the dedicated loopback test cluster and /postgres control database.');
  }
  const container = process.env.TEST_POSTGRES_CONTAINER || '';
  if (!/^[a-f0-9]{12,64}$/.test(container)) {
    throw new Error('TEST_POSTGRES_CONTAINER must identify the existing disposable PostgreSQL service container.');
  }
  const suffix = randomBytes(8).toString('hex');
  const sourceName = `eubp_backup_source_${suffix}`, restoredName = `eubp_backup_restored_${suffix}`;
  const allowedNames = new Set([sourceName, restoredName]), created = [];
  const scratch = mkdtempSync(join(tmpdir(), 'eubp-backup-'));
  const archive = join(scratch, 'synthetic-passports.dump');
  const username = decodeURIComponent(adminUrl.username);
  const dockerEnv = { ...process.env, PGPASSWORD: decodeURIComponent(adminUrl.password) };
  const dockerArgs = (command, args, interactive = false) => ['exec', ...(interactive ? ['--interactive'] : []),
    '--env', 'PGPASSWORD', '--user', 'postgres', container, command, ...args];
  const databaseArgs = database => ['--host', '127.0.0.1', '--port', '5432', '--username', username, '--dbname', database];
  const urlFor = (database, user, password) => {
    if (!allowedNames.has(database)) throw new Error('Unexpected backup fixture database name.');
    const url = new URL(adminUrl); url.pathname = `/${database}`;
    if (user) { url.username = user; url.password = password; }
    return url.toString();
  };
  const control = new Client({ connectionString: adminUrl.toString() });
  let controlConnected = false, sourceDb, restoredDb, sourcePrisma, restoredPrisma, runtime;
  const started = Date.now();
  try {
    await control.connect(); controlConnected = true;
    const running = await execute('docker', ['inspect', '--format', '{{json .State.Running}}', container],
      { cwd: root, windowsHide: true, timeout: 10000 });
    assert.equal(running.stdout.trim(), 'true', 'The explicitly selected PostgreSQL fixture must already be running.');
    const serverVersion = (await control.query('SHOW server_version_num')).rows[0].server_version_num;
    assert.equal(Math.floor(Number(serverVersion) / 10000), 16, 'The restore drill currently targets PostgreSQL 16.');
    for (const command of ['pg_dump', 'pg_restore']) {
      const version = await execute('docker', dockerArgs(command, ['--version']),
        { cwd: root, env: dockerEnv, windowsHide: true, timeout: 10000 });
      assert.match(version.stdout, new RegExp(`^${command} \\(PostgreSQL\\) 16\\.`));
    }
    // A container ID alone is insufficient: ensure Docker and the administrator
    // URL reach the exact same server before creating or dumping any database.
    const hostSystem = (await control.query('SELECT system_identifier::text AS id FROM pg_control_system()')).rows[0].id;
    const containerSystem = await execute('docker', dockerArgs('psql', [...databaseArgs('postgres'),
      '--no-psqlrc', '--tuples-only', '--no-align', '--set', 'ON_ERROR_STOP=1',
      '--command', 'SELECT system_identifier::text FROM pg_control_system()']),
    { cwd: root, env: dockerEnv, windowsHide: true, timeout: 10000 });
    assert.equal(containerSystem.stdout.trim(), hostSystem, 'Container and administrator URL must address the same test cluster.');
    const roles = (await control.query(`SELECT rolname, rolsuper, rolbypassrls, rolcreaterole, rolcreatedb, rolcanlogin
      FROM pg_roles WHERE rolname = ANY($1::text[]) ORDER BY rolname`, [['eubp_migrator', 'eubp_resolver', 'eubp_runtime']])).rows;
    assert.equal(roles.length, 3, 'Provision the committed test roles before this drill.');
    for (const role of roles) {
      assert.equal(role.rolsuper, false); assert.equal(role.rolbypassrls, false);
      assert.equal(role.rolcreaterole, false); assert.equal(role.rolcreatedb, false);
    }
    assert.equal(roles.find(role => role.rolname === 'eubp_resolver').rolcanlogin, false);

    await control.query(`CREATE DATABASE ${quoteIdentifier(sourceName)} OWNER eubp_migrator TEMPLATE template0`); created.push(sourceName);
    sourceDb = new Client({ connectionString: urlFor(sourceName) }); await sourceDb.connect();
    await sourceDb.query('REVOKE CREATE ON SCHEMA public FROM PUBLIC');
    await run(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'deploy', '--schema', 'apps/api/prisma/schema.prisma'],
      { env: { ...process.env, CHECKPOINT_DISABLE: '1', DATABASE_URL: urlFor(sourceName, 'eubp_runtime', 'eubp_runtime_local'),
        DIRECT_DATABASE_URL: urlFor(sourceName, 'eubp_migrator', 'eubp_migrator_local') } });
    await sourceDb.query(readFileSync(join(root, 'infra/postgres/001_rls.sql'), 'utf8'));
    await sourceDb.query(readFileSync(join(root, 'infra/postgres/002_runtime_grants.sql'), 'utf8'));
    sourcePrisma = new PrismaClient({ datasources: { db: { url: urlFor(sourceName) } } });
    const fixtures = await seed(sourcePrisma);
    const expectedShape = await databaseShape(sourceDb);
    assert.ok(expectedShape.tables.length >= 29);
    const tenantTables = expectedShape.tables.filter(table => !['RegulatoryRuleSet', 'FieldDefinition', '_prisma_migrations'].includes(table.name));
    assert.ok(tenantTables.length >= 27);
    assert.ok(tenantTables.every(table => table.rls && table.force_rls));
    assert.ok(expectedShape.tables.every(table => table.owner === 'eubp_migrator'));

    // Keep the exclusively created inode open throughout the operation. A path
    // replacement cannot substitute a different archive between dump and restore.
    const archiveFd = openSync(archive, 'wx+', 0o600);
    let dumpBytes, dumpSha256;
    try {
      await run('docker', dockerArgs('pg_dump', [...databaseArgs(sourceName), '--format=custom']),
        { env: dockerEnv, stdout: archiveFd });
      dumpBytes = fstatSync(archiveFd).size;
      assert.ok(dumpBytes > 0, 'The backup archive must contain bytes.');
      dumpSha256 = await fileSha256(archiveFd);
      await control.query(`CREATE DATABASE ${quoteIdentifier(restoredName)} OWNER eubp_migrator TEMPLATE template0`); created.push(restoredName);
      await run('docker', dockerArgs('pg_restore', [...databaseArgs(restoredName), '--exit-on-error', '--single-transaction'], true),
        { env: dockerEnv, inputStream: createReadStream('', { fd: archiveFd, autoClose: false, start: 0 }) });
      assert.equal(await fileSha256(archiveFd), dumpSha256, 'Restoration must not modify the opened backup archive.');
    }
    finally { closeSync(archiveFd); }
    restoredDb = new Client({ connectionString: urlFor(restoredName) }); await restoredDb.connect();
    restoredPrisma = new PrismaClient({ datasources: { db: { url: urlFor(restoredName) } } });
    // Do not reapply migrations, policies or grants after restore: that would
    // hide a backup that omitted the security configuration being tested.
    assert.deepEqual(await databaseShape(restoredDb), expectedShape);
    for (const fixture of fixtures) {
      assert.deepEqual(await restoredPrisma.organisation.findUniqueOrThrow({ where: { id: fixture.organisation.id } }), fixture.organisation);
      assert.deepEqual(await restoredPrisma.batteryModel.findUniqueOrThrow({ where: { id: fixture.model.id } }), fixture.model);
      assert.deepEqual(await restoredPrisma.batteryItem.findUniqueOrThrow({ where: { id: fixture.item.id } }), fixture.item);
      const versions = await restoredPrisma.passportVersion.findMany({ where: { batteryItemId: fixture.item.id }, orderBy: { versionNo: 'asc' } });
      assert.deepEqual(versions, fixture.versions);
      for (const [index, version] of versions.entries()) {
        assert.equal(version.sha256, hashJson(version.canonicalJson));
        assert.equal(version.previousVersionHash, versions[index - 1]?.sha256 ?? null);
      }
      const snapshot = await restoredPrisma.publicPassportSnapshot.findUniqueOrThrow({ where: { id: fixture.snapshot.id } });
      assert.deepEqual(snapshot, fixture.snapshot); assert.equal(snapshot.sha256, hashJson(snapshot.publicJson));
    }

    runtime = new Client({ connectionString: urlFor(restoredName, 'eubp_runtime', 'eubp_runtime_local') }); await runtime.connect();
    const tenantQuery = async (organisationId, sql, parameters) => {
      await runtime.query('BEGIN');
      try {
        if (organisationId) await runtime.query("SELECT set_config('app.current_org_id', $1, true)", [organisationId]);
        return await runtime.query(sql, parameters);
      } finally { await runtime.query('ROLLBACK'); }
    };
    const [a, b] = fixtures;
    assert.equal((await runtime.query('SELECT current_user')).rows[0].current_user, 'eubp_runtime');
    assert.equal((await tenantQuery(null, 'SELECT id FROM "PassportVersion"')).rowCount, 0);
    assert.equal((await tenantQuery(a.organisation.id, 'SELECT id FROM "PassportVersion" WHERE "batteryItemId" = $1', [a.item.id])).rowCount, 2);
    assert.equal((await tenantQuery(a.organisation.id, 'SELECT id FROM "PassportVersion" WHERE "batteryItemId" = $1', [b.item.id])).rowCount, 0);
    assert.equal((await tenantQuery(a.organisation.id, 'UPDATE "BatteryModel" SET "name" = $1 WHERE id = $2 RETURNING id',
      ['forbidden cross-tenant change', b.model.id])).rowCount, 0);
    await assert.rejects(tenantQuery(a.organisation.id,
      'INSERT INTO "BatteryModel" (id, "organisationId", "modelIdentifier", category, "createdAt", "updatedAt") VALUES ($1, $2, $3, \'EV\', now(), now())',
      [randomUUID(), b.organisation.id, 'forbidden-cross-tenant-model']), { code: '42501' });
    for (const permission of ['UPDATE', 'DELETE']) {
      assert.equal((await restoredDb.query('SELECT has_table_privilege(\'eubp_runtime\', \'"PassportVersion"\', $1) AS allowed', [permission])).rows[0].allowed, false);
      assert.equal((await restoredDb.query('SELECT has_table_privilege(\'eubp_runtime\', \'"AuditEvent"\', $1) AS allowed', [permission])).rows[0].allowed, false);
    }
    await assert.rejects(tenantQuery(a.organisation.id, 'UPDATE "PassportVersion" SET sha256 = $1 WHERE id = $2', ['0'.repeat(64), a.versions[0].id]), { code: '42501' });
    await assert.rejects(restoredDb.query('UPDATE "PassportVersion" SET sha256 = $1 WHERE id = $2', ['0'.repeat(64), a.versions[0].id]), { code: '23514' });
    await assert.rejects(restoredDb.query('DELETE FROM "BatteryItem" WHERE id = $1', [a.item.id]), { code: '23514' });
    assert.deepEqual(await restoredPrisma.passportVersion.findUniqueOrThrow({ where: { id: a.versions[0].id } }), a.versions[0]);
    const publicRead = (await runtime.query('SELECT get_public_passport_snapshot($1) AS passport', [a.item.publicId])).rows[0].passport;
    assert.deepEqual(publicRead, a.snapshot.publicJson);
    assert.ok(!JSON.stringify(publicRead).includes('private-restored-'));
    const resolver = (await restoredDb.query(`SELECT pg_get_userbyid(proowner) AS owner, prosecdef
      FROM pg_proc WHERE oid='get_public_passport_snapshot(text)'::regprocedure`)).rows[0];
    assert.equal(resolver.owner, 'eubp_resolver'); assert.equal(resolver.prosecdef, true);
    await assert.rejects(runtime.query('SET ROLE eubp_migrator'), { code: '42501' });
    await assert.rejects(runtime.query('SELECT * FROM "_prisma_migrations"'), { code: '42501' });
    const result = { kind: 'synthetic_database_restore', passed: true, dumpBytes, dumpSha256,
      publishedVersions: fixtures.reduce((count, fixture) => count + fixture.versions.length, 0), elapsedMs: Date.now() - started };
    console.log(`Gate 7 backup/restore: PASS (${result.publishedVersions} immutable versions, ${tenantTables.length} tenant tables; RLS, grants and public resolver preserved)`);
    return result;
  } finally {
    if (runtime) await runtime.end();
    if (restoredPrisma) await restoredPrisma.$disconnect();
    if (sourcePrisma) await sourcePrisma.$disconnect();
    if (restoredDb) await restoredDb.end();
    if (sourceDb) await sourceDb.end();
    if (controlConnected) {
      for (const database of created.reverse()) {
        if (!allowedNames.has(database) || !/^eubp_backup_(source|restored)_[a-f0-9]{16}$/.test(database)) {
          throw new Error('Refusing cleanup of an unexpected backup fixture database.');
        }
        await control.query(`DROP DATABASE ${quoteIdentifier(database)} WITH (FORCE)`);
      }
      await control.end();
    }
    const target = resolve(scratch), insideTemp = relative(resolve(tmpdir()), target);
    if (!insideTemp || insideTemp.startsWith('..') || isAbsolute(insideTemp) || !basename(target).startsWith('eubp-backup-')) {
      throw new Error('Refusing cleanup outside the generated backup fixture directory.');
    }
    rmSync(target, { recursive: true, force: true });
  }
};
