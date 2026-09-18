import { ArrowRight, ArrowUpRight, Check, Database, Files, RefreshCw, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";

const steps = [
  { number: "01", Icon: Database, title: "Structureren.", label: "Van losse gegevens naar één dossier", text: "Breng productgegevens, leveranciersinformatie en bewijsstukken samen. Maak zichtbaar wat beschikbaar is en wat nog ontbreekt.", detail: "Uw batterijtype, toepassing en rol in de keten vormen het vertrekpunt. Gegevens blijven verbonden met hun bron en de vragen die nog openstaan." },
  { number: "02", Icon: Files, title: "Opstellen.", label: "Van dossier naar digitaal paspoort", text: "Werk vanuit onderbouwde informatie aan het digitale batterijpaspoort. Met vooraf duidelijke afspraken over controles en levering.", detail: "We bepalen welke informatie, onderbouwing en controles voor uw traject nodig zijn. Het paspoort brengt die informatie in samenhang bij elkaar." },
  { number: "03", Icon: RefreshCw, title: "Beheren.", label: "Informatie die actueel blijft", text: "Batterijen, leveranciers en gegevens veranderen. Maak wijzigingen, actualisering en verantwoordelijkheden onderdeel van het beheer.", detail: "We leggen vast wie gegevens aanlevert, wie wijzigingen beoordeelt en hoe het dossier wordt bijgewerkt. Zo krijgt beheer een vaste plek in het proces." },
];
const questions = [
  ["Waar beginnen we als onze gegevens nog niet compleet zijn?", "Begin met wat u al heeft: het batterijtype, de toepassing en de beschikbare productinformatie. In de intake kunt u ook aangeven wat nog onbekend is. Zo ontstaat een concreet vertrekpunt voor het dossier."],
  ["Verzorgen jullie ook het digitale batterijpaspoort?", "De dienstverlening omvat het traject van productgegevens en bewijsstukken tot het opstellen en beheren van digitale batterijpaspoorten. Welke onderdelen, controles en levering bij uw organisatie passen, leggen we vooraf vast."],
  ["Is een batterijpaspoort hetzelfde als een keurmerk?", "Een digitaal batterijpaspoort is een informatiedossier. Het is op zichzelf geen keurmerk of garantie dat een product aan alle toepasselijke eisen voldoet."],
  ["Wat gebeurt er na de online intake?", "We bekijken uw vraag en de beschikbare informatie. Vervolgens maken we de scope, benodigde gegevens en vervolgstappen voor uw organisatie concreet. De intake verplicht u tot niets."],
];
export default function Home() {
  return <><SiteHeader /><main id="main">
    <section className="hero shell" aria-labelledby="hero-title">
      <div className="hero-copy"><p className="eyebrow hero-kicker">Digitale batterijpaspoorten</p>
        <h1 id="hero-title">Elke batterij.<br />Eén <em>helder</em><br />paspoort.</h1>
        <p className="hero-intro">Van productgegevens en bewijsstukken tot uw digitale batterijpaspoort. Eén traject voor het opstellen en beheren.</p>
        <div className="hero-actions"><Button asChild className="glow-button"><a href="/intake">Start online intake <ArrowUpRight size={20} /></a></Button><a className="text-link" href="/voorbeeld">Bekijk het voorbeeld <ArrowRight size={18} /></a></div>
        <p className="hero-caption">Gegevens. Onderbouwing. Continuïteit.</p>
      </div>
      <div className="hero-art"><img src="/images/battery-passport.webp" alt="Accu met een fysiek batterijpaspoort aan een koord, met Europa op de achtergrond" width="1122" height="1402" fetchPriority="high" /><div className="art-caption"><span>Van product naar inzicht</span><span>EUBatteryPassport</span></div></div>
    </section>
    <section className="audience-strip shell" id="voor-wie" aria-label="Voor wie"><p className="eyebrow">Voor de hele batterijketen</p><ul><li>Fabrikanten</li><li>Importeurs</li><li>Distributeurs</li></ul></section>
    <section className="approach shell section-space" id="aanpak" aria-labelledby="approach-title">
      <div className="section-heading"><div><p className="eyebrow">Eén samenhangend traject</p><h2 id="approach-title">Complexe ketens.<br /><span>Heldere informatie.</span></h2></div><p>Van de eerste brongegevens tot het beheer van uw paspoort. Iedere stap bouwt voort op dezelfde onderbouwing.</p></div>
      <div className="service-grid">{steps.map(({ number, Icon, title, label, text, detail }) => <article className="service-card" key={number}><div className="step-top"><span>{number}</span><Icon size={28} strokeWidth={1.3} /></div><h3>{title}</h3><p className="service-label">{label}</p><p>{text}</p><details><summary>Meer over deze stap <Plus size={17} /></summary><p>{detail}</p></details></article>)}</div>
    </section>
    <section className="vision shell" aria-labelledby="vision-title">
      <div className="landscape-panel"><img src="/images/alpine-valley.webp" alt="Groene bergvallei met een rivier in het avondlicht" width="1448" height="1086" loading="lazy" /><div className="landscape-caption"><span className="eyebrow">Informatie die verder brengt</span><p>Vandaag inzicht.<br />Morgen verder.</p></div></div>
      <div className="vision-copy"><p className="eyebrow">De waarde zit in de onderbouwing</p><h2 id="vision-title">Een paspoort is zo sterk als de informatie erachter.</h2><p>Batterijgegevens ontstaan bij engineering, inkoop, kwaliteit en leveranciers. Een samenhangend dossier verbindt die informatie, met aandacht voor herkomst, open vragen en wijzigingen.</p><ul>{["Herkomst bij de gegevens", "Open punten duidelijk", "Afspraken over beheer"].map(text => <li key={text}><Check size={18} /><span>{text}</span></li>)}</ul><a className="text-link" href="/voorbeeld">Ontdek het voorbeeldpaspoort <ArrowUpRight size={18} /></a></div>
    </section>
    <section className="principles shell" aria-label="Zo werken we"><p className="eyebrow">Een helder proces.<br />Duidelijke verantwoordelijkheden.</p><p>Vooraf maken we de scope, benodigde informatie en verantwoordelijkheden concreet. Zo weet uw organisatie wat het traject omvat.</p></section>
    <section className="closing shell" aria-labelledby="closing-title"><div><p className="eyebrow">Uw volgende stap</p><h2 id="closing-title">Maak uw batterijdata<br /><em>werkbaar.</em></h2></div><div className="closing-cta"><p>Vertel ons welke batterijen u levert, welke gegevens beschikbaar zijn en waar ondersteuning nodig is.</p><Button asChild className="glow-button"><a href="/intake">Start online intake <ArrowUpRight size={20} /></a></Button><span className="closing-note">Een helder vertrekpunt voor uw organisatie.</span></div></section>
    <section className="faq shell section-space" id="vragen" aria-labelledby="questions-title"><div><p className="eyebrow">Goed om te weten</p><h2 id="questions-title">Uw vragen.<br />Helder beantwoord.</h2></div><div className="faq-list">{questions.map(([q, a]) => <details key={q}><summary>{q}<Plus size={20} /></summary><p>{a}</p></details>)}</div></section>
  </main><SiteFooter /></>;
}
