'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { publicOrigins } = require('../../scripts/ops/build-origins.cjs');
test('production image requires explicit HTTPS origins and cannot bake credentials or arbitrary paths into the client', () => {
  const valid = { NEXT_PUBLIC_API_URL: 'https://api.example/v1', NEXT_PUBLIC_EVIDENCE_UPLOAD_ORIGIN: 'https://bucket.s3.eu-central-1.amazonaws.com' };
  assert.deepEqual(publicOrigins(valid), valid);
  for (const patch of [{ NEXT_PUBLIC_API_URL: '' }, { NEXT_PUBLIC_API_URL: 'http://localhost:4000/v1' },
    { NEXT_PUBLIC_API_URL: 'https://user:secret@api.example/v1' }, { NEXT_PUBLIC_API_URL: 'https://api.example/v2' },
    { NEXT_PUBLIC_EVIDENCE_UPLOAD_ORIGIN: 'https://bucket.example/path' }, { NEXT_PUBLIC_EVIDENCE_UPLOAD_ORIGIN: 'https://bucket.example?secret=value' }]) {
    assert.throws(() => publicOrigins({ ...valid, ...patch }));
  }
});
