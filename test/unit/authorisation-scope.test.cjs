'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
require('reflect-metadata');
const { Reflector } = require('@nestjs/core');
const { TenantGuard } = require('../../apps/api/dist/common/tenant/tenant.guard');
const { AUTHORISATION_SCOPE_KEY } = require('../../apps/api/dist/common/tenant/authorisation-scope.decorator');
const { EvidenceController } = require('../../apps/api/dist/modules/evidence/evidence.controller');

function fixture(scopeJson, { handler = EvidenceController.prototype.reviewDownload, ownTenant = false } = {}) {
  const req = { actor: { organisationId: 'provider', role: 'service_provider_admin' },
    headers: ownTenant ? {} : { 'x-acting-organisation-id': 'customer' } };
  const calls = [];
  const context = { getHandler: () => handler, getClass: () => EvidenceController,
    switchToHttp: () => ({ getRequest: () => req }) };
  const db = { run: async (org, fn) => {
    assert.equal(org, 'provider');
    return fn({ writtenAuthorisation: { findFirst: async query => { calls.push(query); return { id: 'grant', scopeJson }; } } });
  } };
  return { guard: new TenantGuard(new Reflector(), db), req, calls, context };
}

test('sensitive download explicitly opts in while legacy verification has no new scope contract', () => {
  assert.equal(Reflect.getMetadata(AUTHORISATION_SCOPE_KEY, EvidenceController.prototype.reviewDownload), 'evidenceReview');
  assert.equal(Reflect.hasMetadata(AUTHORISATION_SCOPE_KEY, EvidenceController.prototype.verify), false);
});

test('delegated review requires a strict own Boolean rather than a missing, false, string or inherited scope', async () => {
  for (const scope of [{}, { evidenceReview: false }, { evidenceReview: 'true' }, { evidenceReview: 1 },
    { evidenceReview: null }, Object.create({ evidenceReview: true }), ['evidenceReview'], null]) {
    const f = fixture(scope);
    await assert.rejects(f.guard.canActivate(f.context), error => error.getStatus() === 403);
    assert.equal(Object.hasOwn(f.req, 'tenantOrganisationId'), false);
  }
});

test('matching delegated scope is filtered before selecting an active authorisation', async () => {
  const f = fixture({ evidenceReview: true });
  assert.equal(await f.guard.canActivate(f.context), true);
  const where = f.calls[0].where;
  assert.deepEqual(where.scopeJson, { path: ['evidenceReview'], equals: true });
  assert.equal(where.responsibleOperatorId, 'customer'); assert.equal(where.serviceProviderId, 'provider');
  assert.equal(where.revokedAt, null); assert.ok(where.validFrom.lte instanceof Date);
  assert.equal(where.OR[0].validUntil, null); assert.ok(where.OR[1].validUntil.gt instanceof Date);
  assert.equal(f.req.tenantOrganisationId, 'customer'); assert.equal(f.req.writtenAuthorisationId, 'grant');
});

test('direct own-tenant access needs no delegated grant and unannotated routes keep existing semantics', async () => {
  const direct = fixture(null, { ownTenant: true });
  assert.equal(await direct.guard.canActivate(direct.context), true);
  assert.equal(direct.req.tenantOrganisationId, 'provider'); assert.equal(direct.calls.length, 0);
  const legacy = fixture({}, { handler: EvidenceController.prototype.verify });
  assert.equal(await legacy.guard.canActivate(legacy.context), true);
  assert.equal(Object.hasOwn(legacy.calls[0].where, 'scopeJson'), false);
});
