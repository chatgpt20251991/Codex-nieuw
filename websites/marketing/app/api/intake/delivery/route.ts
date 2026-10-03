import { env } from "cloudflare:workers";
import { z } from "zod";
import { intakeDb } from "@/lib/intake-db";
import { acknowledgeIntake, authorizedWorker, claimIntake, deliveryStatus } from "@/lib/intake-delivery";

const command = z.discriminatedUnion("action", [
  z.object({action: z.literal("claim")}).strict(),
  z.object({action: z.literal("status")}).strict(),
  z.object({action: z.literal("ack"), id: z.string().uuid(), lease: z.string().uuid(), outcome: z.enum(["accepted", "retry", "uncertain"])}).strict(),
]);
const reply = (body: unknown, status = 200) => Response.json(body, {status, headers: {"Cache-Control": "no-store", "X-Content-Type-Options": "nosniff"}});

export async function POST(request: Request) {
  const configuration = env as unknown as Record<string, string | undefined>;
  if (!await authorizedWorker(request, configuration.INTAKE_WORKER_TOKEN_SHA256)) return reply({error: "Unauthorized"}, 401);
  if (configuration.INTAKE_WORKER_ENABLED !== "true") return reply({error: "Worker disabled"}, 503);
  if (!request.headers.get("content-type")?.startsWith("application/json")) return reply({error: "JSON required"}, 415);
  // Bound the streamed body as well as Content-Length, before parsing or database access.
  let body = "";
  const reader = request.body?.getReader();
  if (!reader) return reply({error: "Invalid command"}, 400);
  try {
    let length = 0;
    const decoder = new TextDecoder("utf-8", {fatal: true});
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      length += chunk.value.byteLength;
      if (length > 2048) { await reader.cancel(); return reply({error: "Too large"}, 413); }
      body += decoder.decode(chunk.value, {stream: true});
    }
    body += decoder.decode();
  } catch { return reply({error: "Invalid command"}, 400); }
  finally { reader.releaseLock(); }
  let input;
  try { input = command.safeParse(JSON.parse(body)); }
  catch { return reply({error: "Invalid command"}, 400); }
  if (!input.success) return reply({error: "Invalid command"}, 400);
  try {
    const db = intakeDb();
    const data = input.data;
    if (data.action === "status") return reply(await deliveryStatus(db));
    if (data.action === "claim") return reply({intake: await claimIntake(db)});
    const acknowledged = await acknowledgeIntake(db, data.id, data.lease, data.outcome);
    return reply({acknowledged}, acknowledged ? 200 : 409);
  } catch {
    console.error("Intake delivery operation failed");
    return reply({error: "Temporarily unavailable"}, 503);
  }
}
