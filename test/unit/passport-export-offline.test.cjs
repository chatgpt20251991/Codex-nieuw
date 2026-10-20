'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const syntheticExport = require('../fixtures/operator-export.cjs');
const { hashJson, verifyManifest, verifySources, assemble } = require('../../scripts/passport-export.cjs');
const rehash = envelope => { envelope.integrity.payloadSha256 = hashJson(envelope.payload); return envelope; };
const testTemp = process.env.EUBP_TEST_OUTPUT_DIRECTORY || os.tmpdir();

test('offline export checks every stored version hash and chain, retaining private fields without claiming authenticity or completeness', () => {
  const { envelope } = syntheticExport(), result = verifyManifest(envelope);
  assert.equal(result.internallyConsistent, true); assert.equal(result.anchoredToExpectedPayloadHash, false);
  assert.equal(result.versionCount, 2); assert.equal(result.sourceBytesVerified, false);
  assert.equal(result.completeCustomerExitArchive, false);
  assert.equal(envelope.payload.versions[0].canonicalJson.values[0].value, 0);
  assert.ok(envelope.payload.versions[0].canonicalJson.values.some(row => row.fieldId === 50));
  assert.equal(verifyManifest(envelope, envelope.integrity.payloadSha256).anchoredToExpectedPayloadHash, true);
  assert.throws(() => verifyManifest(envelope, '0'.repeat(64)), /TRUSTED_PAYLOAD_HASH_MISMATCH/);
});

test('offline verifier rejects tampered content, reordered/missing versions, broken links, identity substitutions and unreferenced evidence', () => {
  for (const [change, pattern] of [
    [e => { e.payload.item.passportState = 'registered'; }, /EXPORT_PAYLOAD_HASH_MISMATCH/],
    [e => { e.payload.versions[0].canonicalJson.values[0].value = 900; rehash(e); }, /VERSION_HASH_MISMATCH/],
    [e => { e.payload.versions.reverse(); rehash(e); }, /VERSION_CHAIN_BROKEN/],
    [e => { e.payload.versions[1].previousVersionHash = 'f'.repeat(64); rehash(e); }, /VERSION_CHAIN_BROKEN/],
    [e => { e.payload.versions.shift(); e.payload.coverage.versionCount = 1; e.payload.coverage.lastVersionNo = 1; rehash(e); }, /VERSION_CHAIN_BROKEN/],
    [e => { e.payload.item.id = require('node:crypto').randomUUID(); e.payload.coverage.batteryItemId = e.payload.item.id; rehash(e); }, /VERSION_IDENTITY_INVALID/],
    [e => { e.payload.evidence[0].id = '../../outside'; rehash(e); }, /EVIDENCE_SCOPE_INVALID/],
    [e => { e.payload.coverage.completeCustomerExitArchive = true; rehash(e); }, /EXPORT_COVERAGE_INVALID/],
  ]) {
    const { envelope } = syntheticExport(); change(envelope); assert.throws(() => verifyManifest(envelope), pattern);
  }
});

test('offline manifest reports missing historical evidence metadata and never reports source-byte success', () => {
  const { envelope, evidenceId } = syntheticExport(); envelope.payload.evidence = [];
  envelope.payload.coverage.missingEvidenceIds = [evidenceId]; rehash(envelope);
  const result = verifyManifest(envelope); assert.deepEqual(result.missingEvidenceMetadata, [evidenceId]);
  assert.equal(result.sourceBytesVerified, false); assert.equal(result.completeCustomerExitArchive, false);
});

test('successor drill assembles a portable archive and re-verifies exact source bytes with no API, database or package installation', async () => {
  await fs.mkdir(testTemp, { recursive: true }); const root = await fs.mkdtemp(path.join(testTemp, 'eubp-export-drill-'));
  try {
    const { envelope, bytes, evidenceId } = syntheticExport(), sources = path.join(root, 'input'); await fs.mkdir(sources);
    await fs.writeFile(path.join(sources, evidenceId + '.bin'), bytes);
    const archive = path.join(root, 'successor-archive');
    const result = await assemble(envelope, sources, archive, envelope.integrity.payloadSha256);
    assert.equal(result.sourceBytesVerified, true); assert.equal(result.completeCustomerExitArchive, false);
    assert.equal(result.sourceBytes, bytes.length);
    if (process.platform !== 'win32') {
      for (const directory of [archive, path.join(archive, 'sources')]) assert.equal((await fs.stat(directory)).mode & 0o777, 0o700);
      for (const file of ['passport-export.json', 'verify-passport-export.cjs', 'integrity-report.json', path.join('sources', evidenceId + '.bin')]) {
        assert.equal((await fs.stat(path.join(archive, file))).mode & 0o777, 0o600);
      }
    }
    const child = spawnSync(process.execPath, [path.join(archive, 'verify-passport-export.cjs'), 'verify',
      path.join(archive, 'passport-export.json'), path.join(archive, 'sources'), '--expected-sha256', envelope.integrity.payloadSha256],
    { cwd: archive, encoding: 'utf8', windowsHide: true, env: { PATH: process.env.PATH } });
    assert.equal(child.status, 0, child.stderr); assert.equal(JSON.parse(child.stdout).sourceBytesVerified, true);
    await assert.rejects(assemble(envelope, sources, archive), /EEXIST/);
    await fs.writeFile(path.join(archive, 'sources', evidenceId + '.bin'), Buffer.alloc(bytes.length, 1));
    await assert.rejects(verifySources(envelope, path.join(archive, 'sources')), /SOURCE_HASH_MISMATCH/);
    await fs.unlink(path.join(archive, 'sources', evidenceId + '.bin'));
    await assert.rejects(verifySources(envelope, path.join(archive, 'sources')), /ENOENT/);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

test('archive refuses missing SHA/version/size metadata, oversized sources and symlink source paths', async () => {
  await fs.mkdir(testTemp, { recursive: true }); const root = await fs.mkdtemp(path.join(testTemp, 'eubp-export-safety-'));
  try {
    for (const patch of [{ sha256: null }, { sizeBytes: '104857601' }, { storageVersionId: null },
      { storageVersionId: '   ' }, { storageVersionId: ' null ' }, { sizeBytes: '-1' }]) {
      const { envelope } = syntheticExport(); Object.assign(envelope.payload.evidence[0], patch); rehash(envelope);
      await assert.rejects(verifySources(envelope, root), /REFERENCED_EVIDENCE_METADATA_UNAVAILABLE/);
    }
    const { envelope, bytes, evidenceId } = syntheticExport(), other = path.join(root, 'other.bin'); await fs.writeFile(other, bytes);
    // File symlinks require a Windows privilege; the directory junction case is available without it.
    const junction = path.join(root, 'redirect'); await fs.symlink(root, junction, process.platform === 'win32' ? 'junction' : 'dir');
    await assert.rejects(verifySources(envelope, junction), /UNSAFE_SOURCE_DIRECTORY/);
    await fs.unlink(junction);
    await fs.writeFile(path.join(root, evidenceId + '.bin'), Buffer.alloc(bytes.length + 1));
    await assert.rejects(verifySources(envelope, root), /SOURCE_SIZE_MISMATCH/);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

test('CLI failure logs expose error codes without malformed confidential JSON fragments or private filesystem paths', async () => {
  await fs.mkdir(testTemp, { recursive: true }); const root = await fs.mkdtemp(path.join(testTemp, 'eubp-export-errors-'));
  try {
    const filename = path.join(root, 'private-customer-manifest.json');
    await fs.writeFile(filename, '{"CONFIDENTIAL_CUSTOMER_MARKER": invalid-json-here}');
    for (const [input, code] of [[filename, 'INVALID_JSON'], [path.join(root, 'private-missing.json'), 'ENOENT']]) {
      const child = spawnSync(process.execPath, [path.resolve(__dirname, '../../scripts/passport-export.cjs'), 'verify', input],
        { encoding: 'utf8', windowsHide: true });
      assert.equal(child.status, 1); assert.equal(child.stdout, ''); assert.match(child.stderr, new RegExp(code));
      assert.equal(child.stderr.includes('CONFIDENTIAL_CUSTOMER_MARKER'), false);
      assert.equal(child.stderr.includes('private-customer'), false); assert.equal(child.stderr.includes(root), false);
    }
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});
