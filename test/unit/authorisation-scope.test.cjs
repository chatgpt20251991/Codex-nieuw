'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readdirSync } = require('node:fs');
const { resolve } = require('node:path');
require('reflect-metadata');
const { Reflector } = require('@nestjs/core');
const { PATH_METADATA, METHOD_METADATA } = require('@nestjs/common/constants');
const { defer, lastValueFrom } = require('rxjs');
const { TenantGuard } = require('../../apps/api/dist/common/tenant/tenant.guard');
const { TenantDbService } = require('../../apps/api/dist/common/tenant/tenant-db.service');
const { DelegatedContextInterceptor } = require('../../apps/api/dist/common/tenant/delegated-context.interceptor');
const { delegatedContext } = require('../../apps/api/dist/common/tenant/delegated-context');
const { AUTHORISATION_SCOPE_KEY, AUTHORISATION_SCOPES, AuthorisationScopeSchema,
  permitsAuthorisationScope } = require('../../apps/api/dist/common/tenant/authorisation-scope.decorator');
const { IS_PUBLIC_KEY } = require('../../apps/api/dist/common/auth/public.decorator');
const { EvidenceController } = require('../../apps/api/dist/modules/evidence/evidence.controller');
const { AuthorisationsController } = require('../../apps/api/dist/modules/authorisations/authorisations.controller');

function fixture(scopes, { handler = EvidenceController.prototype.reviewDownload,
  controller = EvidenceController, ownTenant = false, grants } = {}) {
  const req = { actor: { organisationId: 'provider', subject: 'reviewer', role: 'service_provider_admin' },
    headers: ownTenant ? {} : { 'x-acting-organisation-id': 'customer' } };
  const calls = [];
  const context = { getHandler: () => handler, getClass: () => controller,
    switchToHttp: () => ({ getRequest: () => req }) };
  const db = { run: async (org, fn) => {
    assert.equal(org, 'provider');
    return fn({ writtenAuthorisation: { findMany: async query => {
      calls.push(query); return grants || [{ id: 'grant', scopeJson: scopes }];
    } } });
  } };
  return { guard: new TenantGuard(new Reflector(), db), req, calls, context };
}

test('all authenticated API handlers declare a named action or an explicit own-tenant policy', () => {
  const directory = resolve(__dirname, '../../apps/api/dist/modules');
  let reviewed = 0;
  for (const file of readdirSync(directory, { recursive: true }).filter(file => file.endsWith('.controller.js'))) {
    for (const controller of Object.values(require(resolve(directory, file)))) {
      if (typeof controller !== 'function' || !Reflect.hasMetadata(PATH_METADATA, controller)) continue;
      for (const name of Object.getOwnPropertyNames(controller.prototype)) {
        const handler = controller.prototype[name];
        if (typeof handler !== 'function' || !Reflect.hasMetadata(METHOD_METADATA, handler)) continue;
        const reflector = new Reflector();
        if (reflector.getAllAndOverride(IS_PUBLIC_KEY, [handler, controller])) continue;
        const scope = reflector.getAllAndOverride(AUTHORISATION_SCOPE_KEY, [handler, controller]);
        assert.ok(scope === null || AUTHORISATION_SCOPES.includes(scope), `${controller.name}.${name} needs an explicit policy`);
        reviewed++;
      }
    }
  }
  assert.ok(reviewed >= 50);
  assert.equal(Reflect.getMetadata(AUTHORISATION_SCOPE_KEY, EvidenceController.prototype.verify), 'evidenceReview');
});

test('grant creation accepts only explicit known Boolean actions and rejects wildcard/broad/malformed grants', () => {
  for (const scope of [{}, { evidenceReview: false }, { evidenceReview: 'true' }, { evidenceReview: 1 },
    { evidenceReview: null }, { evidenceReview: true, '*': true }, { passportManagement: true },
    { passportExport: { all: true } }, ['evidenceReview'], null]) {
    assert.equal(AuthorisationScopeSchema.safeParse(scope).success, false, JSON.stringify(scope));
  }
  assert.deepEqual(AuthorisationScopeSchema.parse({ modelRead: true, passportPublish: false }),
    { modelRead: true, passportPublish: false });
  assert.equal(permitsAuthorisationScope(Object.create({ evidenceReview: true }), 'evidenceReview'), false);
});

test('delegated access fails closed on absent, malformed, false, inherited or different action scopes', async () => {
  for (const scope of [{}, { evidenceReview: false }, { evidenceReview: 'true' }, { evidenceReview: 1 },
    { evidenceReview: true, wildcard: true }, { evidenceReview: null }, Object.create({ evidenceReview: true }),
    { passportPublish: true }, ['evidenceReview'], null]) {
    const f = fixture(scope);
    await assert.rejects(f.guard.canActivate(f.context), error => error.getStatus() === 403);
    assert.equal(Object.hasOwn(f.req, 'tenantOrganisationId'), false);
  }
});

test('one matching active grant is selected independently of unrelated or malformed active grants', async () => {
  const f = fixture(null, { grants: [{ id: 'malformed', scopeJson: { evidenceReview: true, broad: true } },
    { id: 'unrelated', scopeJson: { evidenceReview: false, modelRead: true } },
    { id: 'grant', scopeJson: { evidenceReview: true } }] });
  assert.equal(await f.guard.canActivate(f.context), true);
  const where = f.calls[0].where;
  assert.deepEqual(where.scopeJson, { path: ['evidenceReview'], equals: true });
  assert.equal(where.responsibleOperatorId, 'customer'); assert.equal(where.serviceProviderId, 'provider');
  assert.equal(where.revokedAt, null); assert.ok(where.validFrom.lte instanceof Date);
  assert.equal(where.OR[0].validUntil, null); assert.ok(where.OR[1].validUntil.gt instanceof Date);
  assert.equal(f.req.tenantOrganisationId, 'customer'); assert.equal(f.req.writtenAuthorisationId, 'grant');
  assert.equal(f.req.delegation.requiredScope, 'evidenceReview');
  assert.equal(f.req.delegation.actorSubject, 'reviewer');
});

test('new unannotated and authorisation-control handlers deny delegation while own-tenant guards stay unchanged', async () => {
  for (const options of [{ handler() {} }, { handler: AuthorisationsController.prototype.list,
    controller: AuthorisationsController }]) {
    const f = fixture({ evidenceReview: true }, options);
    await assert.rejects(f.guard.canActivate(f.context), error => error.getResponse().code === 'DELEGATION_NOT_ALLOWED');
    assert.equal(f.calls.length, 0);
  }
  const direct = fixture(null, { ownTenant: true });
  assert.equal(await direct.guard.canActivate(direct.context), true);
  assert.equal(direct.req.tenantOrganisationId, 'provider'); assert.equal(direct.calls.length, 0);
  assert.equal(direct.req.delegation, undefined);
});

function transactionFixture(grant = { scopeJson: { evidenceReview: true } }) {
  const calls = [], audits = [];
  const tx = { $executeRaw: async (...args) => calls.push(['rls', ...args]),
    $queryRaw: async (...args) => { calls.push(['lock', ...args]); return [{ id: 'grant' }]; },
    writtenAuthorisation: { findFirst: async query => { calls.push(['grant', query]); return grant; } },
    auditEvent: { create: async event => { audits.push(event); return event; } } };
  return { service: new TenantDbService({ $transaction: async work => work(tx) }), calls, audits };
}
const context = { authorisationId: 'grant', providerOrganisationId: 'provider', responsibleOrganisationId: 'customer',
  requiredScope: 'evidenceReview', actorSubject: 'reviewer', requestId: 'request', handler: 'EvidenceController.verify' };

test('customer transaction locks and rechecks the exact grant before tenant data, then audits actual action use', async () => {
  const f = transactionFixture();
  const result = await delegatedContext.run(context, () => f.service.run('customer', async () => { f.calls.push(['work']); return 42; }));
  assert.equal(result, 42);
  assert.deepEqual(f.calls.map(call => call[0]), ['rls', 'lock', 'grant', 'work']);
  assert.match(f.calls[1][1][0], /WrittenAuthorisation/); assert.match(f.calls[1][1].join(''), /FOR SHARE/);
  assert.equal(f.calls[2][1].where.id, 'grant'); assert.equal(f.calls[2][1].where.revokedAt, null);
  assert.ok(f.calls[2][1].where.validFrom.lte instanceof Date);
  assert.equal(f.audits[0].data.metadata.scope, 'evidenceReview');
  assert.equal(f.audits[0].data.resourceId, 'grant');
  assert.equal(f.audits[0].data.action, 'authorisation.scoped_transaction');
});

test('revocation or scope mutation between guard and transaction denies work, and another tenant cannot be substituted', async () => {
  for (const grant of [null, { scopeJson: { evidenceReview: false, modelRead: true } },
    { scopeJson: { evidenceReview: true, '*': true } }]) {
    const f = transactionFixture(grant);
    let touched = false;
    await assert.rejects(delegatedContext.run(context, () => f.service.run('customer', async () => { touched = true; })),
      error => error.getStatus() === 403);
    assert.equal(touched, false); assert.equal(f.audits.length, 0);
  }
  const f = transactionFixture();
  await assert.rejects(delegatedContext.run(context, () => f.service.run('another-customer', async () => 42)),
    error => error.getResponse().code === 'DELEGATED_TENANT_MISMATCH');
  assert.equal(f.calls.length, 0);
});

test('interceptor scopes observable subscription and async work without leaking between concurrent or own-tenant requests', async () => {
  const interceptor = new DelegatedContextInterceptor();
  const seen = [];
  const execute = delegation => lastValueFrom(interceptor.intercept({ switchToHttp: () => ({ getRequest: () => ({ delegation }) }) },
    { handle: () => defer(async () => {
      await new Promise(resolve => setTimeout(resolve, 5));
      seen.push(delegatedContext.getStore()?.authorisationId);
      return delegatedContext.getStore()?.authorisationId || 'own';
    }) }));
  assert.deepEqual(await Promise.all([execute({ ...context, authorisationId: 'first' }),
    execute(undefined), execute({ ...context, authorisationId: 'second' })]), ['first', 'own', 'second']);
  assert.deepEqual(new Set(seen), new Set(['first', undefined, 'second']));
  assert.equal(delegatedContext.getStore(), undefined);
});
