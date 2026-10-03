'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
require('reflect-metadata');
const { assertRuntimeDatabaseSecurity, RUNTIME_DATABASE_SECURITY_ERROR } = require('../../apps/api/dist/prisma/runtime-database-security');
const { PrismaService } = require('../../apps/api/dist/prisma/prisma.service');

test('database security inspection requires one explicit successful catalog result', async () => {
  let calls = 0;
  await assertRuntimeDatabaseSecurity({ $queryRaw: async () => { calls++; return [{ safe: true }]; } });
  assert.equal(calls, 1);
  for (const result of [undefined, null, {}, [], [{ safe: false }], [{ safe: null }], [{ safe: 'true' }], [{}], [null], [{ safe: true }, { safe: true }]]) {
    await assert.rejects(assertRuntimeDatabaseSecurity({ $queryRaw: async () => result }), { message: RUNTIME_DATABASE_SECURITY_ERROR });
  }
});

test('catalog failures do not expose database connection or driver details', async () => {
  await assert.rejects(assertRuntimeDatabaseSecurity({ $queryRaw: async () => {
    throw new Error('postgresql://synthetic-user:private-value@db.invalid/fixture');
  } }), error => error.message === RUNTIME_DATABASE_SECURITY_ERROR && error.cause === undefined);
});

test('production database startup disconnects and fails closed on connection or catalog failure', async () => {
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  try {
    for (const failure of ['connect', 'catalog', 'unsafe', 'disconnect']) {
      const calls = [];
      const client = {
        $connect: async () => { calls.push('connect'); if (failure === 'connect') throw new Error('private connection details'); },
        $queryRaw: async () => { calls.push('inspect'); if (failure === 'catalog') throw new Error('private catalog details'); return [{ safe: false }]; },
        $disconnect: async () => { calls.push('disconnect'); if (failure === 'disconnect') throw new Error('private cleanup details'); },
      };
      await assert.rejects(PrismaService.prototype.onModuleInit.call(client), { message: RUNTIME_DATABASE_SECURITY_ERROR });
      assert.deepEqual(calls, failure === 'connect' ? ['connect', 'disconnect'] : ['connect', 'inspect', 'disconnect']);
    }
  } finally {
    if (previous === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previous;
  }
});

test('successful production startup checks the connected role while development retains its isolated connection path', async () => {
  const previous = process.env.NODE_ENV;
  try {
    for (const mode of ['production', 'development', 'test']) {
      process.env.NODE_ENV = mode;
      const calls = [];
      const client = {
        $connect: async () => { calls.push('connect'); },
        $queryRaw: async () => { calls.push('inspect'); return [{ safe: true }]; },
        $disconnect: async () => { calls.push('disconnect'); },
      };
      await PrismaService.prototype.onModuleInit.call(client);
      assert.deepEqual(calls, mode === 'production' ? ['connect', 'inspect'] : ['connect']);
    }
  } finally {
    if (previous === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previous;
  }
});
