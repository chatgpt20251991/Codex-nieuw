const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const source = fs.readFileSync(path.join(__dirname, '../../apps/web/lib/evidence-review.ts'), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const exported = {};
new Function('exports', 'require', compiled)(exported, name => { assert.equal(name, './api'); return {}; });
const now = Date.parse('2026-10-09T00:00:00Z'), id = 'evidence-fixture';
const origin = 'https://bucket.s3.eu-central-1.amazonaws.com';
const response = { evidenceId: id, downloadUrl: origin + '/private/source?X-Amz-Signature=synthetic',
  method: 'GET', expiresAt: new Date(now + 60000).toISOString(), expiresInSeconds: 60, reviewStatus: 'not_recorded' };

test('Evidence review URLs use only the configured storage origin and an unexpired short-lived attachment capability', () => {
  assert.equal(exported.evidenceReviewUrl(response, id, origin, now), response.downloadUrl);
  for (const change of [
    { downloadUrl: 'https://foreign.example/source' }, { downloadUrl: 'javascript:alert(1)' },
    { downloadUrl: origin.replace('https://', 'https://user:secret@') + '/source' },
    { downloadUrl: response.downloadUrl + '#private' }, { evidenceId: 'another-source' },
    { method: 'PUT' }, { reviewStatus: 'verified' }, { expiresInSeconds: 61 },
    { expiresInSeconds: 0 }, { expiresAt: new Date(now).toISOString() },
    { expiresAt: new Date(now + 61000).toISOString() }, { expiresAt: 'unknown' },
  ]) assert.throws(() => exported.evidenceReviewUrl({ ...response, ...change }, id, origin, now));
});

test('Evidence review storage configuration cannot introduce a credential, redirect path or insecure production origin', () => {
  for (const value of ['', 'https://user:secret@bucket.s3.eu-central-1.amazonaws.com', origin + '/other',
    origin + '?redirect=1', origin + '#section', 'http://remote.example', 'http://localhost:9000']) {
    assert.throws(() => exported.evidenceReviewUrl(response, id, value, now));
  }
});
