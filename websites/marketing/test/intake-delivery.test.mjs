import assert from 'node:assert/strict';
import test from 'node:test';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {claimIntake,acknowledgeIntake,workerReady,authorizedWorker,sha256,deliveryStatus,DELIVERY_LEASE_MS} from '../lib/intake-delivery.ts';

function database() {
  const sql = new DatabaseSync(':memory:');
  for (const file of readdirSync(new URL('../drizzle/',import.meta.url)).filter(f=>f.endsWith('.sql')).sort()) sql.exec(readFileSync(new URL('../drizzle/'+file,import.meta.url),'utf8'));
  function prepare(query) {
    const statement=sql.prepare(query); let parameters=[];
    return {bind(...args){parameters=args;return this;},async first(){return statement.get(...parameters)??null;},async all(){return {results:statement.all(...parameters)};},async run(){return {meta:{changes:Number(statement.run(...parameters).changes)}};},query:()=>statement.all(...parameters)};
  }
  return {sql,prepare,async batch(statements){sql.exec('BEGIN');try{const result=statements.map(s=>({results:s.query()}));sql.exec('COMMIT');return result;}catch(e){sql.exec('ROLLBACK');throw e;}}};
}
function seed(db,{id=crypto.randomUUID(),now=1000000,attempts=0}={}){
  db.sql.prepare("INSERT INTO intakes (id,company,email,application,message,created_at,ip_hash,delivery_status,attempts) VALUES (?, 'Testbedrijf','test@example.com','Energieopslag','Test',?,'hash','pending',?)").run(id,now,attempts); return id;
}

test('missing, malformed and incorrect credentials fail closed; a dedicated token authenticates',async()=>{
  const token='ab'.repeat(32), hash=await sha256(token);
  for(const header of ['', 'Bearer short', 'Bearer '+'cd'.repeat(32)]) assert.equal(await authorizedWorker(new Request('https://example.com',{headers:{authorization:header}}),hash),false);
  const request=new Request('https://example.com',{headers:{authorization:'Bearer '+token}});
  assert.equal(await authorizedWorker(request,undefined),false);
  assert.equal(await authorizedWorker(request,hash),true);
});
test('parallel polls cannot claim the same pending intake',async()=>{
  const db=database(); seed(db);
  const results=await Promise.all([claimIntake(db,2000000),claimIntake(db,2000000)]);
  assert.equal(results.filter(Boolean).length,1);
  assert.equal(await workerReady(db,2000001),true);
  assert.equal(await workerReady(db,3000001),false);
  db.sql.close();
});
test('a crashed worker can reclaim after expiry; stale acknowledgement cannot affect the new claim',async()=>{
  const db=database();const id=seed(db);
  const first=await claimIntake(db,2000000);assert.ok(first);
  assert.equal(await claimIntake(db,2000001),null);
  const second=await claimIntake(db,2000000+DELIVERY_LEASE_MS+1);assert.ok(second);
  assert.notEqual(first.lease,second.lease);
  assert.equal(await acknowledgeIntake(db,id,first.lease,'accepted'),false);
  assert.equal(await acknowledgeIntake(db,id,second.lease,'accepted'),true);
  assert.equal(await acknowledgeIntake(db,id,second.lease,'accepted'),true);
  assert.equal(await claimIntake(db,9000000),null);
  db.sql.close();
});
test('rejected mail retries after backoff; acceptance and uncertain outcomes stop automatic sends',async()=>{
  const db=database();const id=seed(db);const job=await claimIntake(db,2000000);
  assert.equal(await acknowledgeIntake(db,id,job.lease,'retry',2000000),true);
  assert.equal(await claimIntake(db,2000001),null);
  const retry=await claimIntake(db,2200000); assert.ok(retry);
  assert.equal(await acknowledgeIntake(db,id,retry.lease,'uncertain',2200000),true);
  assert.equal(await claimIntake(db,9000000),null);
  const status=await deliveryStatus(db,9000000);
  assert.equal(status.counts.find(x=>x.status==='uncertain').total,1);
  assert.equal(status.oldestUnacceptedAt,1000000);
  db.sql.close();
});
test('last-attempt acceptance can be reconciled after lease expiry without sending another message',async()=>{
  const db=database();const id=seed(db,{attempts:11});const job=await claimIntake(db,2000000);
  assert.equal(job.attempts,12);
  assert.equal(await claimIntake(db,2700000),null);
  assert.equal(await acknowledgeIntake(db,id,crypto.randomUUID(),'accepted',2700001),false);
  assert.equal(await acknowledgeIntake(db,id,job.lease,'accepted',2700001),true);
  assert.equal(await claimIntake(db,9900000),null);
  db.sql.close();
});
test('database errors fail instead of pretending a job was claimed or accepted',async()=>{
  const db=database();db.sql.close();
  await assert.rejects(()=>claimIntake(db));
  await assert.rejects(()=>acknowledgeIntake(db,crypto.randomUUID(),crypto.randomUUID(),'accepted'));
});
