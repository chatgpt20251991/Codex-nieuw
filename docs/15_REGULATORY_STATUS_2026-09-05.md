# Regulatory status — 5 September 2026

This is an engineering status ledger, not legal advice. Re-check before production releases.

## Confirmed now

### Battery passport deadline
From 18 February 2027, EV batteries, LMT batteries and industrial batteries >2 kWh within scope require a battery passport under Regulation (EU) 2023/1542.

### 71-point Commission guidance
The Commission published updated battery-passport guidance on 21 August 2026; the underlying data-point document is dated 15 August 2026 and maps 71 data points across EV, LMT and industrial battery categories. The guidance is preparatory/non-authoritative and can be updated.

### DPP Registry
The EU DPP Registry became operational on 20 July 2026. It is an index/registration system; the full DPP remains decentralised with the economic operator or DPP service provider.

### Battery registrations remain blocked
The current Commission Registry User Guide says successful registration of battery DPPs is not currently available because the semantic catalogue for batteries has not yet been defined. Therefore production flags remain:
- `BATTERY_SEMANTIC_CATALOGUE_AVAILABLE=false`
- `REGISTRY_BATTERY_SUBMISSION_AVAILABLE=false`

### Registry file constraints currently documented
- UPI is URL based and current UI requires `https://`.
- File submissions accept JSON/XML.
- Maximum 100 DPP registration requests per file.
- One invalid DPP can reject the whole multi-DPP submission.
- The Registry returns a correlation ID and, after success, a Registry URI / Unique Registration Identifier.

### Organisation verification
Commission Implementing Regulation (EU) 2026/1778 distinguishes:
- verified economic operator (Article 4), and
- verified value-chain actor (Article 5), which includes DPP service providers.

A legal person can obtain verified status using a qualified electronic seal / qualified certificate or other allowed qualified electronic attestation route. Verified status lasts until the electronic identification means expires and in any event no longer than three years.

If a verified economic operator authorises a third party to perform Registry actions on its behalf, Article 19(4) requires the third-party actor to follow the Article 5 verification process.

Platform consequence: delegated registration is blocked unless:
1. responsible EO Registry identity is currently verified;
2. service-provider/value-chain-actor Registry identity is currently verified;
3. an active written authorisation exists;
4. passport compliance gate passes;
5. battery semantic/Registry integration gate passes.

### Legal-person enrolment details from current Commission User Guide
The current User Guide asks legal-person applicants for registered legal name, legal address, country of registration, identifier and compliance contact. Listed identifier options include NTR (preferred), LEI, VAT, eID and local definition. Legal representative first name, last name and email are captured for the verification flow.

For the PDF-based legal-person verification path, the guide requires a QSeal from a QTSP and says key certificate subject attributes must match the form, including organisationName (OID 2.5.4.10), countryName (2.5.4.6) and organizationIdentifier (2.5.4.97). The guide currently accepts PAdES Baseline B/T/LT/LTA for that PDF flow.

## Harmonised DPP standards
Commission Implementing Decision (EU) 2026/1736 published references to six standards:
- EN 18216:2026 — Data exchange protocols
- EN 18219:2026 — Unique identifiers
- EN 18220:2026 — Data carriers
- EN 18221:2026 — Data storage, archiving and persistence
- EN 18222:2026 — APIs for lifecycle management and searchability
- EN 18223:2026 — System interoperability

As of this check, the Commission DPP roadmap still lists an Implementing Decision for the remaining two DPP standards for September 2026. Do not claim those remaining two are harmonised until an Official Journal reference is found.

## Still pending / do not hard-code
- Battery Article 77(9) access-rights implementing act: Commission roadmap currently indicates Q4 2026.
- Remaining two DPP standards: roadmap says September 2026; not confirmed adopted in this check.
- DPP Service Provider delegated act/certification requirements: still future. The Commission roadmap currently contains service-provider milestones in 2027; exact final timing/requirements must be re-checked before claims or certification logic are enabled.
- Final battery semantic catalogue / schema and production Registry contract.

## Primary sources
- Regulation (EU) 2023/1542: https://eur-lex.europa.eu/eli/reg/2023/1542/oj
- Regulation (EU) 2024/1781: https://eur-lex.europa.eu/eli/reg/2024/1781/oj
- Commission Implementing Regulation (EU) 2026/1778: https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=OJ:L_202601778
- Commission Implementing Decision (EU) 2026/1736: https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32026D1736
- Commission DPP homepage: https://single-market-economy.ec.europa.eu/single-market/digital-product-passport_en
- Battery DPP page: https://single-market-economy.ec.europa.eu/single-market/digital-product-passport/batteries_en
- DPP Registry page: https://single-market-economy.ec.europa.eu/single-market/digital-product-passport/dpp-registry_en
