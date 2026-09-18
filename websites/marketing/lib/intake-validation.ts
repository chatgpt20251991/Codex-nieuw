import{z}from"zod";
export const intakeSchema=z.object({
 requestId:z.string().uuid(),
 company:z.string().trim().min(2).max(160),
 email:z.string().trim().email().max(254),
 application:z.enum(["Elektrische voertuigen","Energieopslag","Industriële toepassingen","Lichte vervoermiddelen","Andere toepassing","Nog onbekend"]),
 message:z.string().trim().max(3000).default(""),
 website:z.string().max(200).default("")
});

