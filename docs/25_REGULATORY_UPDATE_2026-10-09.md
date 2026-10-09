# Batterijpaspoortregels en voorbereiding op 9 oktober 2026

De update vraagt om voorbereiding van normprofielen en een afzonderlijke beoordeling van industriële batterijprestaties. De wettelijke paspoortdeadline blijft 18 februari 2027 voor de toepasselijke categorieën. De betaalde klantomgeving blijft uitgesteld tot een concrete eerste opdracht; deze voorbereiding vraagt geen nieuw hostingabonnement.

## Bronstatus en juridische werking

| Onderwerp | Status op 9 oktober 2026 | Gevolg voor de uitvoering |
| --- | --- | --- |
| Ares(2026)9188325 | Ontwerp gepubliceerd op 29 september 2026 | Geen activering als geldende wet. |
| EN 18219 en EN 18220 | Genoemd in het bestaande DPP-besluit onder de ESPR; het nieuwe ontwerp stelt een wijziging van batterijartikel 77(3) voor | Huidige en voorgestelde juridische basis afzonderlijk vastleggen. Exact normprofiel vraagt volledige tekst en toetsing. |
| EN 18239 en EN 18246 | Definitieve normen volgens NEN en CEN; CEN vermeldt dat verwijzing onder de ESPR wordt verwacht | Voorbereiden op normtoetsing; publicatie bewijst geen conformiteit van onze toepassing. |
| Toegang tot afgeschermde batterijgegevens | Commissie-FAQ meldt dat de uitvoeringshandeling nog wordt ontwikkeld | Toegang blijft versieerbaar en gesloten voor onbevoegden. |

Het [ontwerp Ares(2026)9188325](https://op.europa.eu/en/publication-detail/-/publication/7da524b6-bc01-11f1-81de-01aa75ed71a1/language-en) stelt in artikel 2(1) EN 18220:2026 voor de QR-code en EN 18219:2026 voor de unieke identifier voor, met ruimte voor gelijkwaardige standaarden. Artikel 1 betreft minimumwaarden voor oplaadbare industriële batterijen boven 2 kWh, met uitzondering van batterijen met uitsluitend externe opslag. Het ontwerp wijzigt ook bijlagen IV, V en VII. De definitieve tekst en publicatie bepalen welke wijzigingen daadwerkelijk gelden.

[Batterijverordening artikel 10(2)](https://eur-lex.europa.eu/eli/reg/2023/1542/oj) gebruikt voor de minimumwaarden de latere datum van 18 augustus 2027 en achttien maanden na inwerkingtreding van de gedelegeerde handeling. Dat is een afzonderlijke termijn naast de paspoortdeadline. Pas deze achttien maanden niet automatisch toe op de voorgestelde QR- en identifierwijziging. De [officiële consultatie](https://ec.europa.eu/info/law/better-regulation/have-your-say/initiatives/14460) sluit op 27 oktober 2026; de [openbare Commissiegegevens](https://ec.europa.eu/info/law/better-regulation/brpapi/groupInitiatives/14460) bevestigen de status als open ontwerpconsultatie, zonder adoptiedatum.

[Besluit EU 2026/1736](https://eur-lex.europa.eu/legal-content/EN/TXT/PDF/?uri=CELEX%3A32026D1736) ondersteunt ESPR-verordening 2024/1781. Het wijzigt op zichzelf batterijartikel 77(3) niet. De [Commissie-FAQ, onderdelen 1.3 en 1.4](https://single-market-economy.ec.europa.eu/single-market/digital-product-passport/eu-digital-product-passport-faq-batteries_en), noemt nog zes van acht aangewezen DPP-normen en verwacht een ontwerp voor afgeschermde toegang in oktober of november. Dat is een verwachting, geen vastgestelde inwerkingtreding.

NEN vermeldt 1 september als nationale publicatiedatum voor [EN 18239](https://www.nen.nl/nen-en-18239-2026-en-356885) en [EN 18246](https://www.nen.nl/nen-en-18246-2026-en-356883). CEN vermeldt beschikbaarheid van de definitieve tekst op 16 september bij [project 81494](https://standards.cencenelec.eu/ords/f?cs=1C97AB3E731BCF82E3BD2A04D9D8DC8CD&p=205%3A110%3A%3A%3A%3A%3AFSP_PROJECT%3A81494) en [project 81495](https://standards.cencenelec.eu/ords/f?cs=1C627F97280D3E45FBBBED053BCCA88A9&p=205%3A110%3A%3A%3A%3A%3AFSP_PROJECT%3A81495). Deze data bewijzen geen verwijzing in het Publicatieblad, certificering of Registry-registratie.

## Technische werklijst

| Werk | Bestaande basis | Openstaande stap en acceptatie |
| --- | --- | --- |
| Identifier en QR-code | HTTPS-resolver, opaque UUID, unieke UPI en SVG-QR | Volledige EN 18219/18220-teksten rechtmatig verkrijgen; clausules mappen en normprofielen met testgevallen beoordelen. Bestaande gepubliceerde UPIs blijven bereikbaar bij een profielwijziging. |
| Industriële productprestaties | Voorwaardelijke paspoortvelden voor levensduur, efficiëntie en gebruiksgegevens | Afzonderlijke artikel 10-beoordeling per model, met toepasselijkheid, testcondities, rapporten en latere toepassingsdatum. Geen ontwerpgrenswaarden toevoegen aan de actieve publicatiecontrole. |
| Toegangsbeheer | Tenantisolatie, aparte openbare projectie en aflopende/revokeerbare toegangsrechten | EN 18239 en de definitieve toegangsregels naast bestaande controles leggen. Openbare gegevens en afgeschermde gegevens afzonderlijk testen. |
| Authenticiteit en integriteit | Inhoudshashes, bewijscontrole, malwarecontrole en onveranderlijke paspoortversies | EN 18246-clausules beoordelen, inclusief de vereiste vorm van authentieke gegevensuitwisseling. Hashes alleen gelden niet als bewijs van normconformiteit. |
| Regelversies | Bestaande regels uit augustus 2026 en versievelden | Bronstatus, publicatie, inwerkingtreding, toepassingsdatum en uitvoeringsbewijs afzonderlijk registreren. Een gewijzigd versielabel vervangt geen geïmplementeerde en geteste regels. |

De volledige normteksten zijn nog niet in dit project beoordeeld. Catalogussamenvattingen zijn onvoldoende om identifier-syntax, QR-marges, cryptografische profielen of andere exacte normvereisten te kiezen. De hierboven beschreven stappen zijn geplande werkzaamheden; deze documentatie implementeert ze niet.

NEN biedt gratis inzage via een gratis NEN Connect-account voor [EN 18219](https://www.nen.nl/nen-en-18219-2026-en-352707) en [EN 18220](https://www.nen.nl/en/nen-en-18220-2026-en-352706). Er is nog geen account gemaakt of volledige tekst beoordeeld; dit is een toegangsmogelijkheid, geen recht om normteksten te herpubliceren. Het [offline normenregister en de controle-inventaris](regulatory/README.md) leggen de open beoordelingen en continuïteitstestgevallen vast. De nieuwe controles bewijzen geen implementatie of conformiteit van de normprofielen.

De officiële ontwerpbestanden zijn rechtstreeks gecontroleerd: [hoofdtekst](https://ec.europa.eu/info/law/better-regulation/api/download/090166e53435c1d0) en [bijlagen](https://ec.europa.eu/info/law/better-regulation/api/download/090166e53435c1cf). Bijlage IV verduidelijkt onder meer fabrikantverklaring en referentiecondities voor capaciteit en vermogen. Bijlage V behandelt interne-kortsluitveiligheid via bescherming tegen thermische propagatie; dit is geen algemene afschaffing van veiligheidsbescherming. Bijlage VII noemt ontwikkeling van zelfontladingssnelheid waar mogelijk; die parameter wordt niet geschrapt. Deze ontwerpwijzigingen blijven buiten de actieve regels.

## Aanvullende dossiercheck per industrieel model

Vraag naast de bestaande paspoortchecklist naar:

1. Oplaadbaarheid, nominale energie in kWh, toepassing en opslagprincipe; beoordeel uitsluitend externe opslag afzonderlijk zonder daarmee een algemene paspoortvrijstelling toe te kennen.
2. Afbakening van de complete batterij, modelvarianten en afhankelijkheden van BMS, modules en andere componenten.
3. Beschikbare capaciteit-, vermogen-, efficiëntie- en levensduurmetingen, met eenheden en referentiecondities.
4. Testrapport, gebruikte normeditie, laboratorium, datum, revisie en aantoonbare koppeling met het model.
5. Ontbrekend bewijs, reviewer, bron en beoordeling van de toepasselijke productprestatieregels. De beginstatus is `nog te beoordelen`.

Een compleet paspoortdossier bewijst op zichzelf niet dat de batterij productprestatienormen haalt. Beoordeel dat afzonderlijk; maak nieuwe ontwerpgrenswaarden niet tot eisen voor de eerste paspoortdeadline.

Het [invulbare industriële modeldossier](customer-readiness/generated/industrial-model-assessment-template.json) en de [fictieve oefening](customer-readiness/generated/industrial-model-assessment-example.json) zijn nu beschikbaar. De offline beoordeling houdt definitieve toepasselijkheid, productconformiteit en feitelijke bewijsvalidatie open. Verzamelen van gegevens of complete reviewmetadata is geen vertrouwde validatie in de productietoepassing.

## Volgorde en budget

Nu: houd bronstatus bij, gebruik de aanvullende modelcheck bij dossierbeoordeling en bereid normmapping en testgevallen voor. Er worden geen normen gekocht, diensten besteld, Registry-acties uitgevoerd of berichten verstuurd door deze documentatiewijziging.

Voor normconformiteitsclaims: verkrijg de volledige normen rechtmatig, leg de toetsresultaten en resterende afwijkingen vast en implementeer de beoordeelde profielen. Dit is een inhoudelijke voorwaarde die niet vervalt door uitstel van hostingkosten.

Voor eerste klantgebruik: activeer de gekozen betaalbare EU-omgeving pas na de afgesproken opdracht en voltooi de bestaande productieacceptatie, waaronder echte veilige login, documentverwerking en herstel van back-ups. Gate 7 blijft open.

`BATTERY_SEMANTIC_CATALOGUE_AVAILABLE`, `REGISTRY_BATTERY_SUBMISSION_AVAILABLE` en `ARTICLE_77_9_ACCESS_ACT_FINAL` blijven false. De 71-puntenconfiguratie, toegangsregels en actieve publicatieblokkades veranderen niet. Een echte succesvolle Registry-uitkomst blijft vereist voor `registered`.
