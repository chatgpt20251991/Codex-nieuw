# EU DPP Registry Integration Strategy — v0.1

## Current confirmed state — 5 Sep 2026
- EU DPP Registry is operational.
- A testing environment is available.
- Full DPP payload is not stored by the Registry.
- Battery DPP registration is not yet successfully available because the battery semantic catalogue has not yet been defined.
- Batteries currently use item-level registration in the user guide.
- UPI is a mandatory URL-format value and must start with HTTPS.
- File submission supports JSON or XML.
- Current file batch limit is 100 DPP registration requests.
- A failed DPP in a multi-DPP submission can cause the entire submission to be rejected.
- Successful registrations return Registry identifiers/status information; failure details must be persisted.
- The Registry regulation includes an API, but the product must not depend on undocumented/unstable API details.

## Adapter contract
interface RegistryAdapter {
  prepare(item, passportVersion): PreparedRegistryPayload
  validateLocally(payload): ValidationResult
  submit(payload): SubmissionReceipt
  poll(receipt): RegistryResult
  cancel?(receipt): Result
}

## Adapters
1. `eu_registry_manual`
2. `eu_registry_json_batch`
3. `eu_registry_xml_batch`
4. `eu_registry_api`

API adapter remains feature-flagged until official integration documentation is available and tested.

## Batch safety
Never send arbitrary groups of 100.
Group by:
- organisation
- category
- schema version
- legal rule version
Prevalidate every item before batch upload, because one bad record may reject the batch.

## Identity / verification
Production organisation onboarding must support Registry verification prerequisites.
For a legal person, current user guidance requires a qualified electronic seal (QSeal) from an eIDAS Qualified Trust Service Provider when using the PDF verification path.
Organisation data must match certificate attributes exactly.

## Service-provider operation
The platform keeps:
- customer written authorisation
- verified organisation identities
- per-submission audit trail
- payload hash
- correlation ID
- status/outcome
- Registry URI/identifier after success
- exported error report

The responsible economic operator remains accountable even when EUBatteryPassport.nl performs registry actions on its behalf.
