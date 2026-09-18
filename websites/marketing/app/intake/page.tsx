import type {Metadata} from "next";
import {ArrowLeft} from "lucide-react";
import {SiteHeader} from "@/components/site-header";
import {SiteFooter} from "@/components/site-footer";
import {IntakeForm} from "@/components/intake-form";
import {env} from "cloudflare:workers";
export const dynamic="force-dynamic";
export const metadata:Metadata={title:"Online intake",robots:{index:false}};
export default function Intake(){const enabled=(env as unknown as Record<string,string|undefined>).INTAKE_ENABLED==="true";return <><SiteHeader/><main className="shell content-page intake-grid"><section className="intake-copy"><a href="/" className="back-link"><ArrowLeft size={17}/>Terug naar de website</a><p className="eyebrow green-word">Zet de volgende stap</p><h1>Vertel ons<br/>waar je staat.</h1><p>Over je bedrijf. Je batterijen. En de informatie die je al hebt. Zo krijgen we een goed beeld van jouw vraag.</p><h2>Nog niet alles bekend?</h2><p>Dat is geen probleem. Begin met wat je weet en geef aan waar je hulp bij zoekt.</p></section>{enabled?<IntakeForm/>:<section className="intake-form"><p className="eyebrow">Online intake</p><h2 style={{margin:0}}>Binnenkort beschikbaar.</h2><p>Het formulier is op dit moment nog niet geopend. Kom binnenkort terug om je aanvraag te starten.</p><a className="back-link" href="/">Terug naar de website <ArrowLeft size={17}/></a></section>}</main><SiteFooter/></>}
