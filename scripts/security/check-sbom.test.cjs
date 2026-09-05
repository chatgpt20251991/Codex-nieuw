const { test } = require('node:test');
const assert = require('node:assert/strict');
const { validateSbom } = require('./check-sbom.cjs');
const lock = { name: 'fixture', packages: {
  '': { version: '1.0.0' },
  'apps/api': { name: '@fixture/api', version: '1.0.0' },
  'node_modules/@fixture/api': { link: true },
  'node_modules/root-only-tool': { version: '2.0.0' },
  'node_modules/tool/node_modules/transitive': { version: '3.0.0' },
} };
const report = () => ({ bomFormat: 'CycloneDX', metadata: { component: { purl: 'pkg:npm/fixture@1.0.0' } },
  components: ['%40fixture/api@1.0.0', 'root-only-tool@2.0.0', 'transitive@3.0.0'].map(name => ({ purl: 'pkg:npm/' + name })) });
test('SBOM includes root, scoped workspaces and root-only and nested dependencies', () => {
  assert.equal(validateSbom(report(), lock), 4);
});
test('workspace-filtered SBOM cannot silently omit a root-only development tool', () => {
  const filtered = report(); filtered.components.splice(1, 1);
  assert.throws(() => validateSbom(filtered, lock), /root-only-tool/);
});
test('wrong dependency versions and malformed SBOM fail completeness validation', () => {
  const stale = report(); stale.components[2].purl = 'pkg:npm/transitive@2.0.0';
  assert.throws(() => validateSbom(stale, lock), /transitive@3/);
  assert.throws(() => validateSbom({}, lock));
});
