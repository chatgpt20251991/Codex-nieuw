'use strict';

require('reflect-metadata');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const { readFileSync, readdirSync } = require('node:fs');
const { resolve, join } = require('node:path');
const { Client } = require('pg');
const { PrismaClient } = require('@prisma/client');
const { PrismaService } = require('../../apps/api/dist/prisma/prisma.service.js');
const {
  assertRuntimeDatabaseSecurity,
  RUNTIME_DATABASE_SECURITY_ERROR,
} = require('../../apps/api/dist/prisma/runtime-database-security.js');

const root = resolve(__dirname, '../..');
const suffix = randomBytes(8).toString('hex');
const database = `eubp_guard_${suffix}`;
const loginRole = `${database}_login`;
const bridgeRole = `${database}_bridge`;
const generatedIdentifiers = new Set([database, loginRole, bridgeRole]);
const password = randomBytes(32).toString('hex');
const clients = [];
const createdRoles = [];
let adminUrl;
let control;
let isolatedAdmin;
let controlConnected = false;
let databaseCreated = false;
let mainRuntime;
let isolatedRuntime;
let isolatedMember;

function identifier(value) {
  assert(generatedIdentifiers.has(value) && /^[a-z0-9_]{1,63}$/.test(value),
    'Only generated fixture identifiers may be changed or removed');
  return `"${value}"`;
}

function databaseUrl(user, secret) {
  const url = new URL(adminUrl);
  url.pathname = `/${database}`;
  if (user) {
    url.username = user;
    url.password = secret;
  }
  return url.toString();
}

function prisma(url, Service = PrismaClient) {
  const parsed = new URL(url);
  parsed.searchParams.set('connection_limit', '1');
  parsed.searchParams.set('pool_timeout', '10');
  const client = new Service({ datasources: { db: { url: parsed.toString() } } });
  clients.push(client);
  return client;
}

async function rejected(client) {
  await assert.rejects(assertRuntimeDatabaseSecurity(client), error => {
    assert.equal(error.message, RUNTIME_DATABASE_SECURITY_ERROR);
    return true;
  });
}

async function inProduction(action) {
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  try { return await action(); }
  finally {
    if (previous === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previous;
  }
}

before(async () => {
  // Catalog damage is confined to one generated database in the disposable CI
  // PostgreSQL service. This suite never starts a local server or changes the
  // shared integration database's roles, grants, tables or policies.
  assert.equal(process.env.GITHUB_ACTIONS, 'true', 'Run against disposable GitHub CI PostgreSQL only');
  adminUrl = new URL(process.env.TEST_DATABASE_ADMIN_URL);
  assert(['localhost', '127.0.0.1', '[::1]'].includes(adminUrl.hostname));
  assert.equal(adminUrl.pathname, '/postgres');
  const runtimeUrl = new URL(process.env.DATABASE_URL);
  assert.equal(runtimeUrl.host, adminUrl.host);
  assert.match(runtimeUrl.pathname, /^\/eubp_test_[a-f0-9]{16}$/);
  control = new Client({ connectionString: adminUrl.toString() });
  await control.connect();
  controlConnected = true;
  const version = await control.query('SHOW server_version_num');
  assert(Number(version.rows[0].server_version_num) >= 160000);
  await control.query(`CREATE DATABASE ${identifier(database)} OWNER eubp_migrator`);
  databaseCreated = true;
  isolatedAdmin = new Client({ connectionString: databaseUrl() });
  await isolatedAdmin.connect();
  await isolatedAdmin.query('SET ROLE eubp_migrator');
  try {
    const migrations = resolve(root, 'apps/api/prisma/migrations');
    const names = readdirSync(migrations, { withFileTypes: true })
      .filter(entry => entry.isDirectory() && /^\d{14}_[a-z0-9_]+$/.test(entry.name))
      .map(entry => entry.name).sort();
    assert(names.length >= 3);
    for (const name of names) {
      await isolatedAdmin.query(readFileSync(join(migrations, name, 'migration.sql'), 'utf8'));
    }
  } finally { await isolatedAdmin.query('RESET ROLE'); }
  await isolatedAdmin.query(readFileSync(resolve(root, 'infra/postgres/001_rls.sql'), 'utf8'));
  await isolatedAdmin.query(readFileSync(resolve(root, 'infra/postgres/002_runtime_grants.sql'), 'utf8'));
  for (const role of [loginRole, bridgeRole]) {
    const login = role === loginRole ? `LOGIN PASSWORD '${password}'` : 'NOLOGIN';
    await control.query(`CREATE ROLE ${identifier(role)} ${login} NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`);
    createdRoles.push(role);
  }
  await control.query(`GRANT eubp_runtime TO ${identifier(loginRole)} WITH INHERIT TRUE`);
  mainRuntime = prisma(runtimeUrl.toString());
  isolatedRuntime = prisma(databaseUrl('eubp_runtime', 'eubp_runtime_local'));
  isolatedMember = prisma(databaseUrl(loginRole, password));
  await Promise.all([mainRuntime.$connect(), isolatedRuntime.$connect(), isolatedMember.$connect()]);
}, { timeout: 120000 });

after(async () => {
  const failures = [];
  async function attempt(action) {
    try { await action(); } catch (error) { failures.push(error); }
  }
  for (const client of clients) await attempt(() => client.$disconnect());
  if (isolatedAdmin) await attempt(() => isolatedAdmin.end());
  if (controlConnected) {
    if (databaseCreated) await attempt(() => control.query(`DROP DATABASE ${identifier(database)} WITH (FORCE)`));
    for (const role of createdRoles.reverse()) await attempt(() => control.query(`DROP ROLE ${identifier(role)}`));
    await attempt(() => control.end());
  }
  if (failures.length) throw new AggregateError(failures, 'Generated database security fixture cleanup failed');
});

test('runtime database guard accepts real least-privilege runtime and a safe delegated login', async () => {
  for (const client of [mainRuntime, isolatedRuntime, isolatedMember]) {
    await assert.doesNotReject(assertRuntimeDatabaseSecurity(client));
  }
  const identity = await mainRuntime.$queryRaw`SELECT CURRENT_USER::text AS current_role, SESSION_USER::text AS session_role`;
  assert.deepEqual(identity, [{ current_role: 'eubp_runtime', session_role: 'eubp_runtime' }]);
});

test('runtime database guard rejects actual superuser and migration-owner connections', async () => {
  for (const url of [process.env.TEST_ADMIN_DATABASE_URL, process.env.DIRECT_DATABASE_URL]) {
    const client = prisma(url);
    await client.$connect();
    await rejected(client);
  }
});

test('production Prisma lifecycle accepts runtime and disconnects an unsafe real connection before rejecting', async () => {
  const safe = prisma(process.env.DATABASE_URL, PrismaService);
  await inProduction(() => assert.doesNotReject(safe.onModuleInit()));
  assert.deepEqual(await safe.$queryRaw`SELECT 1 AS alive`, [{ alive: 1 }]);
  const unsafe = prisma(process.env.TEST_ADMIN_DATABASE_URL, PrismaService);
  const disconnect = unsafe.$disconnect.bind(unsafe);
  let disconnects = 0;
  let backendPid;
  unsafe.$disconnect = async () => {
    disconnects++;
    backendPid = (await unsafe.$queryRaw`SELECT pg_backend_pid() AS pid`)[0].pid;
    await disconnect();
  };
  try {
    await inProduction(() => assert.rejects(unsafe.onModuleInit(), { message: RUNTIME_DATABASE_SECURITY_ERROR }));
    assert.equal(disconnects, 1);
    assert(Number.isInteger(backendPid));
    const remaining = await control.query('SELECT count(*)::int AS count FROM pg_stat_activity WHERE pid = $1', [backendPid]);
    assert.equal(remaining.rows[0].count, 0);
  } finally { unsafe.$disconnect = disconnect; }
});

test('runtime database guard rejects dangerous attributes on a generated login', async () => {
  for (const [enable, disable] of [
    ['BYPASSRLS', 'NOBYPASSRLS'], ['CREATEROLE', 'NOCREATEROLE'],
    ['CREATEDB', 'NOCREATEDB'], ['REPLICATION', 'NOREPLICATION'],
  ]) {
    await control.query(`ALTER ROLE ${identifier(loginRole)} ${enable}`);
    try { await rejected(isolatedMember); }
    finally { await control.query(`ALTER ROLE ${identifier(loginRole)} ${disable}`); }
    await assert.doesNotReject(assertRuntimeDatabaseSecurity(isolatedMember));
  }
});

test('runtime database guard rejects role administration and SET ROLE followed by inherited server-file privileges', async () => {
  const login = identifier(loginRole);
  const bridge = identifier(bridgeRole);
  await control.query(`GRANT ${bridge} TO ${login} WITH ADMIN TRUE`);
  await control.query(`GRANT ${bridge} TO ${login} WITH SET FALSE`);
  try { await rejected(isolatedMember); }
  finally { await control.query(`REVOKE ${bridge} FROM ${login}`); }
  await assert.doesNotReject(assertRuntimeDatabaseSecurity(isolatedMember));

  // The dangerous role is neither inherited nor directly SET-reachable from
  // the login. It becomes inherited after SET ROLE to the generated bridge.
  await control.query(`GRANT pg_read_server_files TO ${bridge} WITH INHERIT TRUE`);
  await control.query(`GRANT pg_read_server_files TO ${bridge} WITH SET FALSE`);
  await control.query(`GRANT ${bridge} TO ${login} WITH INHERIT FALSE`);
  try {
    const direct = await isolatedMember.$queryRaw`SELECT pg_has_role(CURRENT_USER, 'pg_read_server_files', 'USAGE') AS inherited, pg_has_role(CURRENT_USER, 'pg_read_server_files', 'SET') AS settable`;
    assert.deepEqual(direct, [{ inherited: false, settable: false }]);
    await isolatedMember.$transaction(async tx => {
      await tx.$executeRawUnsafe(`SET LOCAL ROLE ${bridge}`);
      const inherited = await tx.$queryRaw`SELECT pg_has_role(CURRENT_USER, 'pg_read_server_files', 'USAGE') AS inherited`;
      assert.deepEqual(inherited, [{ inherited: true }]);
    });
    await rejected(isolatedMember);
  } finally {
    await control.query(`REVOKE ${bridge} FROM ${login}`);
    await control.query(`REVOKE pg_read_server_files FROM ${bridge}`);
  }
  await assert.doesNotReject(assertRuntimeDatabaseSecurity(isolatedMember));
});

test('runtime database guard detects committed RLS, policy and dangerous-grant damage confined to its isolated database', async () => {
  const changes = [
    ['ALTER TABLE "BatteryModel" DISABLE ROW LEVEL SECURITY', 'ALTER TABLE "BatteryModel" ENABLE ROW LEVEL SECURITY'],
    ['ALTER TABLE "BatteryModel" NO FORCE ROW LEVEL SECURITY', 'ALTER TABLE "BatteryModel" FORCE ROW LEVEL SECURITY'],
    ['ALTER POLICY tenant_isolation ON "BatteryModel" RENAME TO fixture_missing_policy', 'ALTER POLICY fixture_missing_policy ON "BatteryModel" RENAME TO tenant_isolation'],
    ['CREATE POLICY fixture_extra_policy ON "BatteryModel" USING (true)', 'DROP POLICY fixture_extra_policy ON "BatteryModel"'],
    ['ALTER POLICY resolver_read ON "PublicPassportSnapshot" TO PUBLIC', 'ALTER POLICY resolver_read ON "PublicPassportSnapshot" TO eubp_resolver'],
    ['GRANT TRUNCATE ON "BatteryModel" TO eubp_runtime', 'REVOKE TRUNCATE ON "BatteryModel" FROM eubp_runtime'],
    ['GRANT TRIGGER ON "BatteryModel" TO eubp_runtime', 'REVOKE TRIGGER ON "BatteryModel" FROM eubp_runtime'],
    ['GRANT CREATE ON SCHEMA public TO eubp_runtime', 'REVOKE CREATE ON SCHEMA public FROM eubp_runtime'],
    [`GRANT CREATE ON DATABASE ${identifier(database)} TO eubp_runtime`, `REVOKE CREATE ON DATABASE ${identifier(database)} FROM eubp_runtime`],
  ];
  for (const [damage, restore] of changes) {
    await isolatedAdmin.query(damage);
    try { await rejected(isolatedRuntime); }
    finally { await isolatedAdmin.query(restore); }
    await assert.doesNotReject(assertRuntimeDatabaseSecurity(isolatedRuntime));
  }
  await assert.doesNotReject(assertRuntimeDatabaseSecurity(mainRuntime));
});

test('runtime database guard rejects disabled row_security and a changed current role on real connections', async () => {
  await isolatedRuntime.$transaction(async tx => {
    await tx.$executeRaw`SET LOCAL row_security = off`;
    await rejected(tx);
  });
  await assert.doesNotReject(assertRuntimeDatabaseSecurity(isolatedRuntime));
  await isolatedMember.$transaction(async tx => {
    await tx.$executeRaw`SET LOCAL ROLE eubp_runtime`;
    const identity = await tx.$queryRaw`SELECT CURRENT_USER::text AS current_role, SESSION_USER::text AS session_role`;
    assert.notEqual(identity[0].current_role, identity[0].session_role);
    await rejected(tx);
  });
  await assert.doesNotReject(assertRuntimeDatabaseSecurity(isolatedMember));
});

test('production Prisma lifecycle disconnects and reports only the generic error on actual authentication failure', async () => {
  const client = prisma(databaseUrl(loginRole, `${password}-invalid`), PrismaService);
  const disconnect = client.$disconnect.bind(client);
  let disconnects = 0;
  client.$disconnect = async () => { disconnects++; await disconnect(); };
  try {
    await inProduction(() => assert.rejects(client.onModuleInit(), error => {
      assert.equal(error.message, RUNTIME_DATABASE_SECURITY_ERROR);
      assert(!error.message.includes(password));
      assert(!error.message.includes(loginRole));
      return true;
    }));
    assert.equal(disconnects, 1);
  } finally { client.$disconnect = disconnect; }
});
