const test = require('node:test'); const assert=require('node:assert/strict');
const r=require('../dist/index.js');
test('loads exactly 71 fields',()=>assert.equal(r.fields.length,71));
test('data point ids are exactly 1..71',()=>assert.deepEqual(r.fields.map(x=>x.id),Array.from({length:71},(_,i)=>i+1)));
test('deferred fields do not count as required for Feb 2027',()=>{ const x=r.calculateReadiness('EV',[]); assert.ok(x.deferred>=1); assert.ok(x.required<71); });
test('conditional points are not silently mandatory without context',()=>{ const x=r.calculateReadiness('EV',[]); assert.ok(x.conditionalOpen>0); });
test('conditional point becomes required when context activates it',()=>{ const a=r.calculateReadiness('EV',[]); const b=r.calculateReadiness('EV',[],{conditionalRequiredFieldIds:[35]}); assert.equal(b.required,a.required+1); assert.ok(b.blockers.some(x=>x.fieldId===35)); });
test('public field set never includes authority-only field 50',()=>assert.equal(r.publicFieldIds().includes(50),false));
test('voltage ordering blocks invalid values',()=>assert.equal(r.crossFieldChecks({minVoltage:10,nominalVoltage:9,maxVoltage:12}).some(x=>x.rule==='BP-X001'),true));
test('material fractions above 100 percent block',()=>assert.equal(r.crossFieldChecks({materialMassFractions:[60,50]}).some(x=>x.rule==='BP-X030'),true));
test('UPI requires https',()=>assert.equal(r.crossFieldChecks({upi:'http://x'}).some(x=>x.rule==='BP-X020'),true));
test('registry gate remains closed while semantic catalogue is unavailable',()=>assert.equal(r.registryGate({batterySemanticCatalogueAvailable:false,batteryRegistrationAvailable:false},0).allowed,false));
test('registry chunks never exceed 100',()=>assert.deepEqual(r.chunkForRegistry(Array.from({length:205},(_,i)=>i)).map(x=>x.length),[100,100,5]));
test('invalid direct state transition throws',()=>assert.throws(()=>r.transition('draft','registered')));
test('public access is always permitted',()=>assert.equal(r.decideAccess({tier:'public'}).allowed,true));
test('authority-only data is denied to ordinary operator',()=>assert.equal(r.decideAccess({tier:'authority_only',actorRole:'operator_admin'}).allowed,false));
test('legitimate-interest data requires explicit grant in current conservative policy',()=>assert.equal(r.decideAccess({tier:'legitimate_interest_model',actorRole:'operator_user'}).allowed,false));
test('explicit grant allows matching restricted tier',()=>assert.equal(r.decideAccess({tier:'legitimate_interest_model',explicitGrantTiers:['legitimate_interest_model']}).allowed,true));
test('delegated registry action requires verified economic operator and value-chain actor',()=>{
  const x=r.delegatedRegistryActorGate({
    responsibleOperator:{actorType:'economic_operator',status:'verified',verifiedAt:'2026-07-20T00:00:00Z',validUntil:'2027-01-01T00:00:00Z'},
    actingParty:{actorType:'value_chain_actor',status:'verified',verifiedAt:'2026-07-20T00:00:00Z',validUntil:'2027-01-01T00:00:00Z'},
    actingOnBehalf:true,hasActiveWrittenAuthorisation:true,now:'2026-09-05T00:00:00Z'
  });
  assert.equal(x.allowed,true);
});
test('delegated registry action fails when service provider verification expired',()=>{
  const x=r.delegatedRegistryActorGate({
    responsibleOperator:{actorType:'economic_operator',status:'verified',verifiedAt:'2026-07-20T00:00:00Z',validUntil:'2027-01-01T00:00:00Z'},
    actingParty:{actorType:'value_chain_actor',status:'verified',verifiedAt:'2026-07-20T00:00:00Z',validUntil:'2026-09-04T00:00:00Z'},
    actingOnBehalf:true,hasActiveWrittenAuthorisation:true,now:'2026-09-05T00:00:00Z'
  });
  assert.equal(x.allowed,false); assert.equal(x.code,'THIRD_PARTY_NOT_VERIFIED');
});
test('delegated registry action fails without active written authorisation',()=>{
  const x=r.delegatedRegistryActorGate({
    responsibleOperator:{actorType:'economic_operator',status:'verified',verifiedAt:'2026-07-20T00:00:00Z'},
    actingParty:{actorType:'value_chain_actor',status:'verified',verifiedAt:'2026-07-20T00:00:00Z'},
    actingOnBehalf:true,hasActiveWrittenAuthorisation:false
  });
  assert.equal(x.allowed,false); assert.equal(x.code,'NO_ACTIVE_WRITTEN_AUTHORISATION');
});

test('registry verification never survives more than three years',()=>assert.equal(r.identityIsCurrentlyVerified({actorType:'value_chain_actor',status:'verified',verifiedAt:'2023-09-01T00:00:00Z'},'2026-09-05T00:00:00Z'),false));
