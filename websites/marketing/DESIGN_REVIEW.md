# Enterprise design review — September 18, 2026

This revision is a design proposal, not a production release. The public Site remains
on version 3 until the new design is reviewed and its exact GitHub revision published.

## Direction

- Retain the battery with its physical passport tag, blue European horizon and landscape.
- Use a continuous EUbatterypassport.nl wordmark, locally hosted Manrope, editorial serif headings,
  restrained green actions and a deep navy background.
- Explain the service through structuring, preparing and maintaining passport information.
- Use professional Dutch address and describe agreed scope without promising regulatory approval.

The full domain is written as one continuous wordmark so EU is unambiguously part
of the name. Manrope is distributed under the bundled SIL Open Font License.
The landscape is reused. The battery image has an edited English BATTERY PASSPORT
label with six illustrative fields, the full domain, an illustrative QR motif and
an EXAMPLE DATA footer. It is not a registered passport or official certification.
Model EX-120, 200 Ah, 600 V and 120 kWh are fictional, internally consistent values.
The field categories are informed by Annex XIII of Regulation (EU) 2023/1542:
https://eur-lex.europa.eu/eli/reg/2023/1542/2025-07-31/eng/

## Responsive verification

Browser checks of the actual local website:

- Homepage widths 320, 360, 390, 430, 768, 1024 and 1440: no page or element horizontal overflow.
- All seven service/FAQ disclosures expanded at 320: no horizontal overflow.
- Mobile menu opens, closes and closes after anchor navigation.
- Example link and intake link reach the intended routes.
- Example, intake and privacy pages at 320: no horizontal overflow.
- Logo, battery and landscape images load; locally hosted fonts load.
- Desktop and mobile screenshots are retained in the task's external output folder.

TypeScript check, all 13 existing intake/worker tests and the production build passed.
No runtime flags, mail delivery behavior, data model or regulated platform code changed.
The intake availability gate and explicit fictitious example status remain intact.

## Publication

Use GITHUB_PUBLISHING.md after design review. Do not treat a preview, a draft PR or
passing CI as a live release. Intake activation still depends on the separate mail
processing handoff; this design proposal does not activate it.
