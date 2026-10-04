'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { blueprint, envTemplate } = require('../../scripts/ops/render-blueprint.cjs');
const root = resolve(__dirname, '../..');
const proposal = require('../../infra/deployment/render-plans.example.json');
const templates = Object.fromEntries(['api', 'web'].map(kind => [kind,
  readFileSync(resolve(root, `infra/deployment/${kind}.env.example`), 'utf8')]));

test('Render acceptance keeps runtime credentials separate from database administrator and private scanner', () => {
  const result = blueprint(proposal.plans, templates);
  const { services, databases } = result.projects[0].environments[0];
  assert.equal(result.previews.generation, 'off');
  for (const service of services) {
    assert.equal(service.region, 'frankfurt');
    assert.equal(service.autoDeployTrigger, 'off');
    assert.equal(service.preDeployCommand, undefined);
    assert.equal(service.numInstances, 1);
  }
  const api = services.find(s => s.name.endsWith('-api'));
  assert.deepEqual(api.envVars.find(e => e.key === 'DATABASE_URL'), { key: 'DATABASE_URL', sync: false });
  assert(!JSON.stringify(result).includes('fromDatabase'));
  assert.equal(api.envVars.find(e => e.key === 'CLAMAV_HOST').fromService.type, 'pserv');
  for (const flag of ['BATTERY_SEMANTIC_CATALOGUE_AVAILABLE', 'REGISTRY_BATTERY_SUBMISSION_AVAILABLE']) {
    assert.equal(api.envVars.find(e => e.key === flag).value, 'false');
  }
  const scanner = services.find(s => s.type === 'pserv');
  assert.equal(scanner.plan, 'pro');
  assert.match(scanner.image.url, /@sha256:[a-f0-9]{64}$/);
  assert.equal(scanner.domains, undefined);
  assert.equal(scanner.envVars[0].value, 'UTC');
  assert.deepEqual(databases[0].ipAllowList, []);
  assert.equal(databases[0].postgresMajorVersion, '16');
});

test('Render acceptance cannot invent a default subscription or inject credentials through templates', () => {
  for (const plans of [undefined, {}, { ...proposal.plans, scanner: 'free' }, { ...proposal.plans, database: 'free' }]) {
    assert.throws(() => blueprint(plans, templates));
  }
  for (const key of ['DATABASE_URL', 'AUTH0_SECRET', 'AUTH0_CLIENT_SECRET', 'S3_ACCESS_KEY', 'S3_SECRET_KEY']) {
    assert.throws(() => envTemplate(`${key}=sensitive-value`));
    assert.deepEqual(envTemplate(`${key}=`), [{ key, sync: false }]);
  }
  assert.throws(() => envTemplate('KEY=one\nKEY=two'));
});
