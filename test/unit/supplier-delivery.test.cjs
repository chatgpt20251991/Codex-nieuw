'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID, createHash } = require('node:crypto');
require('reflect-metadata');
const { SuppliersController } = require('../../apps/api/dist/modules/suppliers/suppliers.controller');

function fixture({ status = 'draft', openedAt = null, expiresAt = new Date(Date.now() + 60000) } = {}) {
  const organisationId = randomUUID(), supplierId = randomUUID(), modelId = randomUUID();
  const request = { id: randomUUID(), organisationId, supplierId, modelId, tokenHash: 'a'.repeat(64),
    status, sentAt: null, openedAt, expiresAt,
    supplier: { legalName: 'Synthetic supplier' }, model: { modelIdentifier: 'TEST', category: 'EV' },
    fields: [{ fieldDefinitionId: 11 }], submissions: [] };
  const calls = { tenants: [], creates: [], updates: [], audits: [], supplierLookups: [], modelLookups: [], listQueries: [], detailQueries: [] };
  const tx = {
    $queryRaw: async () => [],
    supplier: { findFirstOrThrow: async query => { calls.supplierLookups.push(query); return request.supplier; } },
    batteryModel: { findFirstOrThrow: async query => { calls.modelLookups.push(query); return request.model; } },
    supplierRequest: {
      create: async query => {
        calls.creates.push(query);
        Object.assign(request, query.data, { fields: query.data.fields.create });
        return { ...request };
      },
      findMany: async query => { calls.listQueries.push(query); return [{ ...request }]; },
      findFirstOrThrow: async query => { calls.detailQueries.push(query); return request; },
      updateMany: async query => {
        calls.updates.push(query);
        Object.assign(request, query.data);
        return { count: 1 };
      },
    },
  };
  const tenantDb = { run: async (tenant, work) => { calls.tenants.push(tenant); return work(tx); } };
  const controller = new SuppliersController(tenantDb, { get: () => 'https://console.example/supplier' }, {},
    { log: async event => { calls.audits.push(event); } },
    { resolve: async () => ({ organisationId, request: { id: request.id } }) });
  return { controller, calls, request, tx, organisationId, supplierId, modelId };
}

test('supplier invitation persists only a hash and reports manual delivery as not sent', async () => {
  const f = fixture();
  const response = await f.controller.createRequest(f.organisationId, { subject: 'synthetic-actor' }, {
    supplierId: f.supplierId, modelId: f.modelId, fieldDefinitionIds: [11, 11, 26],
    organisationId: randomUUID(), expiresInDays: 2,
  });
  assert.equal(response.request.status, 'draft');
  assert.equal(response.request.sentAt, null);
  assert.equal(Object.hasOwn(response.request, 'tokenHash'), false);
  assert.deepEqual(response.delivery, { mode: 'manual_link', status: 'not_sent' });
  const url = new URL(response.inviteUrl);
  const raw = new URLSearchParams(url.hash.slice(1)).get('token');
  assert.ok(raw && raw.length >= 32);
  assert.equal(url.search, '');
  const stored = f.calls.creates[0].data;
  assert.equal(stored.tokenHash, createHash('sha256').update(raw).digest('hex'));
  assert.equal(stored.organisationId, f.organisationId);
  assert.equal(stored.sentAt, null);
  assert.deepEqual(stored.fields.create, [{ fieldDefinitionId: 11 }, { fieldDefinitionId: 26 }]);
  assert.deepEqual(f.calls.supplierLookups[0].where, { id: f.supplierId, organisationId: f.organisationId });
  assert.deepEqual(f.calls.modelLookups[0].where, { id: f.modelId, organisationId: f.organisationId });
  assert.ok(stored.expiresAt.getTime() > Date.now() + 86400000);
  assert.equal(JSON.stringify(f.calls.audits).includes(raw), false);
  assert.equal(JSON.stringify(f.calls.audits).includes(stored.tokenHash), false);
  assert.equal(f.calls.audits[0].action, 'supplier_request.create');
});

test('request listing strips hashes and remains scoped to the authenticated tenant', async () => {
  const f = fixture();
  const rows = await f.controller.listRequests(f.organisationId);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, f.request.id);
  assert.equal(Object.hasOwn(rows[0], 'tokenHash'), false);
  assert.equal(JSON.stringify(rows).includes(f.request.tokenHash), false);
  assert.deepEqual(f.calls.listQueries[0].where, { organisationId: f.organisationId });
  assert.deepEqual(f.calls.tenants, [f.organisationId]);
});

test('supplier review detail uses authenticated tenant scope and strips capability hashes', async () => {
  const f = fixture({ status: 'submitted' });
  f.request.submissions = [{ id: randomUUID(), fieldDefinitionId: 11, valueJson: 120, unit: 'Ah', evidence: [] }];
  const result = await f.controller.requestDetail(f.organisationId, f.request.id);
  assert.equal(result.submissions[0].valueJson, 120);
  assert.equal(Object.hasOwn(result, 'tokenHash'), false);
  assert.deepEqual(f.calls.detailQueries[0].where, { id: f.request.id, organisationId: f.organisationId });
  const selected = f.calls.detailQueries[0].include.submissions.include.evidence.include.evidence.select;
  assert.deepEqual(Object.keys(selected).sort(), ['evidenceType', 'id', 'originalFilename', 'verificationStatus']);
  assert.equal(JSON.stringify(result).includes(f.request.tokenHash), false);
});

test('new drafts and legacy sent requests open once without inventing sent timestamps', async () => {
  for (const status of ['draft', 'sent']) {
    const f = fixture({ status });
    const response = await f.controller.portalSession('synthetic-capability');
    assert.equal(response.requestId, f.request.id);
    assert.equal(f.request.status, 'opened');
    assert.ok(f.request.openedAt);
    assert.equal(f.request.sentAt, null);
    assert.equal(Object.hasOwn(response, 'tokenHash'), false);
    assert.equal(f.calls.updates[0].where.status, status);
    assert.equal(f.calls.updates[0].where.organisationId, f.organisationId);
    assert.ok(f.calls.updates[0].where.expiresAt.gt instanceof Date);
    const firstOpen = f.request.openedAt;
    await f.controller.portalSession('synthetic-capability');
    assert.equal(f.calls.updates.length, 1);
    assert.equal(f.request.openedAt, firstOpen);
  }
});

test('opening a submitted request preserves its submission state', async () => {
  const f = fixture({ status: 'submitted' });
  await f.controller.portalSession('synthetic-capability');
  assert.equal(f.request.status, 'submitted');
  assert.ok(f.request.openedAt);
  assert.equal(f.request.sentAt, null);
});

test('expired or closed supplier links cannot mutate their request', async () => {
  for (const options of [{ expiresAt: new Date(Date.now() - 1000) },
    { status: 'accepted' }, { status: 'cancelled' }, { status: 'expired' }]) {
    const f = fixture(options);
    await assert.rejects(f.controller.portalSession('synthetic-capability'), error => error.getStatus() === 410);
    assert.equal(f.calls.updates.length, 0);
  }
});

test('opening fails closed if the conditional write no longer matches', async () => {
  const f = fixture();
  f.tx.supplierRequest.updateMany = async () => ({ count: 0 });
  await assert.rejects(f.controller.portalSession('synthetic-capability'), error => error.getStatus() === 410);
  assert.equal(f.request.status, 'draft');
  assert.equal(f.request.openedAt, null);
});
