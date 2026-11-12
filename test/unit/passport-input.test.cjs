const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const source = fs.readFileSync(path.join(__dirname, '../../apps/web/lib/passport-input.ts'), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const exported = {};
new Function('exports', compiled)(exported);

test('Passport inputs preserve explicit zero and false without turning absence into a measured value', () => {
  assert.equal(exported.parsePassportInput('0', 'number'), 0);
  assert.equal(exported.parsePassportInput('false', 'boolean'), false);
  assert.equal(exported.parsePassportInput('00123', 'text'), '00123');
  assert.equal(exported.parsePassportInput('12.50', 'number'), 12.5);
  for (const input of ['', ' ', 'NaN', 'Infinity', '1e999', '0x10', '12,5', '1 kg']) assert.throws(() => exported.parsePassportInput(input, 'number'));
  for (const input of ['', '0', 'False', 'yes']) assert.throws(() => exported.parsePassportInput(input, 'boolean'));
});

test('Structured passport values retain object/list types and reject incomplete or primitive JSON', () => {
  assert.deepEqual(exported.parsePassportInput('{"mass":0,"recycled":false}', 'structured'), { mass: 0, recycled: false });
  assert.deepEqual(exported.parsePassportInput('[{"element":"Li"}]', 'structured'), [{ element: 'Li' }]);
  for (const input of ['{', 'null', '12', 'false', '"text"']) assert.throws(() => exported.parsePassportInput(input, 'structured'));
});

test('Public passport links cannot become executable or credential-bearing browser destinations', () => {
  assert.equal(exported.publicPassportLink('https://id.example/b/123'), 'https://id.example/b/123');
  for (const input of ['javascript:alert(1)', 'data:text/html,attack', 'http://id.example/b/123', 'https://user:secret@id.example/b/123', '//evil.example', undefined, {}]) assert.equal(exported.publicPassportLink(input), undefined);
});
