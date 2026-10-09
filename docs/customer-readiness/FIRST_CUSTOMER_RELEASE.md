# Eerste klant: voorbereiding en vrijgave

Peildatum: 9 oktober 2026. De marketingwebsite is geen productieomgeving voor klantpaspoorten. Deze werklijst bestelt geen diensten, verstuurt geen berichten en geeft geen conformiteitsverklaring.

## Nu beschikbaar zonder nieuw abonnement

- Drie categoriechecklists met de bestaande 71 gegevensvelden en toegangstiers.
- Een afzonderlijk [industrieel modeldossier](generated/industrial-model-assessment-template.json), met onbekende toepasselijkheid, meetcondities, bewijsverwijzingen en reviewer.
- Een [offline normenregister en controle-inventaris](../regulatory/README.md). Normpublicatie, juridische verwijzing, tekstbeoordeling, implementatie en productiecontrole zijn afzonderlijke stappen.
- Een fictieve oefening en interne [werkwijzer](generated/werkpakket.html); deze bestanden horen niet in de openbare website-output.
- Conceptvragen, offerteafbakening en prospectkwalificatie in [de werkwijze](README.md). Benadering van prospects vraagt afzonderlijke toestemming.

Gebruik gratis NEN Connect-inzage voor EN 18219 en EN 18220 om de volledige clausulebeoordeling te starten zodra rechtmatige accounttoegang beschikbaar is. Er is nog geen account aangemaakt, volledige normtekst beoordeeld of normconformiteit vastgesteld. Voor EN 18239 en EN 18246 is nog geen gratis volledige toegang bevestigd. Een catalogus of preview vervangt de normtekst niet.

## Intake via de bestaande hosting afronden

De zakelijke mailbox bestaat. De gewone mailboxtest is geen bewijs van de private PHP-afleverdienst. `INTAKE_ENABLED` en `INTAKE_WORKER_ENABLED` blijven uit totdat de onderstaande acceptatie is afgerond.

1. Krijg toegang tot het bestaande Vimexx-pakket en controleer de private workerconfiguratie, directoryrechten, journal en PHP-omgeving. De eigenaar voert nieuwe geheime gegevens zelf in; lees of publiceer de configinhoud niet.
2. Controleer het bestaande Sites-verifiergeheim en configureer de private cron zonder andere websites of taken te wijzigen. Een worker-heartbeat en werkelijke queue-afhandeling moeten aantoonbaar zijn.
3. Bereid drie herkenbare tests voor: transport naar de eigen inbox, een gesimuleerde cron-foutmelding en één synthetische end-to-end-aanvraag. Vraag expliciete toestemming voordat deze testmails naar `info@eubatterypassport.nl` worden verstuurd. Stuur geen bezoekersmail en gebruik geen echte klantgegevens.
4. Controleer werkelijke ontvangst, D1-status, herhaalde request-ID, foutmelding en herstel. Bij ontbrekende of onzekere aflevering blijft het formulier gesloten. `mail() === true` is alleen queue-acceptatie.
5. Bevestig de verantwoordelijke voor de verwerking, contactgegevens en bewaarbeleid in de openbare privacyverklaring voordat de intake open gaat. In D1 worden alleen geaccepteerde aanvragen ouder dan 90 dagen opgeruimd; onbehandelde aanvragen en mailboxkopieën vereisen afzonderlijke opvolging.

De eigenaar heeft Avenzo digital, eenmanszaak, KvK 94554692, vestiging 000060015055 en Giessenweg 65 A, 3044 AK Rotterdam opgegeven. Dit document registreert die opgave; er is geen nieuw gewaarmerkt uittreksel of controle van de bevoegde natuurlijke persoon verkregen. De openbare privacygegevens en de Registry-identiteit moeten aan hun eigen doel worden getoetst.

Zie de [private workeracceptatie](../../websites/marketing/ops/mail-worker/README.md). De tokenconfiguratie blijft buiten Git, buiten alle documentroots en buiten het publieke Sites-archief.

## Eerste betaalde opdracht afbakenen

Leg eerst één model, de verantwoordelijke marktdeelnemer, beschikbare bewijsstukken, ontbrekende informatie en het gewenste resultaat vast. Maak de offerte afzonderlijk voor dossierbeoordeling, modelinrichting, individuele aantallen en beheer. Leg schriftelijke machtiging, gegevensverwerking, wijzigingen en export vast.

Een opdracht voor inventarisatie of dossierbeoordeling is geen toezegging van een reeds geaccepteerd productiepaspoort of geslaagde EU-registratie. Betaalde klantinfrastructuur blijft uitgesteld tot de afgesproken concrete opdracht. Daarna is de bestaande Gate 7-acceptatie verplicht: echte veilige login, tenantisolatie, beveiligde documentverwerking, back-upherstel en aantoonbare exploitatie in de gekozen doelomgeving.

## Officiële Registry-route voorbereiden

De [Commissiehandleiding](https://single-market-economy.ec.europa.eu/document/download/079a45e2-469f-4eec-b1e5-32e8e05d1357_en?filename=dpp_registry_user_guide_for_economic_operators.pdf) onderscheidt onboarding van registratie van producten. Voor de opgegeven eenmanszaak moet de route voor een natuurlijke persoon met gekwalificeerde elektronische ondertekening worden beoordeeld. Persoonsidentiteit en certificaatattributen moeten overeenkomen. Handelsnaam of KvK-nummer vervangt die controle niet; een los certificaatbestand bewijst geen gekwalificeerde ondertekening.

De actuele handleiding meldt nog dat batterijregistratie niet succesvol beschikbaar is wegens het ontbreken van de semantische catalogus. Er is geen officiële batterijtemplate of werkende indiening verkregen. Daarom blijven de Registry-flags false en wordt geen registratie-ID verzonnen. Koop geen ondertekeningsdienst of certificaat op basis van deze voorbereiding alleen. Zodra de officiële voorzieningen beschikbaar zijn, beoordeel de actuele handleiding, bevoegde identiteit, echte schemas en uitkomst opnieuw.

## Volgende concrete vrijgave

Voeg de voorbereidingswijzigingen pas samen na de vereiste GitHub-controles. Publiceer de beoordeelde Nederlandse en Engelse informatie vanuit die exacte GitHub-versie, met de bestaande Sites-identiteit en omgeving. Nieuwe kwetsbaarheden of falende geheimenscans worden opgelost of blijven een expliciete blokkade; de controle wordt niet uitgeschakeld om een publicatie af te dwingen.
