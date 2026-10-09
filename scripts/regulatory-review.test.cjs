'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { review, load, sourceDigest, industrialMinimumApplicationDate } = require('./regulatory-review.cjs');

const original = load();
function changed(mutator) {
  const { ledger, inventory } = structuredClone(original);
  mutator(ledger, inventory);
  return () => review(ledger, inventory);
}

test('current preparation ledger references existing controls without claiming active profiles', () => {
  assert.deepEqual(review(original.ledger, original.inventory), {
    checkedAt: '2026-10-09', preparationOnly: true, standards: 4, controls: 5,
    migrationCasesPlanned: 6, activeProfiles: 0, runtimePolicyChanged: false,
    sourceIntegrityScope: 'local_metadata_only',
  });
});

test('Article 10 minima preserve unknown final dates and apply the later date', () => {
  assert.equal(industrialMinimumApplicationDate(null), null);
  assert.equal(industrialMinimumApplicationDate('2025-01-01'), '2027-08-18');
  assert.equal(industrialMinimumApplicationDate('2026-09-29'), '2028-03-29');
  assert.equal(industrialMinimumApplicationDate('2026-08-31'), '2028-02-29');
  assert.equal(industrialMinimumApplicationDate('2027-08-31'), '2029-02-28');
});

test('invalid or non-calendar final dates are rejected rather than rolled over', () => {
  for (const input of ['2027-02-29', '2026-13-01', '29/09/2026', '', undefined]) {
    assert.throws(() => industrialMinimumApplicationDate(input));
  }
});

test('draft publication or a consultation cannot be promoted to binding law', () => {
  for (const mutate of [
    l => { l.legal.draft.binding = true; },
    l => { l.legal.draft.status = 'adopted'; },
    l => { l.legal.draft.entryIntoForce = '2026-09-29'; },
    l => { l.legal.draft.finalPublication = 'Ares(2026)9188325'; },
    l => { l.legal.industrialMinimums.activeDraftThresholds = true; },
  ]) assert.throws(changed(mutate));
});

test('the industrial 18-month rule cannot be reused for QR or passport deadlines', () => {
  assert.throws(changed(l => { l.legal.draft.identifierQrApplicationDate = '2028-03-29'; }));
  assert.throws(changed(l => { l.legal.passportDeadline = '2028-03-29'; }));
  assert.throws(changed(l => { l.legal.industrialMinimums.applicationRule = 'eighteen_months_for_all_draft_changes'; }));
  assert.throws(changed(l => { l.legal.industrialMinimums.passportExemptionInferred = true; }));
});

test('ESPR citation cannot substitute the current battery Article 77 legal basis', () => {
  assert.throws(changed(l => { l.legal.currentIdentifierBasis.family = 'EN 18219:2026'; }));
  assert.throws(changed(l => { l.standards[0].ojCitation.scope = 'BATTERIES_2023_1542'; }));
  assert.throws(changed(l => { l.standards[0].batteryArticle77Reference = 'active'; }));
});

test('publication does not establish clause review, implementation or deployment', () => {
  for (const field of ['fullTextReviewed', 'profileImplemented', 'deploymentVerified', 'activeProfile', 'conformityClaim']) {
    assert.throws(changed(l => { l.standards[2][field] = true; }));
  }
  assert.throws(changed(l => { l.standards[2].ojCitation.status = 'cited'; }));
  assert.throws(changed(l => { l.preparationOnly = false; }));
});

test('source metadata changes require a reviewed digest and exact authoritative URL', () => {
  assert.throws(changed(l => { l.sources[0].locator = 'Changed claim'; }), /Source metadata/);
  assert.throws(changed(l => {
    l.sources[0].url = 'https://eur-lex.europa.eu.example.org/eli/reg/2023/1542/oj';
    l.sourceCatalogSha256 = sourceDigest(l.sources);
  }), /Unexpected official source URL/);
  assert.throws(changed(l => {
    l.sources[0].checkedAt = '2026-10-10';
    l.sourceCatalogSha256 = sourceDigest(l.sources);
  }));
});

test('final access-act and live Registry flags cannot be activated by this preparation', () => {
  for (const flag of Object.keys(original.ledger.runtimeFlags)) {
    assert.throws(changed(l => { l.runtimeFlags[flag] = true; }), /must remain false/);
  }
  assert.throws(changed(l => { l.legal.restrictedAccessAct.status = 'final'; }));
  assert.throws(changed(l => { l.legal.restrictedAccessAct.finalPublication = 'planning'; }));
});

test('mapping templates reject invented clauses and unsupported conformity claims', () => {
  assert.throws(changed((l, i) => { i.normativeMappings[1].clause = 'made-up-qr-margin'; }));
  assert.throws(changed((l, i) => { i.controls[0].normativeComplianceVerified = true; }));
  assert.throws(changed((l, i) => { i.normativeMappings[0].relatedControlIds = ['unknown_control']; }));
  assert.throws(changed((l, i) => { i.controls[0].codeRefs = ['../outside.ts']; }), /relative references/);
});

test('identifier continuity plan retains every case and never masquerades as execution', () => {
  assert.throws(changed(l => { l.identifierMigration.cases.shift(); }));
  assert.throws(changed(l => { l.identifierMigration.status = 'passed'; }));
  assert.throws(changed(l => { l.identifierMigration.cases[0].status = 'passed'; }));
  assert.throws(changed(l => { l.identifierMigration.normativeSyntaxSelected = true; }));
  assert.throws(changed(l => { l.identifierMigration.qrNormativeSettingsSelected = true; }));
});
