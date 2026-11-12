import { z } from "zod";

// Keep the worker's small, authenticated command contract strict across Zod
// updates. Unknown properties never reach delivery/database operations.
export const deliveryCommandSchema = z.discriminatedUnion("action", [
  z.object({action: z.literal("claim")}).strict(),
  z.object({action: z.literal("status")}).strict(),
  z.object({action: z.literal("ack"), id: z.string().uuid(), lease: z.string().uuid(), outcome: z.enum(["accepted", "retry", "uncertain"])}).strict(),
]);
