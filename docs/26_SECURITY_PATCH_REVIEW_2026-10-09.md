# Gerichte beveiligingsreview op 9 oktober 2026

De volledige dependency-audits detecteerden nieuwe bekende kwetsbaarheden terwijl de EU-voorbereiding werd gecontroleerd. Functionele tests alleen geven geen vrijgave van deze bevindingen. Securityworkflows, auditniveau, SARIF-blokkades en de scanner van alle opgehaalde Git-geschiedenis blijven ongewijzigd.

## Platformpatches

De directe Next 15-patch wordt 15.5.27 en `@nestjs/platform-express` wordt 11.2.6; de bestaande multer-override wordt 2.4.0. De lockfile gebruikt daarnaast gepatchte `proxy-addr` 2.0.8, `sharp` 0.35.5, `source-map-js` 1.2.2 en `fast-uri` 3.1.8. Nest 11 en Next 15 blijven behouden. De volledige audit van dit platform geeft nul bekende bevindingen op de peildatum; productieacceptatie blijft een afzonderlijke stap.

Primaire adviezen: [proxy-addr](https://github.com/advisories/GHSA-jqcg-44mw-7w3h), [sharp](https://github.com/advisories/GHSA-wq5f-xc86-pv6w), [source-map-js](https://github.com/advisories/GHSA-68fv-2mgg-jv7q), [fast-uri](https://github.com/advisories/GHSA-hrr3-gc8f-f4qj), [multer](https://github.com/advisories/GHSA-3pph-fpjx-jg34), [Next SSG/ISR](https://github.com/advisories/GHSA-4jqv-mc3x-m676) en [Next cross-user cache](https://github.com/advisories/GHSA-mcj8-r9mp-w47p).

## Afzonderlijke websiteblokkade

Voor de marketingwebsite zijn patches voor `sharp` en `source-map-js` voorbereid. De volledige websiteaudit blijft geblokkeerd door één hoge [braces-kwetsbaarheid](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) in ontwikkel-/bouwafhankelijkheden. Het primaire advies vermeldt nog geen gepatchte versie. Acht gerelateerde package entries betekenen geen acht verschillende primaire kwetsbaarheden.

De ketens vanuit `eslint-config-next` en Vinext bereiken via fast-glob/micromatch dezelfde braces-versie. Een gecontroleerde nieuwe upstreamversie of inhoudelijk beoordeelde herstelroute is nodig. Een prod-only audit met nul bevindingen vervangt de vereiste volledige audit niet. De vier gematigde bevindingen in de bestaande Drizzle/esbuild-loaderketen blijven eveneens zichtbaar. Er wordt geen kwetsbaarheid genegeerd en geen incompatibele downgrade of willekeurige fork geïnstalleerd om de audit groen te maken.

De openbare tekstupdate en websitepatches blijven een afzonderlijke, ongepubliceerde wijziging totdat de vereiste controles slagen. De vrijgave van onafhankelijke platform- en voorbereidingsbestanden publiceert de website niet.

## Scannerbevinding

De nieuwe negatieve test voor een planningsstatus gebruikte een vaste synthetische tekst die als generic-api-key werd herkend. Het betrof geen sleutel. De placeholder is verkort; de test blijft controleren dat een planning geen definitieve publicatie kan worden. Er is geen allowlist of baseline toegevoegd. Alleen de eigen ongemergde featuregeschiedenis wordt opnieuw op de bestaande main gebaseerd, met controle van de huidige remote head; bestaande main-geschiedenis blijft behouden.
