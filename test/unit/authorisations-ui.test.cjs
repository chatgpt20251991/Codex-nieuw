'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.join(__dirname, '../..');
const source = fs.readFileSync(path.join(root, 'apps/web/lib/authorisations.ts'), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const ui = {}; new Function('exports', compiled)(ui);
const owner = '10000000-0000-4000-8000-000000000001', provider = '20000000-0000-4000-8000-000000000002';
const evidence = '30000000-0000-4000-8000-000000000003', id = '40000000-0000-4000-8000-000000000004';
const now = Date.parse('2026-11-12T12:00:00.000Z');
const row = () => ({ id, responsibleOperatorId: owner, serviceProviderId: provider, scopeJson: { modelRead: true },
  scopeValid: true, validFrom: '2026-11-12T10:00:00.000Z', validUntil: '2026-11-13T10:00:00.000Z', revokedAt: null,
  createdAt: '2026-11-12T10:00:00.000Z' });

test('authorisation choices include every named server action exactly once without an implicit all-actions grant', () => {
  const server = ts.createSourceFile('scope.ts', fs.readFileSync(path.join(root, 'apps/api/src/common/tenant/authorisation-scope.decorator.ts'), 'utf8'), ts.ScriptTarget.Latest);
  let declared;
  const visit = node => {
    if (ts.isVariableDeclaration(node) && node.name.getText(server) === 'AUTHORISATION_SCOPES') {
      const array = ts.isAsExpression(node.initializer) ? node.initializer.expression : node.initializer;
      assert.ok(ts.isArrayLiteralExpression(array)); declared = array.elements.map(element => element.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(server); const choices = ui.AUTHORISATION_GROUPS.flatMap(group => group.actions.map(([key]) => key));
  assert.equal(choices.length, new Set(choices).size); assert.deepEqual([...choices].sort(), declared.sort());
  const request = ui.prepareAuthorisation({ serviceProviderId: provider.toUpperCase(), evidenceId: evidence,
    selected: ['modelRead', 'valueWrite'], validFrom: '', validUntil: '2026-11-13T12:00:00Z' }, owner, now);
  assert.deepEqual(request.scope, { modelRead: true, valueWrite: true });
  assert.equal(request.validFrom, new Date(now).toISOString()); assert.equal(request.serviceProviderId, provider);
  assert.equal('passportPublish' in request.scope, false); assert.equal('passportExport' in request.scope, false);
});

test('grant preparation rejects self-delegation, malformed identifiers, implicit scopes and invalid or expired intervals', () => {
  const valid = { serviceProviderId: provider, evidenceId: evidence, selected: ['modelRead'], validFrom: '', validUntil: '2026-11-13T12:00:00Z' };
  for (const change of [{ serviceProviderId: owner }, { evidenceId: '../private/source' }, { serviceProviderId: '' },
    { selected: [] }, { selected: ['passportManagement'] }, { selected: ['modelRead', 'modelRead'] },
    { selected: ['*'] }, { validUntil: '' }, { validUntil: '2026-11-11T00:00:00Z' },
    { validFrom: 'invalid' }, { validFrom: '2026-11-14T00:00:00Z' }]) {
    assert.throws(() => ui.prepareAuthorisation({ ...valid, ...change }, owner, now));
  }
  assert.equal(ui.validScope({ modelRead: 'true' }), false); assert.equal(ui.validScope({ modelRead: true, other: false }), false);
});

test('grant responses are bound to the authenticated organisation and project away private storage data and legacy JSON', () => {
  const input = { ...row(), documentObjectKey: 'private-key', documentSha256: 'a'.repeat(64), untrusted: { customer: 'hidden' } };
  const result = ui.parseAuthorisation(input, owner);
  assert.equal('documentObjectKey' in result, false); assert.equal('documentSha256' in result, false); assert.equal('untrusted' in result, false);
  assert.notEqual(result.scopeJson, input.scopeJson);
  assert.throws(() => ui.parseAuthorisation(input, provider));
  assert.throws(() => ui.parseAuthorisation({ ...input, scopeJson: { modelRead: true, passportManagement: true } }, owner));
  const legacy = ui.parseAuthorisation({ ...input, scopeJson: { passportManagement: true, secret: 'private' }, scopeValid: false }, owner);
  assert.deepEqual(legacy.scopeJson, {}); assert.equal(legacy.id, id); assert.equal(ui.authorisationStatus(legacy, now), 'Review and reissue');
  assert.throws(() => ui.parseAuthorisations([input, input], owner));
  assert.throws(() => ui.parseAuthorisations([input, { ...row(), responsibleOperatorId: provider }], owner));
  for (const malformed of [{ validFrom: 'bad' }, { validUntil: undefined }, { revokedAt: 'invalid' }, { scopeValid: 'true' }]) {
    assert.throws(() => ui.parseAuthorisation({ ...input, ...malformed }, owner));
  }
});

test('evidence choices keep exact server eligibility without retaining object keys or document hashes', () => {
  const result = ui.parseAuthorisationEvidence([{ id: evidence, originalFilename: 'Synthetic mandate.pdf', eligibleForAuthorisation: false,
    documentObjectKey: 'private-key', sha256: 'a'.repeat(64) }]);
  assert.deepEqual(result, [{ id: evidence, originalFilename: 'Synthetic mandate.pdf', eligibleForAuthorisation: false }]);
  assert.deepEqual(ui.parseAuthorisationEvidence([{ id: evidence, originalFilename: null, eligibleForAuthorisation: false }]),
    [{ id: evidence, originalFilename: `Document ${evidence}`, eligibleForAuthorisation: false }]);
  assert.throws(() => ui.parseAuthorisationEvidence([{ id: evidence, originalFilename: 'Mandate.pdf', eligibleForAuthorisation: 'true' }]));
  assert.throws(() => ui.parseAuthorisationEvidence(Array(101).fill({ id: evidence, originalFilename: 'Mandate.pdf', eligibleForAuthorisation: true })));
  assert.equal(ui.authorisationStatus({ ...row(), revokedAt: '2026-11-12T11:00:00Z' }, now), 'Revoked');
  assert.equal(ui.authorisationStatus({ ...row(), validFrom: '2026-11-12T13:00:00Z' }, now), 'Scheduled');
  assert.equal(ui.authorisationStatus({ ...row(), validUntil: new Date(now).toISOString() }, now), 'Expired');
  assert.equal(ui.authorisationStatus(row(), now), 'Active');
});

test('out-of-order requests and session invalidation cannot restore an older organisation response', async () => {
  const requests = ui.createAuthorisationRequests(), first = requests.start(); let privateRows = [], release;
  const delayed = new Promise(resolve => { release = resolve; });
  const previous = delayed.then(value => { if (first.current()) privateRows = value; });
  const second = requests.start(); assert.equal(first.signal.aborted, true);
  if (second.current()) privateRows = ['current-organisation'];
  release(['previous-organisation']); await previous;
  assert.deepEqual(privateRows, ['current-organisation']);
  requests.invalidate(); privateRows = [];
  assert.equal(second.current(), false); assert.equal(second.signal.aborted, true);
  if (second.current()) privateRows = ['late-sensitive-response'];
  assert.deepEqual(privateRows, []);
});
