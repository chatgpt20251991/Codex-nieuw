# Brand typography and seamless footer mark

The footer's inverse brand hides both the filled banner and its decorative edge, placing the existing original emblem directly on the footer background. The white masthead retains its blue banner. Header, navigation and page content layout remain unchanged.

The shared joined wordmark and one-line tagline now use self-hosted Source Sans 3: Semibold for the name and Regular for “Inzicht in elke batterij.” / “Insight into every battery.” The slogan is one SVG text line. Font preloads avoid a delayed brand-font request; system fallbacks remain available.

## Typography selection and license

The public MijnOverheid page was inspected on 2026-10-01 and preloads ROsanswebtextregular/italic/bold. The Rijkshuisstijl typography guidelines explicitly reserve Rijksoverheid Sans and Serif for government publications. Those restricted font files were not downloaded or incorporated. Source Sans 3 is a visually related humanist sans alternative, not the same font and not a claim of government affiliation.

Sources:
- https://mijn.overheid.nl/
- https://www.rijkshuisstijl.nl/publiek/modules/product/DigitalStyleGuide/default/index.aspx?ItemId=10512
- https://github.com/adobe-fonts/source-sans

Unmodified Adobe Source Sans 3 fonts and their SIL Open Font License were downloaded from pinned upstream commit `87b37a2daaed80fcb8e8ccb0085c4d72ddade12e`. Download bytes were verified against their upstream Git blob IDs.

| Local file | Upstream path | Git blob |
| --- | --- | --- |
| public/fonts/source-sans-3-regular.woff2 | WOFF2/TTF/SourceSans3-Regular.ttf.woff2 | e2401aa9f8a0eb98127e5435ac069d499600f6e9 |
| public/fonts/source-sans-3-semibold.woff2 | WOFF2/TTF/SourceSans3-Semibold.ttf.woff2 | a9aced0785d99c36eb13deae776e4297415999e7 |
| public/fonts/OFL-SourceSans3.txt | LICENSE.md | 22c601b82f29fc6bb801445098c9f23ffdca4f94 |

No third-party runtime font requests or restricted government assets were added. The site's independent-service identity and existing readiness gates remain intact.
