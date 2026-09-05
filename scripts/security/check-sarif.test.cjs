'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, writeFileSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join, dirname, resolve, basename } = require('node:path');
const { inspectSarif, checkDirectory } = require('./check-sarif.cjs');

function report(results = []) {
  return { version: '2.1.0', runs: [{ tool: { driver: { name: 'CodeQL' } }, results }] };
}

test('completed analysis with zero findings is accepted', () => {
  assert.deepEqual(inspectSarif(report()), []);
});

test('missing or malformed analysis evidence fails closed', () => {
  for (const document of [null, {}, { version: '2.1.0', runs: [] }]) {
    assert.throws(() => inspectSarif(document));
  }
  const document = report();
  delete document.runs[0].results;
  assert.throws(() => inspectSarif(document), /results array/);
});

test('a failed scan cannot masquerade as zero findings', () => {
  const document = report();
  document.runs[0].invocations = [{ executionSuccessful: false }];
  assert.throws(() => inspectSarif(document), /invocation failed/);
  document.runs[0].invocations = [{ executionSuccessful: true, toolExecutionNotifications: [{ level: 'error' }] }];
  assert.throws(() => inspectSarif(document), /execution error/);
});

test('warning, error, note and suppressed findings remain visible to the gate', () => {
  const results = ['warning', 'error', 'note'].map(level => ({
    ruleId: 'js/example-security-rule', level,
    suppressions: [{ kind: 'inSource', status: 'accepted' }],
    locations: [{ physicalLocation: { artifactLocation: { uri: 'apps/api/example.ts' }, region: { startLine: 7 } } }],
    message: { text: 'sensitive source content must not be printed by this helper' },
  }));
  const findings = inspectSarif(report(results));
  assert.equal(findings.length, 3);
  assert.equal(findings[0].file, 'apps/api/example.ts');
  assert.equal(findings[0].line, 7);
  assert(!JSON.stringify(findings).includes('sensitive source content'));
});

test('a replacement report from another tool cannot satisfy the CodeQL gate', () => {
  const document = report();
  document.runs[0].tool.driver.name = 'unrelated-tool';
  assert.throws(() => inspectSarif(document), /CodeQL analysis evidence/);
});

test('the directory gate rejects absent reports and any result, then accepts clean evidence', t => {
  const directory = mkdtempSync(join(tmpdir(), 'eubp-sarif-test-'));
  t.after(() => {
    assert.equal(dirname(resolve(directory)), resolve(tmpdir()));
    assert(basename(directory).startsWith('eubp-sarif-test-'));
    rmSync(directory, { recursive: true, force: true });
  });
  assert.throws(() => checkDirectory(directory), /No SARIF reports/);
  const file = join(directory, 'javascript.sarif');
  writeFileSync(file, JSON.stringify(report([{ ruleId: 'js/example-security-rule', level: 'warning' }])));
  assert.throws(() => checkDirectory(directory), /1 CodeQL findings require/);
  writeFileSync(file, JSON.stringify(report()));
  assert.doesNotThrow(() => checkDirectory(directory));
});
