# Regulatory Assumptions — snapshot 5 September 2026

This is configuration context, not legal advice.

## Re-checked official baseline
- Regulation (EU) 2023/1542 remains the core battery-passport legal basis.
- European Commission battery DPP page lists 18 February 2027 as the date the passport becomes mandatory for relevant battery categories placed on the EU market.
- Commission announcement of 21 August 2026 points to guidance last updated 15 August 2026 and describes category-specific mandatory, optional, conditional and not-yet-completed/displayed points.
- Commission Implementing Regulation (EU) 2026/1778 of 16 July 2026 sets implementation arrangements for the DPP Registry.
- Commission Implementing Decision (EU) 2026/1736 of 14 July 2026 publishes references to six harmonised DPP standards: EN 18216:2026, 18219:2026, 18220:2026, 18221:2026, 18222:2026 and 18223:2026.

## Software policy
The repository does not claim knowledge of detailed normative clauses that are not present in the public legal sources. Exact identifier, data-carrier, API and persistence profiles must be implemented after the standards are lawfully obtained and reviewed.

## Conservative feature flags
- `BATTERY_SEMANTIC_CATALOGUE_AVAILABLE=false`
- `REGISTRY_BATTERY_SUBMISSION_AVAILABLE=false`
- `ARTICLE_77_9_ACCESS_ACT_FINAL=false`

Change a flag only in a reviewed release with source evidence, integration tests and a recorded effective date.

## Official links
- https://eur-lex.europa.eu/eli/reg/2023/1542/oj
- https://single-market-economy.ec.europa.eu/single-market/digital-product-passport/batteries_en
- https://single-market-economy.ec.europa.eu/news/guidance-support-preparations-digital-batteries-passport-2026-08-21_en
- https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=OJ:L_202601778
- https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32026D1736
