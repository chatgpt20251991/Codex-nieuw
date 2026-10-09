# Offline normvoorbereiding

Dit dossier voert de technische voorbereiding uit uit [het beoordeelde plan van
9 oktober](../25_REGULATORY_UPDATE_2026-10-09.md). Het is geen nieuwe actieve
regelconfiguratie en wordt niet door de API of website ingelezen.

- `ledger.json`: bronstatus, afzonderlijke juridische toepassingsgebieden en
  beoordelingsstatus per norm. Publicatie, OJ-verwijzing, volledige tekstbeoordeling,
  implementatie en verificatie in de doelomgeving zijn afzonderlijke gegevens.
- `control-inventory.json`: bestaande code en regressietests als vertrekpunt voor
  een nog in te vullen clausulemapping. Geen van deze controles bewijst op zichzelf
  conformiteit aan een EN-norm.

Voer vanuit de repository `node scripts/regulatory-review.cjs` en
`node --test scripts/regulatory-review.test.cjs` uit. De controle leest uitsluitend
lokale bestanden, controleert bronmetadata, statussen, datumafbakening en bestaande
bestandverwijzingen. Zij downloadt niets, controleert niet of online bronnen sinds
de peildatum zijn gewijzigd en voert de genoemde integratietests niet uit.

De SHA-256 in het register betreft uitsluitend de lokale bronmetadata; het is geen
hash van de originele publicaties, een digitale handtekening of bewijs van
juridische geldigheid. Een wijziging vraagt inhoudelijke bronbeoordeling en een
bewuste herberekening van die metadatahash. De offline controle houdt het huidige
voorbereidingsdossier gesloten voor activering; een toekomstige activering vraagt
een afzonderlijke beoordeelde release, geen wijziging van een boolean alleen.

Voor volledige tekstbeoordeling: gebruik een rechtmatige toegang, noteer editie,
clausule, reviewer en datum en leg vereiste testgevallen en afwijkingen vast.
NEN vermeldt gratis inzage via NEN Connect voor EN 18219 en EN 18220; er is nog geen account
aangemaakt of volledige tekst beoordeeld. De toegangsmogelijkheid is geen
licentie om normteksten in deze publieke repository op te nemen.

De identifier-migratiegevallen in het register zijn een **testplan**. Exacte
identifier-syntax, QR-instellingen en cryptografische profielen blijven te
beoordelen aan de hand van volledige teksten. Bestaande UPIs, paspoortversies en
de scheiding tussen openbare en afgeschermde gegevens moeten behouden blijven.
