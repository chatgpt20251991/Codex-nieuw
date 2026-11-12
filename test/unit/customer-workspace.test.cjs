'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.join(__dirname, '../..');
const compile = relative => ts.transpileModule(fs.readFileSync(path.join(root, relative), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const authorisations = {};
new Function('exports', compile('apps/web/lib/authorisations.ts'))(authorisations);
const workspace = {};
new Function('exports', 'require', compile('apps/web/lib/workspace.ts'))(workspace, name => {
  assert.equal(name, './authorisations'); return authorisations;
});
const apiSource = compile('apps/web/lib/api.ts');
function apiFixture(handler = () => new Response('{}', { headers: { 'content-type': 'application/json' } })) {
  const api = {}, calls = [], events = [];
  new Function('exports', 'require', 'fetch', 'process', 'window', 'localStorage', apiSource)(api, name => {
    assert.equal(name, './workspace'); return workspace;
  }, async (url, init) => { calls.push({ url, init }); return handler(url, init); },
  { env: { NODE_ENV: 'production' } }, { dispatchEvent: event => { events.push(event.type); return true; } },
  { getItem() { throw new Error('Production must not read persisted workspace or bearer data'); } });
  return { api, calls, events };
}
const ownId = '10000000-0000-4000-8000-000000000001';
const customerA = '20000000-0000-4000-8000-000000000002', customerB = '30000000-0000-4000-8000-000000000003';
const grantA = 'a0000000-0000-4000-8000-000000000001', grantA2 = 'b0000000-0000-4000-8000-000000000002';
const grantB = 'c0000000-0000-4000-8000-000000000003';
const now = Date.parse('2026-11-12T12:00:00.000Z');
const at = offset => new Date(now + offset).toISOString();
function grant({ id = grantA, customer = customerA, name = 'Synthetic customer A', permissions = ['modelRead'],
  validFrom = at(-3600000), validUntil = at(3600000) } = {}) {
  return { id, responsibleOperator: { id: customer, legalName: name, countryCode: 'nl' },
    availableActions: permissions, validFrom, validUntil };
}
function choices() {
  return workspace.parseCustomerWorkspaces([grant(), grant({ id: grantB, customer: customerB, name: 'Synthetic customer B' })], ownId, now);
}
function deferred() { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; }

test('discovery merges current grants per customer without implied permissions or retained private metadata', () => {
  const inputs = [grant(), grant({ id: grantA2, permissions: ['valueWrite'], validUntil: at(7200000) }),
    grant({ id: 'd0000000-0000-4000-8000-000000000004', permissions: ['passportPublish'], validUntil: at(0) }),
    grant({ id: 'e0000000-0000-4000-8000-000000000005', permissions: ['passportExport'], validFrom: at(1000) })];
  inputs[0].documentObjectKey = 'SYNTHETIC_PRIVATE_STORAGE'; inputs[0].responsibleOperator.contactEmail = 'private@example.invalid';
  const customers = workspace.parseCustomerWorkspaces(inputs, ownId, now);
  assert.equal(customers.length, 1); assert.equal(customers[0].id, customerA);
  assert.equal(customers[0].countryCode, 'NL'); assert.deepEqual(customers[0].availableActions, ['modelRead', 'valueWrite']);
  assert.equal(customers[0].nextExpiry, at(3600000)); assert.equal(customers[0].grants.length, 2);
  assert.equal(JSON.stringify(customers).includes('SYNTHETIC_PRIVATE_STORAGE'), false);
  assert.equal(JSON.stringify(customers).includes('private@example.invalid'), false);
  inputs[0].availableActions.push('passportPublish');
  assert.deepEqual(customers[0].availableActions, ['modelRead', 'valueWrite']);
  assert.deepEqual(customers[0].grants[0].availableActions, ['modelRead']);
  const later = workspace.currentCustomer(customers[0], now + 3600000);
  assert.deepEqual(later.availableActions, ['valueWrite']); assert.equal(later.availableActions.includes('valueRead'), false);
  assert.equal(workspace.currentCustomer(customers[0], now + 7200000), undefined);
});

test('discovery rejects malformed identifiers, scope names, intervals and conflicting customer identity', () => {
  for (const change of [{ id: 'unknown-customer-id' }, { availableActions: ['passportManagement'] },
    { availableActions: ['*'] }, { availableActions: [] }, { availableActions: ['modelRead', 'modelRead'] },
    { availableActions: ['modelRead', true] }, { validFrom: 'yesterday' }, { validUntil: undefined },
    { validFrom: at(3600000), validUntil: at(3600000) }, { responsibleOperator: { id: customerA, legalName: 'A', countryCode: 'Netherlands' } }]) {
    assert.throws(() => workspace.parseCustomerWorkspaces([{ ...grant(), ...change }], ownId, now), /WORKSPACE_RESPONSE_INVALID/);
  }
  assert.throws(() => workspace.parseCustomerWorkspaces([grant(), grant()], ownId, now), /WORKSPACE_RESPONSE_INVALID/);
  assert.throws(() => workspace.parseCustomerWorkspaces([grant(), grant({ id: grantA2, name: 'Conflicting name' })], ownId, now));
  const changedCountry = grant({ id: grantA2 }); changedCountry.responsibleOperator.countryCode = 'DE';
  assert.throws(() => workspace.parseCustomerWorkspaces([grant(), changedCountry], ownId, now));
  assert.throws(() => workspace.parseCustomerWorkspaces([grant({ customer: ownId })], ownId, now));
  assert.throws(() => workspace.parseCustomerWorkspaces(Array(1001).fill(grant()), ownId, now));
});

test('discovery identifies case variants of one UUID as a duplicate grant', () => {
  assert.throws(() => workspace.parseCustomerWorkspaces([grant(), grant({ id: grantA.toUpperCase() })], ownId, now), /WORKSPACE_RESPONSE_INVALID/);
});

test('only discovered current customers can activate and immutable contexts expire or abort on a switch', () => {
  let clock = now; const context = workspace.createWorkspaceContext(() => clock), selected = choices();
  for (const id of ['not-a-uuid', '40000000-0000-4000-8000-000000000004']) {
    assert.throws(() => context.activate(id, selected), /WORKSPACE_ACCESS_UNAVAILABLE/);
  }
  const first = context.activate(customerA, selected); assert.equal(first.isCurrent(), true); assert.equal(Object.isFrozen(first), true);
  const second = context.activate(customerB, selected); assert.equal(first.signal.aborted, true); assert.equal(first.isCurrent(), false);
  assert.equal(second.isCurrent(), true); assert.notEqual(first.epoch, second.epoch);
  clock += 3600000; assert.equal(second.isCurrent(), false);
  assert.throws(() => context.activate(customerA, selected), /WORKSPACE_ACCESS_UNAVAILABLE/);
  const own = context.activate(null); assert.equal(own.actingOrganisationId, null); assert.equal(own.isCurrent(), true);
  context.invalidate(); assert.equal(own.signal.aborted, true); assert.equal(own.isCurrent(), false);
});

test('an old A handler cannot start a POST after an awaited operation and a switch to B', async () => {
  const fixture = apiFixture(() => new Response('{"complete":true}'));
  const context = workspace.createWorkspaceContext(() => now), scopeA = context.activate(customerA, choices());
  const apiA = fixture.api.createApiFetch(scopeA);
  await apiA('/battery-models');
  const barrier = deferred();
  const continuation = (async () => { await barrier.promise; return apiA('/battery-models', { method: 'POST', body: '{"modelIdentifier":"old-A"}' }); })();
  const scopeB = context.activate(customerB, choices()); barrier.resolve();
  await assert.rejects(continuation, /WORKSPACE_CHANGED/);
  assert.equal(fixture.calls.length, 1); assert.equal(scopeA.signal.aborted, true);
  const apiB = fixture.api.createApiFetch(scopeB); await apiB('/battery-models');
  assert.equal(fixture.calls[1].init.headers.get('x-acting-organisation-id'), customerB);
});

test('late A headers or body cannot return A data even when a fetch implementation ignores abort', async () => {
  for (const stage of ['headers', 'body']) {
    const pending = deferred(), reading = deferred(), fetching = deferred();
    const fixture = apiFixture(() => {
      fetching.resolve();
      return stage === 'headers' ? pending.promise : {
        ok: true, status: 200, text() { reading.resolve(); return pending.promise; },
      };
    });
    const context = workspace.createWorkspaceContext(() => now), scopeA = context.activate(customerA, choices());
    const request = fixture.api.createApiFetch(scopeA)('/battery-models');
    await fetching.promise;
    if (stage === 'body') await reading.promise;
    context.activate(customerB, choices());
    const secret = '{"privateCustomer":"SYNTHETIC_A_SHOULD_NOT_ESCAPE"}';
    pending.resolve(stage === 'headers' ? new Response(secret) : secret);
    await assert.rejects(request, /WORKSPACE_CHANGED/); assert.equal(fixture.calls.length, 1);
  }
});

test('production own requests discard caller credentials and acting headers without reading persisted values', async () => {
  const fixture = apiFixture();
  await fixture.api.apiFetch('/organisations/current', { mode: 'no-cors', headers: { Authorization: 'Bearer stale-browser-value', 'x-acting-organisation-id': customerA } });
  const request = fixture.calls[0];
  assert.equal(request.url, '/api/backend/organisations/current'); assert.equal(request.init.headers.get('authorization'), null);
  assert.equal(request.init.headers.get('x-acting-organisation-id'), null); assert.equal(request.init.credentials, 'same-origin');
  assert.equal(request.init.cache, 'no-store'); assert.equal(request.init.redirect, 'error'); assert.equal(request.init.mode, 'cors');
  const own = workspace.createWorkspaceContext(() => now).activate(null);
  await fixture.api.createApiFetch(own)('/authorisations', { method: 'POST', headers: { 'x-acting-organisation-id': customerB }, body: '{}' });
  assert.equal(fixture.calls[1].init.headers.get('x-acting-organisation-id'), null);
});

test('customer-bound own-only operations reject before networking and never fall back to the provider', async () => {
  const fixture = apiFixture(), context = workspace.createWorkspaceContext(() => now);
  const apiB = fixture.api.createApiFetch(context.activate(customerB, choices()));
  for (const path of ['/authorisations', '/authorisations?limit=100', `/authorisations/${grantA}/revoke`,
    '/organisations/bootstrap', '/organisations/authorised-customers?limit=100']) {
    await assert.rejects(apiB(path, { method: 'POST', body: '{}' }), /OWN_WORKSPACE_REQUIRED/);
  }
  assert.equal(fixture.calls.length, 0);
});

test('delegation denials remain typed, notify once and are never retried as own-organisation mutations', async () => {
  const fixture = apiFixture(() => new Response('{"code":"NO_WRITTEN_AUTHORISATION","message":"Access ended"}', { status: 403 }));
  const context = workspace.createWorkspaceContext(() => now), denied = [];
  const apiA = fixture.api.createApiFetch(context.activate(customerA, choices()), error => { denied.push(error); context.invalidate(); });
  await assert.rejects(apiA('/battery-models', { method: 'POST', body: '{}' }), error => {
    assert.equal(error instanceof fixture.api.ApiResponseError, true); assert.equal(error.status, 403);
    assert.equal(error.code, 'NO_WRITTEN_AUTHORISATION'); return true;
  });
  assert.equal(denied.length, 1); assert.equal(fixture.calls.length, 1);
  assert.equal(fixture.calls[0].init.headers.get('x-acting-organisation-id'), customerA);
  await assert.rejects(apiA('/battery-models', { method: 'POST', body: '{}' }), /WORKSPACE_CHANGED/);
  assert.equal(fixture.calls.length, 1);
  const expired = apiFixture(() => new Response('{"message":"Session expired"}', { status: 401 }));
  await assert.rejects(expired.api.apiFetch('/battery-models'), error => error.status === 401);
  assert.deepEqual(expired.events, ['eubp-session-expired']);
});

test('joined request signals respond to either abort and dispose listeners from both sources', () => {
  for (const abortFirst of [true, false]) {
    const first = new AbortController(), second = new AbortController();
    const linked = workspace.joinedSignals(first.signal, second.signal);
    (abortFirst ? first : second).abort(); assert.equal(linked.signal.aborted, true); linked.dispose();
  }
  const first = new AbortController(), second = new AbortController(), removed = [];
  for (const [label, signal] of [['first', first.signal], ['second', second.signal]]) {
    const original = signal.removeEventListener;
    signal.removeEventListener = function (...args) { removed.push(label); return original.apply(this, args); };
  }
  const linked = workspace.joinedSignals(first.signal, second.signal); linked.dispose(); second.abort();
  assert.deepEqual(removed.sort(), ['first', 'second']); assert.equal(linked.signal.aborted, false);
  first.abort(); assert.equal(workspace.joinedSignals(first.signal, second.signal).signal.aborted, true);
});

test('bound API requests release both joined signal listeners after success or network failure', async () => {
  for (const succeeds of [true, false]) {
    const fixture = apiFixture(() => { if (!succeeds) throw new Error('Synthetic network failure'); return new Response('{}'); });
    const context = workspace.createWorkspaceContext(() => now), scope = context.activate(customerA, choices());
    const caller = new AbortController(), removed = [];
    for (const [label, signal] of [['workspace', scope.signal], ['caller', caller.signal]]) {
      const original = signal.removeEventListener;
      signal.removeEventListener = function (...args) { removed.push(label); return original.apply(this, args); };
    }
    const request = fixture.api.createApiFetch(scope)('/battery-models', { signal: caller.signal });
    if (succeeds) await request; else await assert.rejects(request, /Synthetic network failure/);
    assert.deepEqual(removed.sort(), ['caller', 'workspace']);
  }
});

test('a pending identity check blocks a new mutation until confirmed without replaying it', async () => {
  const fixture = apiFixture(() => new Response('{"created":true}'));
  const context = workspace.createWorkspaceContext(() => now), pending = deferred(); let checks = 0;
  const apiA = fixture.api.createApiFetch(context.activate(customerA, choices()), undefined, async () => { checks++; await pending.promise; });
  const request = apiA('/battery-models', { method: 'POST', body: '{"modelIdentifier":"new-A"}' });
  assert.equal(checks, 1); assert.equal(fixture.calls.length, 0);
  pending.resolve(); assert.deepEqual(await request, { created: true });
  assert.equal(checks, 2); assert.equal(fixture.calls.length, 1); assert.equal(fixture.calls[0].init.method, 'POST');
});

test('an identity check that invalidates its view prevents the pending mutation from reaching the network', async () => {
  const fixture = apiFixture(), context = workspace.createWorkspaceContext(() => now), pending = deferred();
  const apiA = fixture.api.createApiFetch(context.activate(customerA, choices()), undefined, async () => {
    await pending.promise; context.invalidate();
  });
  const request = apiA('/battery-models', { method: 'POST', body: '{"modelIdentifier":"must-not-send"}' });
  assert.equal(fixture.calls.length, 0); pending.resolve();
  await assert.rejects(request, /WORKSPACE_CHANGED/); assert.equal(fixture.calls.length, 0);
});

test('response payloads wait for the return identity check and are discarded when that identity changed', async () => {
  const fixture = apiFixture(() => new Response('{"privateData":"SYNTHETIC_A_MUST_NOT_RETURN"}'));
  const context = workspace.createWorkspaceContext(() => now), pending = deferred(), checkingReturn = deferred(); let checks = 0;
  const apiA = fixture.api.createApiFetch(context.activate(customerA, choices()), undefined, async () => {
    if (++checks === 2) { checkingReturn.resolve(); await pending.promise; }
  });
  const request = apiA('/battery-models'); await checkingReturn.promise;
  assert.equal(fixture.calls.length, 1); context.activate(customerB, choices()); pending.resolve();
  await assert.rejects(request, /WORKSPACE_CHANGED/); assert.equal(checks, 2); assert.equal(fixture.calls.length, 1);
});

test('all private pages bind their API calls while public and capability views have no workspace hook', () => {
  const privatePages = ['dashboard', 'models', 'passports', 'suppliers', 'evidence', 'authorisations', 'onboarding', 'registry', 'registry-onboarding'];
  for (const name of privatePages) {
    const filename = `apps/web/app/${name}/page.tsx`, source = fs.readFileSync(path.join(root, filename), 'utf8');
    const tree = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    let hookImports = 0, bindings = 0;
    const visit = node => {
      if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
        const imports = node.importClause?.namedBindings;
        if (imports && ts.isNamedImports(imports)) {
          if (node.moduleSpecifier.text.endsWith('/WorkspaceProvider')) hookImports += imports.elements.filter(item => item.name.text === 'useWorkspaceApi').length;
          if (node.moduleSpecifier.text.endsWith('/lib/api')) assert.equal(imports.elements.some(item => item.name.text === 'apiFetch'), false, filename);
        }
      }
      if (ts.isVariableDeclaration(node) && node.name.getText(tree) === 'apiFetch' && node.initializer
        && ts.isCallExpression(node.initializer) && node.initializer.expression.getText(tree) === 'useWorkspaceApi') bindings++;
      ts.forEachChild(node, visit);
    };
    visit(tree); assert.equal(hookImports, 1, filename); assert.equal(bindings, 1, filename);
  }
  for (const filename of ['apps/web/app/page.tsx', 'apps/web/app/access/page.tsx', 'apps/web/app/supplier/page.tsx',
    'apps/web/app/b/[publicId]/page.tsx', 'apps/web/app/b/[publicId]/not-found.tsx']) {
    const source = fs.readFileSync(path.join(root, filename), 'utf8');
    assert.equal(/useWorkspaceApi|WorkspaceProvider|WorkspaceSelector/.test(source), false, filename);
  }
});
