import{z}from"zod";
function deliverableEmail(value:string){const[local,domain]=value.split("@");return !!domain&&local.length<=64&&domain.split(".").every(label=>label.length>=1&&label.length<=63&&/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i.test(label))}
export const intakeSchema=z.object({
 requestId:z.string().uuid(),
 company:z.string().trim().min(2).max(160).refine(value=>!value.includes("\0")),
 email:z.string().trim().email().max(254).refine(deliverableEmail),
 application:z.enum(["Elektrische voertuigen","Energieopslag","Industriële toepassingen","Lichte vervoermiddelen","Andere toepassing","Nog onbekend"]),
 message:z.string().trim().max(3000).refine(value=>!value.includes("\0")).default(""),
 website:z.string().max(200).default("")
});
