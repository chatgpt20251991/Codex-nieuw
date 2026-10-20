'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const syntheticExport = require('../fixtures/operator-export.cjs');
const { hashJson, verifyManifest } = require('../../scripts/passport-export.cjs');
const source = fs.readFileSync(path.join(__dirname, '../../apps/web/lib/operator-export.ts'), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const exported = {};
new Function('exports', compiled)(exported);

test('private browser export retains exact published data and a separately preservable hash without mutating its envelope', () => {
  const { envelope } = syntheticExport(), before = structuredClone(envelope);
  const result = exported.prepareOperatorExport(envelope, envelope.payload.item.id);
  assert.deepEqual(JSON.parse(result.content), before);
  assert.deepEqual(envelope, before);
  assert.match(result.filename, /^private-battery-passport-[0-9a-f-]{36}\.json$/);
  assert.equal(result.payloadSha256, envelope.integrity.payloadSha256);
  assert.equal(JSON.parse(result.content).payload.versions[0].canonicalJson.values.find(v => v.fieldId === 50).value,
    'Synthetic authority-only confidential value');
});

test('a wrong battery, public projection or misleading complete-archive claim cannot become a private browser download', () => {
  const { envelope } = syntheticExport(), id = envelope.payload.item.id;
  assert.throws(() => exported.prepareOperatorExport(envelope, '12345678-1234-4123-8123-123456789012'));
  for (const change of [
    d => { d.schema = 'public-passport'; }, d => { d.payload.classification = 'public'; },
    d => { d.payload.coverage.batteryItemId = 'other'; }, d => { d.payload.coverage.completeCustomerExitArchive = true; },
    d => { d.payload.coverage.sourceDocumentBytesIncluded = true; }, d => { d.payload.coverage.versionCount = 0; },
    d => { d.payload.versions = []; }, d => { d.integrity.payloadSha256 = 'invalid'; },
  ]) {
    const data = structuredClone(envelope); change(data);
    assert.throws(() => exported.prepareOperatorExport(data, id));
  }
});

test('private browser download bounds encoded UTF-8 bytes rather than character count', () => {
  const { envelope } = syntheticExport();
  envelope.payload.versions[0].canonicalJson.values[1].value = '😀'.repeat(2 * 1024 * 1024);
  assert.throws(() => exported.prepareOperatorExport(envelope, envelope.payload.item.id), /exceeds the download limit/);
});

test('private browser download accepts the exact API manifest byte limit and rejects one byte more', () => {
  const { envelope } = syntheticExport(), maximum = 8 * 1024 * 1024;
  envelope.payload.versions = envelope.payload.versions.slice(0, 1);
  envelope.payload.coverage.versionCount = 1; envelope.payload.coverage.lastVersionNo = 1;
  const version = envelope.payload.versions[0], confidential = version.canonicalJson.values.find(v => v.fieldId === 50);
  confidential.value = '';
  confidential.value = 'x'.repeat(maximum - Buffer.byteLength(JSON.stringify(envelope), 'utf8'));
  const rehash = () => {
    version.sha256 = hashJson(version.canonicalJson);
    envelope.integrity.payloadSha256 = hashJson(envelope.payload);
  };
  rehash();
  assert.equal(Buffer.byteLength(JSON.stringify(envelope), 'utf8'), maximum);
  assert.equal(verifyManifest(envelope).internallyConsistent, true);
  const file = exported.prepareOperatorExport(envelope, envelope.payload.item.id);
  assert.equal(Buffer.byteLength(file.content, 'utf8'), maximum);
  assert.deepEqual(JSON.parse(file.content), envelope);
  confidential.value += 'x'; rehash();
  assert.equal(Buffer.byteLength(JSON.stringify(envelope), 'utf8'), maximum + 1);
  assert.throws(() => exported.prepareOperatorExport(envelope, envelope.payload.item.id), /exceeds the download limit/);
});
