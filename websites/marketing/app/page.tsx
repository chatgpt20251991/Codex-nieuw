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
    <section className="hero" aria-labelledby="hero-title">
      <div className="hero-art"><img src="/images/hero-v5.webp" srcSet="/images/hero-v5-640.webp 640w, /images/hero-v5-960.webp 960w, /images/hero-v5.webp 1672w" sizes="(max-width: 700px) 855px, 100vw" alt="Accu met een fysiek Battery Passport-label, tegen de verlichte horizon van Europa. Conceptbeeld met voorbeeldgegevens." width="1672" height="941" fetchPriority="high" /></div><div className="hero-inner shell"><div className="hero-copy"><p className="eyebrow hero-kicker">Digitale batterijpaspoorten</p>
        <h1 id="hero-title">Elke batterij.<br />Eén <em>helder</em><br />paspoort.</h1>
        <p className="hero-intro">Wij verbinden productgegevens en bewijsstukken tot een digitaal batterijpaspoort. Van voorbereiding en opstellen tot beheer, met vooraf duidelijke afspraken.</p>
        <div className="hero-actions"><Button asChild className="glow-button"><a href="/intake">Start online intake <ArrowUpRight size={20} /></a></Button><a className="text-link" href="/voorbeeld">Bekijk het voorbeeld <ArrowRight size={18} /></a></div>
        <p className="hero-caption">Van de eerste bron tot de volgende versie.</p>
      </div>
<div className="hero-product-note"><span className="eyebrow">Product. Herkomst. Levenscyclus.</span><span>Informatie die verbonden blijft.</span></div></div>
    </section>
    <section className="audience-strip shell" id="voor-wie" aria-label="Voor wie"><p className="eyebrow">Voor de hele batterijketen</p><ul><li>Fabrikanten</li><li>Importeurs</li><li>Distributeurs</li></ul></section>
    <section className="approach shell section-space" id="aanpak" aria-labelledby="approach-title">
      <div className="section-heading"><div><p className="eyebrow">Eén samenhangend traject</p><h2 id="approach-title">Complexe ketens.<br /><span>Heldere informatie.</span></h2></div><p>Van de eerste brongegevens tot het beheer van uw paspoort. Iedere stap bouwt voort op dezelfde onderbouwing.</p></div>
      <div className="service-grid">{steps.map(({ number, Icon, title, label, text, detail }) => <article className="service-card" key={number}><div className="step-top"><span>{number}</span><Icon size={28} strokeWidth={1.3} /></div><h3>{title}</h3><p className="service-label">{label}</p><p>{text}</p><details><summary>Meer over deze stap <Plus size={17} /></summary><p>{detail}</p></details></article>)}</div>
    </section>
    <section className="passport-story shell" aria-labelledby="passport-story-title">
      <div className="passport-story-art"><img src="/images/passport-v5.webp" srcSet="/images/passport-v5-640.webp 640w, /images/passport-v5-960.webp 960w, /images/passport-v5.webp 1672w" sizes="(max-width: 700px) 670px, (max-width: 1100px) 1050px, 1100px" alt="Illustratie van een batterij met een fysiek voorbeeldpaspoort" width="1672" height="941" loading="lazy" /><span className="image-label">Het paspoort in beeld <span>01 / EX-120</span></span></div>
      <div className="vision-copy"><p className="eyebrow">Meer dan een code op een batterij</p><h2 id="passport-story-title">Een identiteit.<br /><em>Een dossier.</em><br />Een helder geheel.</h2><p>Batterijgegevens ontstaan bij engineering, inkoop, kwaliteit en leveranciers. Het paspoort brengt ze bij elkaar, met hun bronnen en de vragen die nog openstaan.</p><ul>{["Productgegevens in samenhang", "Onderbouwing bij de informatie", "Zicht op wijzigingen en beheer"].map(text => <li key={text}><Check size={18} /><span>{text}</span></li>)}</ul><a className="text-link" href="/voorbeeld">Ontdek het voorbeeldpaspoort <ArrowUpRight size={18} /></a></div>
    </section>
    <section className="vision" aria-labelledby="vision-title"><img className="vision-background" src="/images/landscape-v5.webp" srcSet="/images/landscape-v5-640.webp 640w, /images/landscape-v5-960.webp 960w, /images/landscape-v5.webp 1672w" sizes="(max-width: 700px) 1500px, 100vw" alt="Alpenlandschap met een rivier in het avondlicht" width="1672" height="941" loading="lazy" /><div className="vision-inner shell"><p className="eyebrow">Informatie die verder brengt</p><h2 id="vision-title">Vandaag inzicht.<br /><em>Morgen verder.</em></h2><p>Een paspoort is zo sterk als de informatie erachter. Daarom begint een bruikbaar dossier bij bronnen, verantwoordelijkheden en aandacht voor wat verandert.</p><div className="vision-principles"><div><span>01 / HERKOMST</span><p>Elke waarde heeft een bron.</p></div><div><span>02 / SAMENHANG</span><p>Van losse data naar overzicht.</p></div><div><span>03 / CONTINUÏTEIT</span><p>Beheer vanaf het begin.</p></div></div></div></section>
    <section className="closing shell" aria-labelledby="closing-title"><div><p className="eyebrow">Uw volgende stap</p><h2 id="closing-title">Maak uw batterijdata<br /><em>werkbaar.</em></h2></div><div className="closing-cta"><p>Vertel ons welke batterijen u levert, welke gegevens beschikbaar zijn en waar ondersteuning nodig is.</p><Button asChild className="glow-button"><a href="/intake">Start online intake <ArrowUpRight size={20} /></a></Button><span className="closing-note">Een helder vertrekpunt voor uw organisatie.</span></div></section>
    <section className="faq shell section-space" id="vragen" aria-labelledby="questions-title"><div><p className="eyebrow">Goed om te weten</p><h2 id="questions-title">Uw vragen.<br />Helder beantwoord.</h2></div><div className="faq-list">{questions.map(([q, a]) => <details key={q}><summary>{q}<Plus size={20} /></summary><p>{a}</p></details>)}</div></section>
  </main><SiteFooter /></>;
}
