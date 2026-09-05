# EUBatteryPassport Build Pack v0.1

This is the first executable product specification for turning EUBatteryPassport.nl into a Battery DPP SaaS/service-provider platform.

Start here:
1. `01_MASTER_BLUEPRINT.md`
2. `02_71_DATA_POINTS.json`
3. `08_CODEX_MASTER_PROMPT.md`

Then implement:
- database
- compliance engine
- evidence layer
- public/restricted passport views
- registry adapter

Current deliberate limitation:
The software must NOT pretend batteries can already be successfully registered in the EU DPP Registry. As of 5 Sep 2026, the Commission's Registry User Guide says successful battery registration is not currently available because the battery semantic catalogue has not yet been defined.
