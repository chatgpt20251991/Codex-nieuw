# Brand and passport detail update V6 — September 19, 2026

The user requested a new unified logo with the European flag, battery and green
leaf, a populated hanging passport label, and removal of decorative strokes.
The approved example passport page and its artwork are preserved exactly.

- Replaced the metallic monogram and HTML wordmark with one generated transparent
  lockup reading EUbatterypassport.nl. The battery outline contains the blue flag
  and twelve gold stars, with an integrated green leaf. A matching favicon is used.
- Edited the existing hero image to include ID DEMO-EBP-001, model EX-120, LFP,
  120 kWh, 200 Ah and 600 V on the hanging metal Battery Passport. The domain and
  EXAMPLE DATA remain explicit. The battery and Europe composition are preserved.
- Removed the complete Digitale batterijpaspoorten eyebrow, the hero accent line,
  card-top gradient accents, closing accent and em dashes in title/accessible name.
  Functional borders and product identifiers are preserved.
- Responsive source files preserve mobile product visibility. The complete logo
  fits at 320, 360, 390, 430, 768, 1024 and 1440px without horizontal overflow.
- Browser checks confirm removed pseudo-element strokes, mobile menu operation,
  example navigation and unchanged example artwork/content. TypeScript, all 13
  existing intake/worker tests and production build pass.

Exactly two built-in image calls were used. Hero native resolution is 1672x941.
Logo source is 2161x728 RGBA, trimmed to 2191x243 including transparent margin;
800x89 and 400x44 exports plus a cropped 64px favicon are ordinary optimizations.
Full prompts and original images are retained in outputs/redesign-v6/assets outside
this checkout. No native 4K claim, EU endorsement or certification claim is made.

Dependencies, runtime flags, intake/backend logic and platform code are unchanged.
Publish the exact reviewed GitHub revision following GITHUB_PUBLISHING.md.

The V5 record below documents the preserved earlier design.

# Premium website experience — September 18, 2026

This revision replaces the V4 presentation while preserving the marketing site's
existing stack, online intake gates and all regulated-platform truth rules.

## Design

- Custom generated E/U emblem beside the complete continuous EUbatterypassport.nl
  wordmark; the full domain remains explicit in the accessible name and footer.
- Cinematic battery/Europe opening, a physical metal Battery Passport illustration,
  and a newly generated Alpine background. The mobile opening shows the battery
  and passport tag in the first viewport, using a distinct right-aligned crop.
- Rebuilt /voorbeeld with the generated product artwork and readable semantic
  product fields, source/evidence context and version-management explanation.
- EX-120, DEMO-EBP-001, 200 Ah, 600 V and 120 kWh are fictional example values.
  Nominal energy and nominal capacity use their correct units. No live registry,
  certificate, evidence document, or actual product history is implied.
- WebP responsive sources, lazy loading below the opening, local fonts, a trimmed
  transparent 256px logo and matching 64px favicon keep transfers appropriate.

## Image provenance and resolution

Four original assets were generated with the built-in image tool. Full prompts
and source PNGs are retained outside the website in outputs/redesign-v5/assets.
The requested native 3840 x 2160 output was not supplied by the tool: all three
wide originals are 1672 x 941. They are not 4K and have not been upscaled.
The symbol original is 1254 x 1254. 960px/640px web variants are downscaled from
originals; the symbol is transparently cropped and resized for web use.

## Verification

- Real browser review of the desktop and mobile homepage and example page.
- No horizontal overflow at 320, 360, 390, 430, 768, 1024 and 1440px.
- Mobile opening contains the loaded battery image; the entire hanging label fits.
- Mobile navigation opens and closes after anchor navigation.
- All seven home disclosures expand without overflow at 320px.
- Example, intake and privacy routes fit at 320px; example and intake links work.
- All artwork loads, including the deferred landscape when scrolling into view.
- TypeScript check and all 13 existing intake/worker tests pass. The production
  build passes; GitHub CI performs the clean install, build and security checks.
- Independent source/content review found no blocking issues. Landscape source
  sizing was increased for its tall mobile crop to avoid a low-resolution choice.

No mail delivery, runtime flags, dependency versions, data model, platform code,
or DNS settings changed. Intake availability remains independently gated.

## Publication

Publish the exact reviewed GitHub revision following GITHUB_PUBLISHING.md.
Release IDs and live checks are recorded outside the website checkout.
