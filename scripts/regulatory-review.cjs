'use strict';
// Offline preparation audit. Never imported by the API or an active rule profile.
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');
const checkedAt = '2026-10-09';
const sourceUrls = Object.freeze({
  batteries: 'https://eur-lex.europa.eu/eli/reg/2023/1542/oj',
  draft: 'https://op.europa.eu/en/publication-detail/-/publication/7da524b6-bc01-11f1-81de-01aa75ed71a1/language-en',
  consultation: 'https://ec.europa.eu/info/law/better-regulation/brpapi/groupInitiatives/14460',
  espr_citation: 'https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32026D1736',
  faq: 'https://single-market-economy.ec.europa.eu/single-market/digital-product-passport/eu-digital-product-passport-faq-batteries_en',
  harmonisation_list: 'https://single-market-economy.ec.europa.eu/single-market/goods/european-standards/harmonised-standards/digital-product-passport-dpp_en',
  restricted_access_initiative: 'https://ec.europa.eu/info/law/better-regulation/brpapi/groupInitiatives/16473',
  nen_18219: 'https://www.nen.nl/nen-en-18219-2026-en-352707',
  nen_18220: 'https://www.nen.nl/en/nen-en-18220-2026-en-352706',
  nen_18239: 'https://www.nen.nl/nen-en-18239-2026-en-356885',
  nen_18246: 'https://www.nen.nl/nen-en-18246-2026-en-356883',
  cen_18239: 'https://standards.cencenelec.eu/ords/f?cs=1C97AB3E731BCF82E3BD2A04D9D8DC8CD&p=205%3A110%3A%3A%3A%3A%3AFSP_PROJECT%3A81494',
  cen_18246: 'https://standards.cencenelec.eu/ords/f?cs=1C627F97280D3E45FBBBED053BCCA88A9&p=205%3A110%3A%3A%3A%3A%3AFSP_PROJECT%3A81495',
});
const migrationCases = Object.freeze([
  'published_upi_stable', 'legacy_qr_still_resolves', 'new_identifier_collision_rejected',
  'immutable_versions_preserved', 'restricted_data_stays_private', 'unreviewed_profile_rejected',
]);

function sourceDigest(sources) {
  return createHash('sha256').update(JSON.stringify(sources)).digest('hex');
}

function date(value) {
  assert.match(value, /^\d{4}-\d{2}-\d{2}$/, 'Expected calendar date YYYY-MM-DD');
  const parsed = new Date(`${value}T00:00:00.000Z`);
  assert.equal(parsed.toISOString().slice(0, 10), value, 'Invalid calendar date');
  return parsed;
}

// A planning helper for Article 10(2) minima only, never for identifier/QR changes.
// Null preserves uncertainty until the FINAL act's entry into force is verified.
function industrialMinimumApplicationDate(finalEntryIntoForce) {
  if (finalEntryIntoForce === null) return null;
  const start = date(finalEntryIntoForce);
  const target = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 18, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(start.getUTCDate(), lastDay));
  return new Date(Math.max(target.getTime(), date('2027-08-18').getTime())).toISOString().slice(0, 10);
}

function review(ledger, inventory, repositoryRoot = root) {
  assert.equal(ledger.schema, 'eubp.regulatory-preparation.v1');
  assert.equal(ledger.checkedAt, checkedAt);
  assert.equal(ledger.preparationOnly, true, 'This ledger cannot activate runtime policy');
  assert.equal(ledger.sourceIntegrityScope, 'Local source metadata only; original publication bytes are not archived or authenticated by this digest.');
  assert.equal(ledger.sourceCatalogSha256, sourceDigest(ledger.sources), 'Source metadata changed without review');
  assert.deepEqual(ledger.sources.map(s => s.id).sort(), Object.keys(sourceUrls).sort());
  for (const source of ledger.sources) {
    assert.equal(source.url, sourceUrls[source.id], `Unexpected official source URL: ${source.id}`);
    assert.equal(source.checkedAt, checkedAt);
    assert.ok(source.locator && source.authority);
  }
  assert.deepEqual(ledger.runtimeFlags, {
    BATTERY_SEMANTIC_CATALOGUE_AVAILABLE: false,
    REGISTRY_BATTERY_SUBMISSION_AVAILABLE: false,
    ARTICLE_77_9_ACCESS_ACT_FINAL: false,
  }, 'Official integration/access flags must remain false');

  const legal = ledger.legal;
  assert.equal(legal.currentIdentifierBasis.reference, 'Regulation (EU) 2023/1542 Article 77(3)');
  assert.equal(legal.currentIdentifierBasis.family, 'ISO/IEC 15459 or equivalent');
  assert.equal(legal.currentIdentifierBasis.scope, 'qr_code_and_unique_identifier');
  assert.deepEqual(legal.currentIdentifierBasis.editions, ['15459-1:2014', '15459-2:2015', '15459-3:2014', '15459-4:2014', '15459-5:2014', '15459-6:2014']);
  assert.equal(legal.currentIdentifierBasis.sourceId, 'batteries');
  assert.equal(legal.currentIdentifierBasis.implementationConformityEstablished, false);
  assert.equal(legal.passportDeadline, '2027-02-18');
  assert.equal(legal.draft.reference, 'Ares(2026)9188325');
  assert.equal(legal.draft.publishedAt, '2026-09-29');
  assert.equal(legal.draft.consultationEndsAt, '2026-10-27');
  assert.equal(legal.draft.status, 'draft_consultation');
  assert.equal(legal.draft.binding, false, 'A consulted draft is not binding law');
  assert.equal(legal.draft.finalPublication, null);
  assert.equal(legal.draft.entryIntoForce, null);
  assert.equal(legal.draft.identifierQrApplicationDate, null, 'Do not apply Article 10 timing to QR/identifiers');
  assert.deepEqual(legal.draft.sourceIds, ['draft', 'consultation']);
  assert.deepEqual(legal.draft.proposedArticle77References, { identifier: 'EN 18219:2026', carrier: 'EN 18220:2026', equivalentStandardsAllowed: true });
  assert.equal(legal.industrialMinimums.applicationRule, 'later_of_2027_08_18_and_final_entry_into_force_plus_18_calendar_months');
  assert.equal(legal.industrialMinimums.scope, 'rechargeable_industrial_gt_2kwh_excluding_exclusively_external_storage');
  assert.equal(legal.industrialMinimums.finalEntryIntoForce, null);
  assert.equal(legal.industrialMinimums.applicationDate, industrialMinimumApplicationDate(null));
  assert.equal(legal.industrialMinimums.activeDraftThresholds, false);
  assert.equal(legal.industrialMinimums.passportExemptionInferred, false);
  assert.deepEqual(legal.industrialMinimums.sourceIds, ['batteries', 'draft']);
  assert.equal(legal.restrictedAccessAct.status, 'pending_final_binding_act');
  assert.equal(legal.restrictedAccessAct.finalPublication, null);
  assert.equal(legal.restrictedAccessAct.sourceId, 'faq');
  assert.deepEqual(legal.restrictedAccessAct.corroboratingSourceIds, ['restricted_access_initiative']);

  assert.deepEqual(ledger.standards.map(s => s.id).sort(), ['EN 18219:2026', 'EN 18220:2026', 'EN 18239:2026', 'EN 18246:2026']);
  for (const standard of ledger.standards) {
    assert.equal(standard.published, true);
    for (const field of ['fullTextReviewed', 'profileImplemented', 'deploymentVerified', 'activeProfile']) {
      assert.equal(standard[field], false, `${standard.id}: ${field} requires a separately reviewed release`);
    }
    assert.equal(standard.conformityClaim, false);
    assert.deepEqual(standard.reviewEvidence, []);
    assert.ok(standard.sourceIds.length && standard.sourceIds.every(id => sourceUrls[id]));
    if (['EN 18219:2026', 'EN 18220:2026'].includes(standard.id)) {
      assert.deepEqual(standard.ojCitation, { status: 'cited', scope: 'ESPR_2024_1781', sourceId: 'espr_citation' });
      assert.equal(standard.batteryArticle77Reference, 'proposed_only');
    } else {
      assert.equal(standard.ojCitation.status, 'not_verified_pending_review');
      assert.equal(standard.ojCitation.sourceId, 'faq');
      assert.deepEqual(standard.ojCitation.corroboratingSourceIds, ['harmonisation_list']);
      assert.equal(standard.nenPublishedAt, '2026-09-01');
      assert.equal(standard.nenRegistrationAt, '2026-09-21');
      assert.equal(standard.cenAvailableAt, '2026-09-16');
    }
  }

  assert.equal(inventory.schema, 'eubp.normative-mapping-preparation.v1');
  assert.equal(inventory.checkedAt, checkedAt);
  assert.equal(inventory.normConformityEstablished, false);
  const controlIds = new Set(inventory.controls.map(c => c.id));
  assert.equal(controlIds.size, inventory.controls.length);
  for (const control of inventory.controls) {
    assert.ok(control.observation && control.remainingReview);
    assert.equal(control.normativeComplianceVerified, false);
    for (const file of [...control.codeRefs, ...control.regressionRefs]) {
      assert.ok(!path.isAbsolute(file) && !file.split(/[\\/]/).includes('..'), 'Repository-relative references only');
      assert.ok(fs.statSync(path.join(repositoryRoot, file)).isFile(), `Missing implementation reference: ${file}`);
    }
  }
  assert.deepEqual(inventory.normativeMappings.map(m => m.standardId).sort(), ledger.standards.map(s => s.id).sort());
  for (const mapping of inventory.normativeMappings) {
    assert.equal(mapping.status, 'full_text_review_pending');
    assert.equal(mapping.clause, null);
    assert.equal(mapping.requiredBehaviour, null);
    assert.equal(mapping.reviewedAt, null);
    assert.equal(mapping.reviewer, null);
    assert.equal(mapping.deploymentEvidence, null);
    assert.deepEqual(mapping.requiredTests, []);
    assert.deepEqual(mapping.deviations, []);
    assert.ok(mapping.relatedControlIds.length && mapping.relatedControlIds.every(id => controlIds.has(id)));
  }
  assert.equal(ledger.identifierMigration.status, 'test_plan_not_executed');
  assert.equal(ledger.identifierMigration.normativeSyntaxSelected, false);
  assert.equal(ledger.identifierMigration.qrNormativeSettingsSelected, false);
  assert.deepEqual(ledger.identifierMigration.cases.map(c => c.id).sort(), [...migrationCases].sort());
  assert.ok(ledger.identifierMigration.cases.every(c => c.status === 'planned' && c.acceptance));
  return { checkedAt, preparationOnly: true, standards: ledger.standards.length,
    controls: inventory.controls.length, migrationCasesPlanned: migrationCases.length,
    activeProfiles: 0, runtimePolicyChanged: false, sourceIntegrityScope: 'local_metadata_only' };
}

function load() {
  const read = name => JSON.parse(fs.readFileSync(path.join(root, 'docs/regulatory', name), 'utf8'));
  return { ledger: read('ledger.json'), inventory: read('control-inventory.json') };
}

if (require.main === module) {
  try {
    const { ledger, inventory } = load();
    console.log(JSON.stringify(review(ledger, inventory), null, 2));
  } catch (error) {
    console.error(`Regulatory preparation review failed: ${error.message}`);
    process.exitCode = 1;
  }
}
module.exports = { review, load, sourceDigest, industrialMinimumApplicationDate };
