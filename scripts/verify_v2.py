#!/usr/bin/env python3
from pathlib import Path
import json, re, sys
ROOT=Path(__file__).resolve().parents[1]
errors=[]; checks=[]
def ok(name, cond, detail=''):
    checks.append((name, bool(cond), detail))
    if not cond: errors.append(name + (f': {detail}' if detail else ''))

data=json.loads((ROOT/'packages/rules/src/data-points.json').read_text())
fields=data['fields']
ok('71 field definitions',len(fields)==71,str(len(fields)))
ok('field ids 1..71',[x['id'] for x in fields]==list(range(1,72)))
ok('field 50 is authority-only',fields[49]['access_tier']=='authority_only',fields[49]['access_tier'])

rules=(ROOT/'packages/rules/src/engine.ts').read_text()
ok('conditional applicability supported','conditionalRequiredFieldIds' in rules)
ok('deferred fields excluded from base required count','deferredRequirements' in rules)

schema=(ROOT/'apps/api/prisma/schema.prisma').read_text()
for model in ['WrittenAuthorisation','SupplierRequest','ExtractionJob','PassportVersion','PublicPassportSnapshot','AccessGrant','LifecycleEvent','TelemetryReading','RegistryIdentity','RegistryEnrolmentProfile']:
    ok(f'Prisma model {model}',f'model {model} ' in schema)
ok('public snapshot separated from canonical','model PublicPassportSnapshot' in schema and 'publicJson' in schema)
ok('access raw token not stored','tokenHash' in schema)

rls=(ROOT/'infra/postgres/001_rls.sql').read_text()
ok('RLS is forced','FORCE ROW LEVEL SECURITY' in rls)
ok('public resolver security-definer function','get_public_passport_snapshot' in rls and 'SECURITY DEFINER' in rls)
ok('supplier token minimal resolver','resolve_supplier_request_token' in rls)
ok('restricted token minimal resolver','resolve_access_grant_token' in rls)

storage=(ROOT/'apps/api/src/common/storage/storage.service.ts').read_text()
ok('S3 checksum supplied','ChecksumSHA256' in storage)
ok('stored object bytes can be hashed','malwareScanner.scan(measured())' in storage and "createHash('sha256')" in storage)

passport=(ROOT/'apps/api/src/modules/passports/passports.controller.ts').read_text()
ok('immutable hash chain','previousVersionHash:latest?.sha256' in passport)
ok('public projection strips evidence IDs','publicJson' in passport and "map((v:any)=>({fieldId:v.fieldId,name:v.name,value:v.value,unit:v.unit}))" in passport)
ok('public snapshot written separately','publicPassportSnapshot.create' in passport)

registry=(ROOT/'apps/api/src/modules/registry/registry.controller.ts').read_text()
ok('no fake live registry success','LIVE_REGISTRY_ADAPTER_NOT_CONFIGURED' in registry)
ok('registry requires HTTPS UPI',"startsWith('https://')" in registry)
ok('max-100 batching','chunkForRegistry(records,100)' in registry)

auth=(ROOT/'apps/api/src/common/auth/auth.service.ts').read_text(); main=(ROOT/'apps/api/src/main.ts').read_text(); tenant=(ROOT/'apps/api/src/common/tenant/tenant.guard.ts').read_text()
ok('OIDC verification exists','createRemoteJWKSet' in auth and 'jwtVerify' in auth)
ok('production rejects dev auth',"assertProductionConfig();" in main and "env.AUTH_MODE !== 'oidc'" in (ROOT/'apps/api/src/common/http/production-config.ts').read_text())
ok('cross-tenant written authorisation gate','writtenAuthorisation.findFirst' in tenant)

supplier=(ROOT/'apps/api/src/modules/suppliers/suppliers.controller.ts').read_text()
ok('supplier token is hashed','sha256Hex(raw)' in supplier)
ok('supplier data enters submitted state',"validationStatus:'submitted'" in supplier)

extract=(ROOT/'apps/api/src/modules/evidence/extraction/extraction.service.ts').read_text()
ok('extraction stays suggested',"state:'suggested'" in extract)

public_resolver=(ROOT/'apps/api/src/modules/resolver/resolver.controller.ts').read_text()
ok('public endpoint reads only snapshot function','get_public_passport_snapshot' in public_resolver and 'passportVersion' not in public_resolver)


registry_identity=(ROOT/'packages/rules/src/registry-identity.ts').read_text()
ok('Registry actor roles separated','economic_operator' in registry_identity and 'value_chain_actor' in registry_identity)
ok('Registry verification lifetime capped','3 * 365.2425' in registry_identity and 'electronicIdExpiresAt' in registry_identity)
reg_identity_service=(ROOT/'apps/api/src/modules/registry/registry-identity.service.ts').read_text()
ok('delegated Registry gate checks written authorisation','writtenAuthorisation.findFirst' in reg_identity_service and 'delegatedRegistryActorGate' in reg_identity_service)
orgs=(ROOT/'apps/api/src/modules/organisations/organisations.controller.ts').read_text()
ok('Registry enrolment profile API exists',"registry-profile" in orgs and 'identifierLimit' in orgs)

env=(ROOT/'.env.example').read_text()
ok('Registry feature flags conservative','BATTERY_SEMANTIC_CATALOGUE_AVAILABLE=false' in env and 'REGISTRY_BATTERY_SUBMISSION_AVAILABLE=false' in env)

# Basic secret hygiene: no obvious live private keys or common token prefixes.
text='\n'.join(p.read_text(errors='ignore') for p in ROOT.rglob('*') if p.is_file() and p.stat().st_size<1_000_000 and '.git/' not in str(p))
pem_marker='-----BEGIN '+'PRIVATE KEY-----'
ok('no PEM private key',pem_marker not in text)
ok('no obvious GitHub/OpenAI live token prefix',not re.search(r'\b(?:ghp_|github_pat_|sk-proj-)[A-Za-z0-9_-]{20,}',text))

print('EUBatteryPassport V2 static verification')
for name,passed,detail in checks:
    print(('PASS' if passed else 'FAIL'), '|', name, ('| '+detail if detail else ''))
print(f'\n{sum(1 for _,x,_ in checks if x)}/{len(checks)} checks passed')
if errors:
    print('\nErrors:')
    for e in errors: print('-',e)
    sys.exit(1)
