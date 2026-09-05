// Source checks complement, and do not replace, the PostgreSQL/API integration suite.
const { readFileSync, readdirSync, statSync } = require('node:fs');
const { resolve, join } = require('node:path');
const root = resolve(__dirname, '..');
const read = path => readFileSync(join(root, path), 'utf8');
const checks = [];
const ok = (name, passed) => checks.push({ name, passed: Boolean(passed) });
const fields = JSON.parse(read('packages/rules/src/data-points.json')).fields;
ok('71 field definitions', fields.length === 71);
ok('field ids 1..71', fields.every((field, index) => field.id === index + 1));
ok('field 50 is authority-only', fields[49].access_tier === 'authority_only');
const rules = read('packages/rules/src/engine.ts');
ok('conditional applicability supported', rules.includes('conditionalRequiredFieldIds'));
ok('deferred fields excluded from base required count', rules.includes('deferredRequirements'));
const schema = read('apps/api/prisma/schema.prisma');
for (const model of ['WrittenAuthorisation', 'SupplierRequest', 'ExtractionJob', 'PassportVersion', 'PublicPassportSnapshot', 'AccessGrant', 'LifecycleEvent', 'TelemetryReading', 'RegistryIdentity', 'RegistryEnrolmentProfile']) {
  ok(`Prisma model ${model}`, schema.includes(`model ${model} `));
}
ok('public snapshot separated from canonical', schema.includes('model PublicPassportSnapshot') && schema.includes('publicJson'));
ok('access raw token not stored', schema.includes('tokenHash'));
const rls = read('infra/postgres/001_rls.sql');
ok('RLS is forced', rls.includes('FORCE ROW LEVEL SECURITY'));
ok('public resolver security-definer function', rls.includes('get_public_passport_snapshot') && rls.includes('SECURITY DEFINER'));
ok('supplier token minimal resolver', rls.includes('resolve_supplier_request_token'));
ok('restricted token minimal resolver', rls.includes('resolve_access_grant_token'));
const storage = read('apps/api/src/common/storage/storage.service.ts');
ok('S3 checksum supplied', storage.includes('ChecksumSHA256'));
ok('stored object bytes can be hashed', storage.includes('hashObject') && storage.includes("createHash('sha256')"));
const passport = read('apps/api/src/modules/passports/passports.controller.ts');
ok('immutable hash chain', passport.includes('previousVersionHash:latest?.sha256'));
const projection = read('apps/api/src/modules/passports/passport-projection.ts');
ok('public projection strips evidence IDs', passport.includes('projectPassport(canonical)') && projection.includes('fieldId: value.fieldId, name: value.name, value: value.value, unit: value.unit'));
ok('public snapshot written separately', passport.includes('publicPassportSnapshot.create'));
const registry = read('apps/api/src/modules/registry/registry.controller.ts');
ok('no fake live registry success', registry.includes('LIVE_REGISTRY_ADAPTER_NOT_CONFIGURED'));
ok('registry requires HTTPS UPI', registry.includes("startsWith('https://')"));
ok('max-100 batching', registry.includes('chunkForRegistry(records,100)'));
const auth = read('apps/api/src/common/auth/auth.service.ts');
ok('OIDC verification exists', auth.includes('createRemoteJWKSet') && auth.includes('jwtVerify'));
ok('production rejects dev auth', read('apps/api/src/main.ts').includes("AUTH_MODE!=='oidc'"));
ok('cross-tenant written authorisation gate', read('apps/api/src/common/tenant/tenant.guard.ts').includes('writtenAuthorisation.findFirst'));
const supplier = read('apps/api/src/modules/suppliers/suppliers.controller.ts');
ok('supplier token is hashed', supplier.includes('sha256Hex(raw)'));
ok('supplier data enters submitted state', supplier.includes("validationStatus:'submitted'"));
ok('extraction stays suggested', read('apps/api/src/modules/evidence/extraction/extraction.service.ts').includes("state:'suggested'"));
const resolver = read('apps/api/src/modules/resolver/resolver.controller.ts');
ok('public endpoint reads only snapshot function', resolver.includes('get_public_passport_snapshot') && !resolver.includes('passportVersion'));
const identity = read('packages/rules/src/registry-identity.ts');
ok('Registry actor roles separated', identity.includes('economic_operator') && identity.includes('value_chain_actor'));
ok('Registry verification lifetime capped', identity.includes('3 * 365.2425') && identity.includes('electronicIdExpiresAt'));
const identityService = read('apps/api/src/modules/registry/registry-identity.service.ts');
ok('delegated Registry gate checks written authorisation', identityService.includes('writtenAuthorisation.findFirst') && identityService.includes('delegatedRegistryActorGate'));
const orgs = read('apps/api/src/modules/organisations/organisations.controller.ts');
ok('Registry enrolment profile API exists', orgs.includes('registry-profile') && orgs.includes('identifierLimit'));
const env = read('.env.example');
ok('Registry feature flags conservative', env.includes('BATTERY_SEMANTIC_CATALOGUE_AVAILABLE=false') && env.includes('REGISTRY_BATTERY_SUBMISSION_AVAILABLE=false'));

// Scan project sources only; generated dependencies contain upstream test credentials.
const excluded = new Set(['node_modules', '.git', '.next', 'dist', 'coverage', '.env']);
function sourceText(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    if (excluded.has(entry.name) || entry.isSymbolicLink()) return [];
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceText(path);
    return statSync(path).size < 1_000_000 ? [readFileSync(path, 'utf8')] : [];
  });
}
const text = sourceText(root).join('\n');
ok('no PEM private key', !text.includes('-----BEGIN ' + 'PRIVATE KEY-----'));
ok('no obvious GitHub/OpenAI live token prefix', !/\b(?:ghp_|github_pat_|sk-proj-)[A-Za-z0-9_-]{20,}/.test(text));
for (const check of checks) console.log(`${check.passed ? 'PASS' : 'FAIL'} | ${check.name}`);
console.log(`\n${checks.filter(check => check.passed).length}/${checks.length} checks passed`);
if (checks.some(check => !check.passed)) process.exitCode = 1;
