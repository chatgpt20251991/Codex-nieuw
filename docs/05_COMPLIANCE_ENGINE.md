# Compliance Engine — v0.1

## Rule classes
### 1. Applicability rules
Determine required/conditional/deferred/not-displayed from:
- legal rule-set version
- battery category
- effective date
- battery characteristics
- lifecycle state

### 2. Schema rules
Validate data type, permitted values, units, range and format.

### 3. Cross-field rules
Initial rules to implement:
- BP-X001: min_voltage <= nominal_voltage <= max_voltage
- BP-X002: original_power_capability >= 0
- BP-X003: capacity > 0
- BP-X004: weight > 0
- BP-X005: manufacture_date cannot be in the future
- BP-X006: UPI unique across platform
- BP-X007: battery category must be EV/LMT/INDUSTRIAL_GT_2KWH
- BP-X008: field 33 required only for EV under current 2027 guidance
- BP-X009: field 61 required only for EV under current 2027 guidance
- BP-X010: fields 62-66 not displayed for EV under current 2027 guidance
- BP-X011: dynamic capacity cannot be negative
- BP-X012: capacity fade should be consistent with baseline capacity and current capacity
- BP-X013: resistance increase should be consistent with baseline/current resistance
- BP-X014: battery status transitions must follow permitted lifecycle transitions
- BP-X015: a repurposed/reused/remanufactured item must link to prior passport(s)
- BP-X016: RECYCLED state closes active passport publication
- BP-X017: authority-only evidence/test reports can never be exposed through public endpoint
- BP-X018: restricted-model values can never be exposed through public endpoint
- BP-X019: restricted-item values can never be exposed through public endpoint
- BP-X020: registry submission blocked unless UPI uses HTTPS URL form expected by Registry
- BP-X021: Registry submission blocked if passport validation has blockers
- BP-X022: never mark a battery REGISTERED without successful Registry response/URI
- BP-X023: every validated value must have provenance
- BP-X024: every published passport version is immutable; changes generate a new version

### 4. Evidence rules
Every validated value stores:
- origin actor
- evidence ID or system source
- received timestamp
- integrity hash
- validator state
For generated/calculated values, store the formula/version and all source value IDs.

### 5. Regulatory feature flags
- battery_semantic_catalogue_available = false
- registry_battery_registration_available = false
- article_77_9_access_act_final = false
- en_18239_profile_implemented = false
- en_18246_profile_implemented = false

These flags must be admin-controlled and versioned. Never simulate final EU behaviour when a required EU component is not live.
