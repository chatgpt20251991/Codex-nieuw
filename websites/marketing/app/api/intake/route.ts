import{env}from"cloudflare:workers";
import{intakeSchema}from"@/lib/intake-validation";
import{intakeDb}from"@/lib/intake-db";
const allowedOrigins=new Set(["https://eubatterypassport.nl","https://www.eubatterypassport.nl","https://eubatterypassport.ll33555555.chatgpt.site"]);
function json(body:unknown,status=200){return Response.json(body,{status,headers:{"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}})}
type Saved={company:string;email:string;application:string;message:string};
function same(a:Saved,b:Saved){return a.company===b.company&&a.email===b.email&&a.application===b.application&&a.message===b.message}
async function boundedBody(request:Request){const reader=request.body?.getReader();if(!reader)return "";const decoder=new TextDecoder("utf-8",{fatal:true});let total=0,text="";try{while(true){const chunk=await reader.read();if(chunk.done)break;total+=chunk.value.byteLength;if(total>16000){await reader.cancel();throw new RangeError("body limit")}text+=decoder.decode(chunk.value,{stream:true})}return text+decoder.decode()}finally{reader.releaseLock()}}
export async function POST(request:Request){
 const origin=request.headers.get("origin");
 if(!origin||(!allowedOrigins.has(origin)&&!(process.env.NODE_ENV==="development"&&/^http:\/\/127\.0\.0\.1:\d+$/.test(origin))))return json({error:"Deze aanvraag komt niet van de website."},403);
 const configuration=env as unknown as Record<string,string|undefined>;
 if(configuration.INTAKE_ENABLED!=="true"||!configuration.RATE_LIMIT_SALT)return json({error:"Het intakeformulier is tijdelijk niet beschikbaar. Probeer het later opnieuw."},503);
 if(!request.headers.get("content-type")?.startsWith("application/json"))return json({error:"Ongeldig aanvraagformaat."},415);
 if(Number(request.headers.get("content-length")||0)>16000)return json({error:"Je bericht is te lang."},413);
 let raw;try{raw=JSON.parse(await boundedBody(request))}catch(e){return json({error:e instanceof RangeError?"Je bericht is te lang.":"De aanvraag kon niet worden gelezen."},e instanceof RangeError?413:400)}
 const parsed=intakeSchema.safeParse(raw);if(!parsed.success)return json({error:"Controleer je bedrijfsnaam, e-mailadres en batterijtoepassing."},400);
 if(parsed.data.website)return json({error:"De aanvraag kon niet worden verwerkt."},400);
 const data=parsed.data,now=Date.now(),reference="EUBP-"+data.requestId.slice(0,8).toUpperCase();
 const repeated=(saved:Saved)=>same(saved,data)?json({reference}):json({error:"Deze aanvraag is al verzonden. Open een nieuwe intake voor een andere vraag."},409);
 try{
 const db=intakeDb();
 await db.prepare("DELETE FROM intakes WHERE created_at < ?").bind(now-90*86400000).run();
 const previous=await db.prepare("SELECT company,email,application,message FROM intakes WHERE id = ?").bind(data.requestId).first<Saved>();if(previous)return repeated(previous);
 const ip=request.headers.get("cf-connecting-ip")||"unknown";
 const bytes=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(configuration.RATE_LIMIT_SALT+":"+new Date(now).toISOString().slice(0,10)+":"+ip));
 const hash=Array.from(new Uint8Array(bytes)).map(x=>x.toString(16).padStart(2,"0")).join("");
 const result=await db.prepare("INSERT OR IGNORE INTO intakes (id,company,email,application,message,created_at,ip_hash,delivery_status) SELECT ?,?,?,?,?,?,?,? WHERE (SELECT count(*) FROM intakes WHERE ip_hash = ? AND created_at > ?) < 5").bind(data.requestId,data.company,data.email,data.application,data.message,now,hash,"pending",hash,now-3600000).run();
 if(!result.meta.changes){const existing=await db.prepare("SELECT company,email,application,message FROM intakes WHERE id = ?").bind(data.requestId).first<Saved>();if(existing)return repeated(existing);return json({error:"Er zijn al meerdere aanvragen verstuurd. Probeer het over een uur opnieuw."},429)}
 return json({reference},201);
 }catch{console.error("Intake storage operation failed");return json({error:"Versturen is niet gelukt. Je gegevens blijven in het formulier staan. Probeer het later opnieuw."},503)}
}

