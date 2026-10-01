# Klanttraject voor EUBatteryPassport

Dit werkpakket helpt de eigenaar een eerste klantdossier af te bakenen, gegevens op te vragen en een offerte te maken. Het is opgesteld op 1 oktober 2026. Een geslaagde softwaretest is geen certificering en geen bewijs dat een klantbatterij geregistreerd is.

## De eerste opdracht

Begin met één model van een Nederlandse leverancier van stationaire opslag. Bepaal eerst de daadwerkelijke rol van de onderneming; een distributeur is niet automatisch de verantwoordelijke importeur. Verkoop een begrensde dossierbeoordeling met een ontbrekende-gegevenslijst en een uitvoeringsvoorstel. Neem nog geen onvoorwaardelijke verplichting tot live registratie, een gegarandeerde compliancestatus of levenslange hosting aan.

De klant levert een productspecificatie, systeemtekening, informatie over fabrikant en invoer, beschikbare testrapporten en de aantallen modellen en individuele batterijen. De beoordeling levert op:

1. Een gedocumenteerde productafbakening: categorie, complete batterij, capaciteit, BMS-afhankelijkheden, beoogde markt en introductiedatum.
2. Een onderbouwde vaststelling van de verantwoordelijke marktdeelnemer, ter bevestiging door de klant.
3. Een checklist per datapunt, met toepasselijkheid, bron, eigenaar, ontbrekend bewijs en reviewstatus.
4. Een afgesproken vervolgopdracht voor modelinrichting, individuele paspoorten en beheer.

## Schriftelijke afspraken vóór uitvoering

Leg juridische bedrijfsnamen, vertegenwoordigers, scope, modellen, landen, looptijd, intrekking, gegevensrechten, verwerkingsafspraken en opvolging bij beëindiging vast. De machtiging voor opstellen en bijwerken van paspoorten en de vereisten voor optreden in het Registry zijn afzonderlijke onderwerpen. Een concept is geen ondertekende machtiging; maak geen WrittenAuthorisation-record actief zonder gecontroleerd bewijs.

Wijs per partij een contactpersoon aan voor productdata, laboratoriumrapporten en wijzigingen. Spreek af hoe een fout wordt gemeld, wie correcties beoordeelt, welke wijzigingen een nieuwe paspoortversie vereisen en hoe een klant een export ontvangt. Laat aansprakelijkheid, hostingcontinuïteit en eventuele certificeringswerkzaamheden passend beoordelen voordat deze als contractuele toezegging worden verkocht.

## Offerte op basis van het werk

| Regel | Eenheid | Omvang die eerst wordt ingevuld |
| --- | --- | --- |
| Dossierbeoordeling | Per afgebakend model | Aantal bronbestanden, varianten, ontbrekende gegevens, één reviewronde |
| Modelinrichting | Per model of aantoonbaar afwijkende variant | Veldmapping, bewijscontrole, leveranciersopvolging |
| Paspoortuitgifte | Per individuele batterij | Aantal, identificatie, gegevensimport en afgesproken controles |
| Beheer | Per afgesproken periode | Actieve aantallen, wijzigingsvolume, bewaartermijn, export en ondersteuning |
| Koppelingen | Eenmalig plus onderhoud | Bronsysteem, authenticatie, mapping, foutafhandeling, acceptatietest |
| Externe werkzaamheden | Afzonderlijk | Laboratorium, juridisch advies, elektronische identificatie en eventuele externe kosten |

Vul tarieven pas in na tijdmeting van het referentiedossier en vaststelling van de werkelijke kosten. Een laag tarief voor grote aantallen gegenereerde paspoorten is niet vergelijkbaar met dossieronderzoek, bewijscontrole en leverancierswerk.

Rekenregel exclusief eventuele btw: dossierbedrag + som(aantal modellen × modeltarief) + aantal individuele batterijen × uitgiftetarief + beheer over de afgesproken periode + afzonderlijk overeengekomen koppelingen/externe werkzaamheden. Voorkom dubbele facturering van dezelfde modelinrichting. Een offerte bevat leveringscriteria, uitgangspunten, doorlooptijd vanaf ontvangst van de benodigde gegevens, wijzigingsprocedure en betalingsafspraken. Er zijn in dit werkpakket geen tarieven vastgesteld of offertes verzonden.

## Gegevens en bewijs

De gegenereerde bestanden onder `generated` bevatten 71 rijen voor elk van EV, LMT en INDUSTRIAL_GT_2KWH. Ze komen uit de bestaande regelconfiguratie, waarvan de bronhash wordt vastgelegd. Ze zijn een werklijst, geen verklaring dat alle interpretaties definitief zijn. Onbekende toepasselijkheid krijgt een open beoordeling; deze mag niet automatisch naar niet van toepassing worden omgezet.

Leg bij ieder bewijs de leverancier of het laboratorium, documentdatum, modelvariant, revisie, pagina, eenheid, inhoudshash en reviewer vast. Een documentnaam of een gegenereerde hash bewijst geen inhoudelijke juistheid. Vraag bij EV-prestatie- en levensduuronderzoek naar de gebruikte normeditie en het dekkingsbereik van het rapport, waaronder EN 18060:2025 waar relevant. Het geharmoniseerde besluit maakt deze EV-norm niet automatisch toepasselijk op stationaire opslag of LMT.

## Updates per klant afspreken

Kies na beoordeling handmatige updates, onderhoudsupdates of een automatische API/BMS-koppeling. Leg per gegeven vast wie aanlevert, wanneer het wordt gemeten, welke gebeurtenis een update vereist en wie afwijkingen beoordeelt. Een gekozen servicemethode is geen algemene vrijstelling van actualisering. Status- en prestatiegegevens bij marktintroductie mogen niet willekeurig leeg blijven. Alleen werkelijk nog niet bestaande gebruiksgegevens krijgen een onderbouwde beginstatus.

De bestaande toepassing heeft versievelden, afgeschermde openbare gegevens en lifecycle/telemetry-routes. Die vormen een basis, maar vormen geen bewijs van een afgeronde productiekoppeling. Voor versoepeling van een verplichte waarde is een afzonderlijk beoordeelde wijziging met onderbouwing en regressietests nodig. Dit werkpakket verandert geen publicatie- of bewijsblokkades.

## Registry en aantoonbare acceptatie

Raadpleeg het actuele officiële gegevensmodel en verkrijg de echte templates vanuit het Registry. Voer vervolgens met een geverifieerde organisatie en bevoegde vertegenwoordiger een test uit in de officiële testomgeving. Gebruik nooit fictieve juridische identiteitsgegevens voor organisatieverificatie. Leg omgeving, datum, gebruikte templateversie, bronhash, aanvraag en werkelijke uitkomst vast. Test afzonderlijk een dubbele identifier, een ongeldige invoer en een batchgrens.

De publieke handleiding v1.03 van 16 september 2026 meldt nog dat batterijregistratie niet kan slagen. Daarom blijven BATTERY_SEMANTIC_CATALOGUE_AVAILABLE en REGISTRY_BATTERY_SUBMISSION_AVAILABLE false. Een geslaagde testregistratie wordt bovendien nooit als productie-registratie gepresenteerd. Zie `REGULATORY_REVIEW.md`.

## Verkoop gereed maken

Gebruik `prospects.json` als onderzoekslijst. Vraag eerst of het bedrijf zelf verantwoordelijkheid draagt, of al een leverancier heeft en of er een concrete behoefte is. De huidige productpagina's bewijzen geen behoefte en geen gebrekkige compliance. Begin met ESTG, Alius en Libra Energy als te kwalificeren kanaalpartijen; Sessy is een afzonderlijke fabrikantbenadering. Alfen volgt later vanwege de vermoedelijk zwaardere inkoopprocedure; dat is onze commerciële inschatting.

Concept eerste bericht, uitsluitend na toestemming en met een passende benaderingsgrond te gebruiken:

> Onderwerp: Dossierbeoordeling voor uw batterijmodellen
>
> Geachte [naam],
>
> Uw assortiment bevat batterijopslag. Wij helpen organisaties productgegevens en bewijsstukken voor batterijpaspoorten te structureren. Een eerste dossierbeoordeling maakt voor één model duidelijk welke informatie beschikbaar is, wat ontbreekt en welke werkzaamheden nodig zijn.
>
> Is batterijpaspoortbeheer een onderwerp dat uw organisatie zelf oppakt, of ligt dit al bij uw fabrikant of een andere leverancier? Als het relevant is, kunnen wij u een korte checklist en een afgebakend voorstel sturen.
>
> Met vriendelijke groet,
> [bevestigde naam en bedrijfsgegevens]
> EUBatteryPassport.nl

Stuur niets automatisch. Houd per prospect de toestemming/benaderingsgrond, reactie, eigenaar en vervolgstap bij. Gebruik geen logo van een prospect als referentie op de website.

## Openstaande voorwaarden

- Formulierverwerking: productie-intake en worker staan uit; private configuratie/cron en echte ontvangst plus foutmelding moeten worden gecontroleerd.
- Bedrijfsgegevens: officiële naam, adres en eventuele KvK-inschrijving zijn bij de eigenaar opgevraagd.
- Officiële registratie: ingelogde bevoegde organisatie, actuele schemas/templates en werkelijke integratie-uitkomst ontbreken.
- Operationeel platform: de bestaande Gate 7-productievoorwaarden blijven gelden; de marketingwebsite is niet de productietoepassing.
- Klantenwerving: geen berichten, offertes of contracten verzonden.

Genereer en controleer de checklist en het fictieve dossier met `node scripts/customer-readiness.cjs`. Bekijk daarna `generated/werkpakket.html` lokaal. Dit interne werkpakket hoort niet in de openbare website-output.
