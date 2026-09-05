const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');

function validateSbom(sbom, lock) {
  assert.equal(sbom.bomFormat, 'CycloneDX');
  assert.ok(Array.isArray(sbom.components), 'SBOM components are missing');
  const identities = new Set([...sbom.components, sbom.metadata?.component].filter(Boolean)
    .map(component => decodeURIComponent(component.purl || '').split('?')[0]));
  for (const [location, entry] of Object.entries(lock.packages)) {
    if (entry.link || !entry.version) continue;
    const name = entry.name || (location.includes('node_modules/') ? location.split('node_modules/').at(-1) : lock.name);
    assert.ok(identities.has('pkg:npm/' + name + '@' + entry.version),
      'SBOM omits locked package ' + name + '@' + entry.version);
  }
  return identities.size;
}

module.exports = { validateSbom };
if (require.main === module) {
  const sbom = JSON.parse(readFileSync(process.argv[2], 'utf8'));
  const lock = JSON.parse(readFileSync('package-lock.json', 'utf8'));
  console.log('SBOM completeness verified: ' + validateSbom(sbom, lock) + ' package identities');
}
