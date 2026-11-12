'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.join(__dirname, '../..');
const compile = name => ts.transpileModule(fs.readFileSync(path.join(root, name), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const workspace = {}; new Function('exports', compile('apps/web/lib/evidence-workspace.ts'))(workspace);
const id = '10000000-0000-4000-8000-000000000001', origin = 'https://private-storage.example';
const row = () => ({ id, originalFilename: 'Synthetic authorisation.pdf', mimeType: 'application/pdf', sizeBytes: '12',
  verificationStatus: 'uploaded', uploadedAt: '2026-11-12T12:00:00.000Z', issuedAt: null, expiresAt: null, eligibleForAuthorisation: false });
const input = { mimeType: 'application/pdf', sha256: 'a'.repeat(64), checksum: Buffer.from('a'.repeat(64), 'hex').toString('base64') };
const session = () => ({ evidenceId: id, uploadUrl: origin + '/private-source?X-Amz-Signature=synthetic', method: 'PUT',
  requiredHeaders: { 'content-type': input.mimeType, 'x-amz-meta-sha256': input.sha256, 'x-amz-checksum-sha256': input.checksum },
  objectKey: 'must-not-be-retained' });

test('evidence inventory retains bounded review metadata, accepts null legacy names and strips storage capabilities', () => {
  const parsed = workspace.parseEvidenceInventory([{ ...row(), objectKey: 'private-key', sha256: input.sha256,
    downloadUrl: origin + '/private?secret=synthetic', malwareScannerVersion: 'private-details' }]);
  assert.deepEqual(parsed, [row()]);
  assert.equal(workspace.parseEvidenceInventory([{ ...row(), originalFilename: null, mimeType: null, sizeBytes: null }])[0].originalFilename, `Document ${id}`);
  for (const change of [{ id: 'foreign/path' }, { verificationStatus: 'approved' }, { eligibleForAuthorisation: true },
    { sizeBytes: 12 }, { sizeBytes: '-1' }, { uploadedAt: 'yesterday' }, { expiresAt: undefined }]) {
    assert.throws(() => workspace.parseEvidenceInventory([{ ...row(), ...change }]));
  }
  assert.throws(() => workspace.parseEvidenceInventory([row(), row()]));
  assert.throws(() => workspace.parseEvidenceInventory(Array(101).fill(row())));
});

test('file validation rejects empty or oversized inputs before allocating a hashing buffer', () => {
  assert.deepEqual(workspace.evidenceFile({ name: 'source.pdf', size: 100 * 1024 * 1024, type: '' }),
    { originalFilename: 'source.pdf', sizeBytes: 100 * 1024 * 1024, mimeType: 'application/octet-stream' });
  for (const change of [{ name: '' }, { name: 'x'.repeat(241) }, { size: 0 }, { size: -1 },
    { size: 100 * 1024 * 1024 + 1 }, { size: 0.5 }, { type: 'application/pdf\r\nauthorization: secret' }]) {
    assert.throws(() => workspace.evidenceFile({ name: 'source.pdf', size: 12, type: 'application/pdf', ...change }));
  }
});

test('private upload checks bind exact approved HTTPS origin, method, identity and client-generated integrity headers', () => {
  const destination = workspace.evidenceUpload(session(), input, origin);
  assert.deepEqual(destination, { evidenceId: id, url: session().uploadUrl, headers: session().requiredHeaders });
  assert.equal('objectKey' in destination, false);
  for (const change of [{ method: 'GET' }, { evidenceId: '../other' }, { uploadUrl: 'https://foreign.example/private' },
    { uploadUrl: 'http://private-storage.example/private' }, { uploadUrl: origin.replace('https://', 'https://user:secret@') + '/private' },
    { uploadUrl: session().uploadUrl + '#fragment' }, { requiredHeaders: { ...session().requiredHeaders, authorization: 'must-not-be-forwarded' } },
    { requiredHeaders: { ...session().requiredHeaders, 'x-amz-meta-sha256': 'b'.repeat(64) } },
    { requiredHeaders: { ...session().requiredHeaders, 'x-amz-checksum-sha256': Buffer.from('b'.repeat(64), 'hex').toString('base64') } }]) {
    assert.throws(() => workspace.evidenceUpload({ ...session(), ...change }, input, origin));
  }
  for (const invalidOrigin of ['', origin + '/redirect', origin + '?redirect=1', origin + '#fragment', 'http://localhost:9000']) {
    assert.throws(() => workspace.evidenceUpload(session(), input, invalidOrigin));
  }
});

test('source-download issuance cannot trigger a stale attachment after a workspace change or aborted session', async () => {
  const compiled = compile('apps/web/lib/evidence-review.ts');
  for (const reason of ['context', 'abort']) {
    let release, created = 0, options, current = true;
    const pending = new Promise(resolve => { release = resolve; }), exported = {}, abort = new AbortController();
    const document = { createElement() { created++; throw new Error('Stale document capability must not reach the DOM'); } };
    const api = { apiFetch: async (_route, init) => { options = init; return pending; } };
    new Function('exports', 'require', 'document', 'process', compiled)(exported, name => { assert.equal(name, './api'); return api; }, document,
      { env: { NODE_ENV: 'production', NEXT_PUBLIC_EVIDENCE_UPLOAD_ORIGIN: origin } });
    const download = exported.downloadEvidence(id, { signal: abort.signal, isCurrent: () => current });
    if (reason === 'context') current = false; else abort.abort();
    release({ evidenceId: id, downloadUrl: origin + '/private?synthetic', method: 'GET',
      expiresAt: new Date(Date.now() + 30000).toISOString(), expiresInSeconds: 30, reviewStatus: 'not_recorded' });
    await assert.rejects(download, /no longer current/); assert.equal(created, 0); assert.equal(options.signal, abort.signal);
  }
});
