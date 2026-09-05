# Registry contract source ledger — 5 September 2026

## Verified public sources

The [Commission Registry User Guide for Economic Operators](https://single-market-economy.ec.europa.eu/document/download/079a45e2-469f-4eec-b1e5-32e8e05d1357_en?filename=dpp_registry_user_guide_for_economic_operators.pdf) is **v1.02, published 24 August 2026**, checked 5 September 2026.

| Location | Documented constraint |
|---|---|
| pp. 47, 53 | Battery semantic catalogue remains unfinished; successful battery registration is unavailable. |
| pp. 48–49, 52 | Item granularity; mandatory HTTPS UPI, maximum 2000 characters; optional model/batch identifiers in the form. |
| pp. 50, 55 | JSON/XML file submission; at most 100 registration requests per file. |
| pp. 53, 55 | One invalid DPP rejects the entire file; duplicate identifiers are rejected. |
| pp. 52–54 | Correlation ID, processing/success/failure outcomes, per-item identifiers or errors, and CSV error export. |

Page 50 describes downloadable JSON/XML templates inside the Registry submission flow. Those templates were not obtained. The public PDF does not specify their exact keys, XML structure, namespace or transport API contract. A bounded official-domain search found no further public battery wire contract; this does not establish that templates do not exist.

The [Commission Registry overview](https://single-market-economy.ec.europa.eu/single-market/digital-product-passport/dpp-registry_en), checked on the same date, describes an identifier/registration index with decentralised passport data, and links a separate test environment. The page displays no publication date.

[Implementing Regulation (EU) 2026/1778](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=OJ:L_202601778), dated 16 July 2026, establishes semantic verification and Registry-generated registration identifiers in Article 8. Articles 11–12 require versioned common models and an authoritative semantic repository with publicly documented APIs. These provisions do not themselves define a battery JSON/XML payload or endpoint.

## Engineering boundary

Gate 6 fixtures are application-owned preparation formats informed by the constraints above. They are explicitly internal drafts, carry an application namespace and `uploadable: false`, and do not claim conformance to an official upload schema. Their identifiers and hashes support internal tracing; a local correlation ID is not an external Registry receipt.

Grouping by tenant, battery category, passport schema and rule-set version is this repository's safety policy. Complete-candidate validation before grouping/chunking is also an internal policy. The documented EU count limit and all-or-nothing outcome apply to each submitted file.

Export, local validation and blocked submission must never establish `registered`, an external correlation ID or a Registry URI. Keep both live flags false. Eventual enablement requires obtaining and recording the applicable official templates/semantic assets and their source/version/hash, implementing their exact mapping, and passing real authenticated Registry integration tests. Passing internal fixture tests does not satisfy that requirement.
