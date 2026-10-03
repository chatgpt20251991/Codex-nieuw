import { translate, localeHref, type Locale } from "@/lib/i18n";
import { ArrowRight, CalendarDays, Check, ChevronDown, FileCheck2, FileText, Leaf, MessageSquareText, RefreshCw, Settings2, UsersRound } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { customerReadiness, readinessSources } from "@/lib/customer-readiness";

export function HomePage({ locale = "nl" }: { locale?: Locale }) {
  const t = (text: string) => translate(locale, text);
  const intakeHref = localeHref(locale, "/intake");
  const exampleHref = localeHref(locale, "/voorbeeld");
  const readiness = customerReadiness[locale];
  const topics = [
    { Icon: UsersRound, title: t("Voor wie"), description: t("Ondersteuning voor fabrikanten, importeurs en distributeurs."), href: intakeHref },
    { Icon: FileCheck2, title: t("Het batterijpaspoort"), description: t("Productgegevens en bewijsstukken in één samenhangend dossier."), href: "#batterijpaspoort" },
    { Icon: Settings2, title: t("Onze aanpak"), description: t("Structureren, opstellen en blijven actualiseren."), href: "#aanpak" },
    { Icon: MessageSquareText, title: t("Veelgestelde vragen"), description: t("Heldere antwoorden op uw eerste vragen."), href: "#vragen" },
  ];
  const steps = [
    { title: t("Gegevens structureren"), text: t("Productgegevens, leveranciersinformatie en bewijsstukken samenbrengen.") },
    { title: t("Het paspoort opstellen"), text: t("Gegevens en onderbouwing verbinden.") },
    { title: t("Informatie beheren"), text: t("Wijzigingen, versies en verantwoordelijkheden vastleggen.") },
  ];
  const questions = [
    ...readiness.faq,
    [t("Waar beginnen we als gegevens ontbreken?"), t("Begin met wat u al heeft: het batterijtype, de toepassing en de beschikbare productinformatie. In de intake kunt u ook aangeven wat nog onbekend is. Zo ontstaat een concreet vertrekpunt voor het dossier.")],
    [t("Verzorgen jullie ook het digitale batterijpaspoort?"), t("De dienstverlening omvat het traject van productgegevens en bewijsstukken tot het opstellen en beheren van digitale batterijpaspoorten. Welke onderdelen, controles en levering bij uw organisatie passen, leggen we vooraf vast.")],
    [t("Wat gebeurt er na de online intake?"), t("We bekijken uw vraag en de beschikbare informatie. Vervolgens maken we de scope, benodigde gegevens en vervolgstappen voor uw organisatie concreet. De intake verplicht u tot niets.")],
  ];

  return (
    <>
      <SiteHeader locale={locale} />
      <main id="main" className="v12-page">
        <section className="v12-hero" aria-labelledby="hero-title">
          <div className="v12-shell v12-hero-grid">
            <div className="v12-hero-copy">
              <h1 id="hero-title"><span>{t("Elke batterij.")}</span><span>{t("Eén helder paspoort.")}</span></h1>
              <p className="v12-hero-intro">{t("Wij verbinden productgegevens en bewijsstukken tot een digitaal batterijpaspoort. Van voorbereiding en opstellen tot beheer, met vooraf duidelijke afspraken.")}</p>
              <div className="v12-actions">
                <a className="v12-button" href={intakeHref}>{t("Start online intake")}<ArrowRight size={20} aria-hidden="true" /></a>
                <a className="v12-button v12-button-outline" href={exampleHref}>{t("Bekijk het voorbeeld")}<ArrowRight size={20} aria-hidden="true" /></a>
              </div>
            </div>
            <div className="v12-hero-art">
              <img src="/images/hero-v12.webp" srcSet="/images/hero-v12-640.webp 640w, /images/hero-v12-960.webp 960w, /images/hero-v12.webp 1536w" sizes="(max-width: 760px) 100vw, (max-width: 1360px) 52vw, 690px" alt={t("Accu met een Battery Passport-label met fictieve voorbeeldgegevens, met Europa op de achtergrond.")} width="1536" height="1024" fetchPriority="high" />
              <ul className="v12-hero-facts" aria-label={t("In het batterijpaspoort")}>
                <li><FileCheck2 size={24} aria-hidden="true" /><span>{t("Productgegevens")}</span></li>
                <li><Leaf size={24} aria-hidden="true" /><span>{t("Herkomst en onderbouwing")}</span></li>
                <li><RefreshCw size={24} aria-hidden="true" /><span>{t("Wijzigingen en beheer")}</span></li>
              </ul>
            </div>
            <p className="v12-audience">{t("Voor fabrikanten, importeurs en distributeurs.")}</p>
          </div>
        </section>

        <div className="v12-shell v12-content">
          <aside className="v12-notice" aria-label={t("Een samenhangend traject")}>
            <span className="v12-notice-icon"><CalendarDays size={30} strokeWidth={1.8} aria-hidden="true" /></span>
            <div><h2>{t("Van voorbereiding en opstellen tot beheer.")}</h2><p>{t("Een samenhangend traject, met vooraf duidelijke afspraken.")}</p></div>
            <a href="#aanpak" className="v12-inline-link">{t("Onze aanpak")}<ArrowRight size={20} aria-hidden="true" /></a>
          </aside>

          <section className="v12-topics" id="voor-wie" aria-labelledby="topics-title">
            <h2 id="topics-title">{t("Direct naar de belangrijkste onderwerpen")}</h2>
            <div className="v12-topic-grid">
              {topics.map(({ Icon, title, description, href }) => (
                <a className="v12-topic-card" key={title} href={href}>
                  <Icon className="v12-topic-icon" size={36} strokeWidth={1.65} aria-hidden="true" />
                  <div><h3>{title}</h3><p>{description}</p></div>
                  <ArrowRight className="v12-topic-arrow" size={21} aria-hidden="true" />
                </a>
              ))}
            </div>
          </section>

          <section className="v12-example" id="batterijpaspoort" aria-labelledby="passport-story-title">
            <h2 id="passport-story-title">{t("Het batterijpaspoort in beeld.")}</h2>
            <figure className="v12-example-art">
              <img src="/images/passport-v13.webp" srcSet="/images/passport-v13-640.webp 640w, /images/passport-v13-960.webp 960w, /images/passport-v13.webp 1774w" sizes="(max-width: 760px) calc(100vw - 40px), (max-width: 1360px) 52vw, 680px" alt={t("Illustratie van een batterij met een fysiek voorbeeldpaspoort")} width="1774" height="887" loading="lazy" />
              <figcaption>{t("Fictief voorbeeld")}</figcaption>
            </figure>
            <div className="v12-example-copy">
              <h3>{t("Een identiteit. Een dossier. Een helder geheel.")}</h3>
              <p>{t("Bekijk hoe productgegevens, herkomst en bewijsstukken samenkomen in een voorbeeldpaspoort.")}</p>
              <ul className="v12-check-list">
                {[t("Productgegevens in samenhang"), t("Onderbouwing bij de informatie"), t("Zicht op wijzigingen en beheer")].map(text => <li key={text}><span><Check size={14} strokeWidth={3} aria-hidden="true" /></span>{text}</li>)}
              </ul>
              <a className="v12-button" href={exampleHref}>{t("Bekijk het voorbeeldpaspoort")}<ArrowRight size={20} aria-hidden="true" /></a>
            </div>
          </section>

          <section className="v12-process" id="aanpak" aria-labelledby="approach-title">
            <h2 id="approach-title">{t("Van losse gegevens naar een samenhangend dossier")}</h2>
            <ol className="v12-steps">
              {steps.map(({ title, text }, index) => (
                <li key={title}>
                  <span className="v12-step-number" aria-hidden="true">{index + 1}</span>
                  <div><h3>{title}</h3><p>{text}</p></div>
                  {index < steps.length - 1 && <ArrowRight className="v12-step-arrow" size={29} strokeWidth={1.5} aria-hidden="true" />}
                </li>
              ))}
            </ol>
          </section>

          <section className="readiness-section" id="voorbereiden" aria-labelledby="readiness-title">
            <h2 id="readiness-title">{readiness.heading}</h2><p>{readiness.intro}</p>
            <div className="readiness-grid">{readiness.steps.map(([title,copy])=><article key={title}><h3>{title}</h3><p>{copy}</p></article>)}</div>
            <a className="readiness-download" href={readiness.downloadPath} download>{readiness.download}</a>
          </section>
          <div className="v12-bottom-grid">
            <section className="v12-faq" id="vragen" aria-labelledby="questions-title">
              <h2 id="questions-title">{t("Veelgestelde vragen")}</h2>
              <div className="v12-faq-list">
                {questions.map(([question, answer]) => <details key={question}><summary>{question}<ChevronDown size={19} aria-hidden="true" /></summary><p>{answer}</p></details>)}
              </div>
              <details className="readiness-sources"><summary>{readiness.sourceLabel}</summary><p>{readiness.sourceNote}</p><ul><li><a href={readinessSources.faq}>European Commission Battery Passport FAQ</a></li><li><a href={readinessSources.guidance}>Battery Passport data points</a></li><li><a href={readinessSources.registry}>DPP Registry User Guide v1.03 (PDF)</a></li></ul></details>
            </section>
            <section className="v12-closing" aria-labelledby="closing-title">
              <div className="v12-closing-copy">
                <h2 id="closing-title">{t("Maak uw batterijdata werkbaar.")}</h2>
                <p>{t("Vertel ons welke batterijen u levert, welke gegevens beschikbaar zijn en waar ondersteuning nodig is.")}</p>
                <a className="v12-button" href={intakeHref}>{t("Start online intake")}<ArrowRight size={20} aria-hidden="true" /></a>
              </div>
              <div className="v12-closing-art" aria-hidden="true"><FileText size={98} strokeWidth={1.1} /><Leaf size={48} strokeWidth={1.4} /></div>
            </section>
          </div>
        </div>
      </main>
      <SiteFooter locale={locale} />
    </>
  );
}
