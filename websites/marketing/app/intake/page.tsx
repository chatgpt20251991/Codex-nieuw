import type {Metadata} from "next";
import {ArrowLeft} from "lucide-react";
import {SiteHeader} from "@/components/site-header";
import {SiteFooter} from "@/components/site-footer";
import {IntakeForm} from "@/components/intake-form";
import {env} from "cloudflare:workers";
import {intakeDb} from "@/lib/intake-db";
import {workerReady} from "@/lib/intake-delivery";
export const dynamic="force-dynamic";
export const metadata:Metadata={title:"Online intake",robots:{index:false}};
export default async function Intake(){
 const configuration=env as unknown as Record<string,string|undefined>;
 let enabled=false;
 if(configuration.INTAKE_ENABLED==="true"&&configuration.INTAKE_WORKER_ENABLED==="true"&&configuration.RATE_LIMIT_SALT&&configuration.INTAKE_WORKER_TOKEN_SHA256){try{enabled=await workerReady(intakeDb())}catch{enabled=false}}
 return <><SiteHeader/><main id="main" className="shell content-page intake-grid"><section className="intake-copy"><a href="/" className="back-link"><ArrowLeft size={17}/>Terug naar de website</a><p className="eyebrow green-word">Zet de volgende stap</p><h1>Vertel ons<br/>waar u staat.</h1><p>Over uw bedrijf. Uw batterijen. En de informatie die u al heeft. Zo krijgen we een goed beeld van uw vraag.</p><h2>Nog niet alles bekend?</h2><p>Dat is geen probleem. Begin met wat u weet en geef aan waar u hulp bij zoekt.</p></section>{enabled?<IntakeForm/>:<section className="intake-form"><p className="eyebrow">Online intake</p><h2 style={{margin:0}}>Neem contact met ons op.</h2><p>Het formulier is op dit moment niet beschikbaar. Stuur uw vraag naar <a href="mailto:info@eubatterypassport.nl">info@eubatterypassport.nl</a>.</p><a className="back-link" href="/">Terug naar de website <ArrowLeft size={17}/></a></section>}</main><SiteFooter/></>;
}
