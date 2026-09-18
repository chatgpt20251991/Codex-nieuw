import { translate, localeHref, type Locale } from "@/lib/i18n";
import { ArrowLeft, ArrowUpRight, BatteryFull, Fingerprint, FileText, Layers, Plus } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { Button } from "@/components/ui/button";
export function ExamplePage({ locale = "nl" }: {
    locale?: Locale;
}) {
    const t = (text: string) => translate(locale, text);
    const specifications = [
        [t("Productidentificatie"), "DEMO-EBP-001"], [t("Model"), "EX-120"],
        [t("Toepassing"), t("Stationaire energieopslag")], [t("Batterijchemie"), t("Lithium-ijzerfosfaat (LFP)")],
        [t("Nominale energie"), "120 kWh"], [t("Nominale capaciteit"), "200 Ah"],
        [t("Nominale spanning"), "600 V"], [t("Producent"), t("Fictieve voorbeeldproducent")],
    ];
    return <><SiteHeader locale={locale}/><main id="main" className="example-page">
    <section className="example-intro shell">
      <a className="back-link" href={localeHref(locale, "/")}><ArrowLeft size={17}/>{t("Terug naar de website")}</a>
      <div className="example-heading"><div><p className="eyebrow">{t("Van product naar inzicht")}</p><h1>{t("Een batterij.")}<br /><em>{t("Een wereld aan informatie.")}</em></h1></div><p>{t("Zo kan een digitaal batterijpaspoort productgegevens, herkomst en onderbouwing verbinden. Alle gegevens in dit voorbeeld zijn fictief.")}</p></div>
    </section>
    <section className="passport-exhibit shell" aria-labelledby="passport-heading">
      <div className="passport-exhibit-art"><img src="/images/passport-v5.webp" srcSet="/images/passport-v5-640.webp 640w, /images/passport-v5-960.webp 960w, /images/passport-v5.webp 1672w" sizes="(max-width: 700px) 670px, (max-width: 1100px) 1050px, 1100px" alt={t("Conceptbeeld van een batterij met een Engelstalig Battery Passport met fictieve gegevens voor model EX-120")} width="1672" height="941" fetchPriority="high"/><span className="exhibit-caption">EX-120 <span>Product &amp; digital identity</span></span></div>
      <article className="passport-dossier">
        <div className="dossier-top"><span className="eyebrow">EUbatterypassport.nl</span><span className="sample-label">{t("Fictief voorbeeld")}</span></div>
        <div className="passport-title"><Fingerprint size={32} strokeWidth={1.2}/><div><p className="eyebrow">Digital product identity</p><h2 id="passport-heading">Battery Passport</h2></div></div>
        <p className="passport-model">EX-120 <span>{t("Stationaire energieopslag")}</span></p>
        <div className="passport-energy"><div><strong>120<span>kWh</span></strong><p>{t("Nominale energie")}</p></div><BatteryFull size={55} strokeWidth={1.1}/></div>
        <div className="passport-keyfacts"><div><span>Chemistry</span><strong>LFP</strong></div><div><span>Capacity</span><strong>200 Ah</strong></div><div><span>Voltage</span><strong>600 V</strong></div></div>
        <div className="passport-id"><Fingerprint size={20}/><div><span>Unique product identifier</span><strong>DEMO-EBP-001</strong></div></div>
        <p className="example-notice">{t("U bekijkt fictieve voorbeeldgegevens. Dit paspoort is niet uitgegeven of geregistreerd.")}</p>
      </article>
    </section>
    <section className="passport-information shell section-space" aria-labelledby="data-heading">
      <div className="section-heading"><div><p className="eyebrow">{t("De informatie achter het product")}</p><h2 id="data-heading">{t("Helder aan de voorkant.")}<br /><span>{t("Onderbouwd aan de bron.")}</span></h2></div><p>{t("De velden hieronder tonen een selectie met fictieve waarden. De benodigde gegevens hangen af van de batterij en de toepassing.")}</p></div>
      <div className="passport-detail-grid"><article className="specifications"><div className="detail-heading"><BatteryFull size={22}/><h3>{t("Productgegevens")}</h3></div><dl>{specifications.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl></article>
        <div className="evidence-panels"><article><div className="detail-heading"><FileText size={22}/><h3>{t("Bronnen & bewijs")}</h3></div><p>{t("Een waarde krijgt betekenis door de documentatie erachter: bijvoorbeeld een productspecificatie, leveranciersverklaring of testverslag.")}</p><div className="evidence-placeholder"><span>{t("Documentatie bij dit voorbeeld")}</span><strong>{t("Geen bewijsstukken toegevoegd")}</strong></div></article><article><div className="detail-heading"><Layers size={22}/><h3>{t("Versies & wijzigingen")}</h3></div><p>{t("Bij een werkelijk paspoort horen afspraken over actualisering, beoordeling en verantwoordelijkheid. Dit voorbeeld bevat geen echte producthistorie.")}</p><details><summary>{"" + t("Wat laat dit voorbeeld zien?") + " "}<Plus size={18}/></summary><p>{t("De presentatie van productgegevens en de plaats voor hun onderbouwing. Het beeld is een conceptillustratie; het is geen keurmerk, validatie of bewijs van registratie.")}</p></details></article></div>
      </div>
    </section>
    <section className="closing shell example-closing"><div><p className="eyebrow">{t("Van voorbeeld naar uw organisatie")}</p><h2>{t("Uw batterij.")}<br /><em>{t("Uw volgende stap.")}</em></h2></div><div className="closing-cta"><p>{t("Maak concreet welke gegevens, controles en ondersteuning voor uw organisatie nodig zijn.")}</p><Button asChild className="glow-button"><a href={localeHref(locale, "/intake")}>{"" + t("Start online intake") + " "}<ArrowUpRight size={20}/></a></Button></div></section>
  </main><SiteFooter locale={locale}/></>;
}
