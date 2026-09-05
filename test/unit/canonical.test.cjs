const { test } = require('node:test');
const assert = require('node:assert/strict');
const { canonicalize, hashJson } = require('../../apps/api/dist/common/crypto/canonical.js');

test('canonical hashes survive a JSON database round trip with omitted properties and array holes', () => {
  const value = { optional: undefined, rows: [undefined, , { z: 2, a: 1 }], date: new Date('2026-01-01T00:00:00Z') };
  const persisted = JSON.parse(JSON.stringify(value));
  assert.equal(hashJson(value), hashJson(persisted));
  assert.deepEqual(JSON.parse(canonicalize(value)), persisted);
});

test('nested key ordering does not change a hash, while value changes do', () => {
  assert.equal(hashJson({ b: { y: 2, x: 1 }, a: 0 }), hashJson({ a: 0, b: { x: 1, y: 2 } }));
  assert.notEqual(hashJson({ amount: 1 }), hashJson({ amount: 2 }));
  assert.notEqual(hashJson([1, 2]), hashJson([2, 1]));
});

test('persisted JSON values retain their established canonical representation', () => {
  assert.equal(canonicalize({ z: null, a: 'text', b: [false, 1] }), '{"a":"text","b":[false,1],"z":null}');
});

test('non-JSON root values, bigint and cyclic data cannot produce a misleading hash', () => {
  const cyclic = {}; cyclic.self = cyclic;
  for (const value of [undefined, () => {}, 1n, cyclic]) assert.throws(() => hashJson(value), TypeError);
});
