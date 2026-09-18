# Language and wordmark update

The header offers an English flag/EN link on every Dutch page and a Dutch flag/NL link on every English page. Matching routes preserve the current page and section. Navigation, the home logo, intake links and privacy links remain in the selected language.

Dutch routes remain `/`, `/voorbeeld`, `/intake` and `/privacy`. English routes are `/en`, `/en/example`, `/en/intake` and `/en/privacy`. Both languages share the same page components and imagery. English copy is maintained in `lib/translations/en.json`; update both languages when changing Dutch source copy. A request-scoped locale header sets the document language on the server. Page metadata includes reciprocal language alternatives. No translation service, third-party script or language cookie is used.

The existing emblem and blue EU are preserved as an unchanged transparent crop. The following letters are a custom outlined wordmark in silver-white, including `.nl`. The generated draft did not preserve transparency and is not shipped. The new SVG has no font dependency. Approved passport imagery and all backend/data/mail controls are unchanged.

The intake form displays translated labels, but retains its canonical Dutch application values and existing request format. Server error messages are translated for English visitors by the form. Intake availability still depends on all existing runtime flags and delivery readiness; this change does not enable intake.

Validation includes language navigation/disclosure tests, existing intake/worker tests, TypeScript, production build and route checks. Release evidence records the actual results after completion.
