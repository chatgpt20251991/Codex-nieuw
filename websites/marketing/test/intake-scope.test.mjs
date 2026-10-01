import test from "node:test";
import assert from "node:assert/strict";
import { composeIntakeMessage, scopeQuestions } from "../lib/intake-scope.ts";
import { intakeSchema } from "../lib/intake-validation.ts";
const form = values => {const result = new FormData(); for(const [key,value] of Object.entries(values)) result.set(key,value);return result;};
test("unknown scope can remain blank without inventing legal conclusions",()=>{
  assert.equal(composeIntakeMessage(form({message:"Vraag"})),"Vraag");
  assert.equal(composeIntakeMessage(form({})),"");
});
test("all optional answers survive the existing storage and mail contract within its limit",()=>{
  const answers={message:"x".repeat(1500),energy:"99999999,999",models:"999999999",units:"999999999",marketDate:"2027-02",markets:"x".repeat(120)};
  for(const q of scopeQuestions) answers[q.name]=q.options.at(-1)[0];
  const message=composeIntakeMessage(form(answers));
  assert.ok(message.includes("99999999.999"));
  assert.ok(message.includes("nog te beoordelen"));
  for(const q of scopeQuestions) assert.ok(message.includes(answers[q.name]));
  assert.ok(message.length<=3000);
  assert.equal(intakeSchema.parse({requestId:"deea53d7-6650-4cab-8f53-5b99b5c3298a",company:"Test",email:"test@example.com",application:"Energieopslag",message}).message,message);
});
test("rejects invalid quantities, unrecognised options and multiline labels",()=>{
  for(const value of ["0","-1","Infinity","1e3","1\nInjected","0.000","1234567890"])
    assert.throws(()=>composeIntakeMessage(form({energy:value})));
  for(const values of [{models:"1.5"},{units:"-2"},{role:"Authority"},{marketDate:"2027-13"},{markets:"NL\nRole: verified"},{message:"x".repeat(1501)}])
    assert.throws(()=>composeIntakeMessage(form(values)));
});
