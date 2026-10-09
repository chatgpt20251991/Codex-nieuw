# Bronnen en gevolgen voor de uitvoering

Gecontroleerd op 1 oktober 2026. Dit dossier maakt onderscheid tussen regelgeving, niet-bindende toelichting en onze eigen uitvoeringskeuzes. De oudere bronmomentopnamen in de repository blijven historische bewijsstukken.

Aanvulling op 9 oktober 2026: [de nieuwe broncontrole en technische werklijst](../25_REGULATORY_UPDATE_2026-10-09.md) behandelen ontwerp Ares(2026)9188325, de definitieve EN 18239/18246-normen en een afzonderlijke modelbeoordeling voor industriële productprestaties. De oorspronkelijke bevindingen hieronder blijven gedateerd op 1 oktober; de aanvulling verandert geen actieve paspoortregels of registratiestatus.

| Bron | Bevinding en gevolg |
| --- | --- |
| [Commissieoverzicht datapuntenguidance](https://single-market-economy.ec.europa.eu/news/guidance-support-preparations-digital-batteries-passport-2026-08-21_en) | Het overzicht noemt 71 datapunten met categoriegebonden toepasselijkheid. Onze bestaande configuratie is een vertrekpunt; toepasselijkheid en latere wijzigingen vragen inhoudelijke review. |
| [Battery Passport FAQ](https://single-market-economy.ec.europa.eu/single-market/digital-product-passport/eu-digital-product-passport-faq-batteries_en) | Eerste editie, manuscript september 2026. Derden kunnen schriftelijk gemachtigd worden voor paspoortwerk. Geen overdracht van de uiteindelijke verantwoordelijkheid. |
| FAQ onderdelen 3 en 8 | Complete batterij en gedeelde componenten beoordelen. Dynamische gegevens vragen een passende updatestrategie; een permanente internetverbinding is niet altijd nodig. Maak geen generieke vrijstelling voor alle nieuwe batterijen. |
| FAQ onderdelen 6 en 11 | Toegangsregels en het officiële semantische model vragen verdere uitwerking. Onze toegangstoekenning blijft versieerbaar en standaard gesloten voor onbevoegden. |
| [Registry User Guide v1.03](https://single-market-economy.ec.europa.eu/document/download/079a45e2-469f-4eec-b1e5-32e8e05d1357_en?filename=dpp_registry_user_guide_for_economic_operators.pdf) | Gepubliceerd 16 september 2026. Pagina's 48 en 54 melden nog onbeschikbare succesvolle batterijregistratie. Pagina 51 beschrijft JSON/XML-templates en maximaal 100 aanvragen per bestand. Templates achter login zijn hier niet verkregen. |
| [Besluit EU 2026/2048](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX%3A32026D2048) | Verwijzing naar EN 18060:2025 voor EV-prestaties en levensduur. Vraag passend testbewijs; de volledige normtekst is niet in dit project verkregen of beoordeeld. |

De FAQ is begeleiding en geen nieuwe bindende wet. Gebruik bij conflicten de toepasselijke wetgeving en laat de interpretatie beoordelen. De website vermeldt daarom een peildatum, bronlinks en gescheiden statussen voor opstellen, publiceren en registreren. Er worden geen vaste, nog onbevestigde Registry API-endpoints of payloads verzonnen.

## Technische besluitvorming

Behoud de drie bestaande flags op false: BATTERY_SEMANTIC_CATALOGUE_AVAILABLE, REGISTRY_BATTERY_SUBMISSION_AVAILABLE en ARTICLE_77_9_ACCESS_ACT_FINAL. Nieuwe bronnen alleen zijn onvoldoende voor inschakeling: verkrijg het toepasselijke officiële contract, implementeer de mapping, test met echte bevoegdheden in de doelomgeving en leg de uitkomst vast.

Het werkpakket gebruikt de bestaande 71-puntenconfiguratie als expliciete bron. Een gegenereerde checklist kent geen compliant-score toe. De fictieve EX-120 bevat bewust ontbrekende gegevens en niet-gevalideerde voorbeeldwaarden. De klantopgave in het intakeformulier is geen juridische classificatie en wordt als nog te beoordelen gemarkeerd.

Voor wijzigingen in dynamische vereisten is een aparte veld-voor-veldbeoordeling nodig. De huidige strenge publicatieblokkades worden in deze websitewijziging niet versoepeld. Gebruiksgegevens die nog niet bestaan moeten later expliciet met reden, bron en review worden gemodelleerd, zonder status- of prestatievereisten te omzeilen.
