// Only the private mail worker may call this API. Never return intake data to the public form.
export type DeliveryDb = Pick<D1Database, "prepare" | "batch">;
export const DELIVERY_LEASE_MS = 10 * 60 * 1000;
export const WORKER_FRESH_MS = 10 * 60 * 1000;
export const MAX_ATTEMPTS = 12;

export async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join("");
}

export async function authorizedWorker(request: Request, expectedHash: string | undefined) {
  if (!expectedHash || !/^[a-f0-9]{64}$/.test(expectedHash)) return false;
  const header = request.headers.get("authorization") ?? "";
  if (!/^Bearer [a-f0-9]{64}$/.test(header)) return false;
  const actual = await sha256(header.slice(7));
  let different = 0;
  for (let i = 0; i < 64; i++) different |= actual.charCodeAt(i) ^ expectedHash.charCodeAt(i);
  return different === 0;
}

export async function workerReady(db: DeliveryDb, now = Date.now()) {
  const state = await db.prepare("SELECT last_seen FROM intake_worker WHERE id = 1").first<{last_seen: number}>();
  if (!state || state.last_seen < now - WORKER_FRESH_MS) return false;
  const blocked = await db.prepare("SELECT id FROM intakes WHERE delivery_status='uncertain' OR (delivery_status <> 'accepted' AND created_at < ?) LIMIT 1").bind(now - 30 * 60 * 1000).first();
  return !blocked;
}

export async function claimIntake(db: DeliveryDb, now = Date.now()) {
  const lease = crypto.randomUUID();
  // RETURNING makes selection and claiming one atomic write, including concurrent polls.
  const results = await db.batch([
    db.prepare("INSERT INTO intake_worker (id,last_seen) VALUES (1,?) ON CONFLICT(id) DO UPDATE SET last_seen=excluded.last_seen").bind(now),
    db.prepare("UPDATE intakes SET delivery_status='uncertain',lease_until=NULL,last_error='attempt_limit' WHERE attempts >= ? AND delivery_status IN ('pending','retry','processing') AND (lease_until IS NULL OR lease_until <= ?)").bind(MAX_ATTEMPTS, now),
    db.prepare("UPDATE intakes SET delivery_status='processing',lease_token=?,lease_until=?,attempts=attempts+1 WHERE id = (SELECT id FROM intakes WHERE attempts < ? AND ((delivery_status IN ('pending','retry') AND next_attempt_at <= ?) OR (delivery_status='processing' AND lease_until <= ?)) ORDER BY created_at,id LIMIT 1) RETURNING id,company,email,application,message,created_at,attempts")
      .bind(lease, now + DELIVERY_LEASE_MS, MAX_ATTEMPTS, now, now),
  ]);
  const row = results[2].results[0];
  return row ? { ...row, lease } : null;
}

export type DeliveryOutcome = "accepted" | "retry" | "uncertain";
export async function acknowledgeIntake(db: DeliveryDb, id: string, lease: string, outcome: DeliveryOutcome, now = Date.now()) {
  // Old workers cannot acknowledge a newer claim; repeated acknowledgements are harmless.
  const result = await db.prepare("UPDATE intakes SET delivery_status=?,accepted_at=CASE WHEN ?='accepted' THEN ? ELSE accepted_at END,next_attempt_at=? + MIN(3600000,60000 * (1 << MIN(attempts,6))),lease_until=NULL,last_error=CASE WHEN ?='accepted' THEN NULL WHEN ?='uncertain' THEN 'mail_acceptance_unknown' ELSE 'local_mail_rejected' END WHERE id=? AND lease_token=? AND (delivery_status='processing' OR (delivery_status='uncertain' AND last_error='attempt_limit' AND ?='accepted'))")
    .bind(outcome, outcome, now, now, outcome, outcome, id, lease, outcome).run();
  if (result.meta.changes) return true;
  const existing = await db.prepare("SELECT delivery_status,lease_token FROM intakes WHERE id=?").bind(id).first<{delivery_status: string; lease_token: string}>();
  return existing?.delivery_status === outcome && existing.lease_token === lease;
}

export async function deliveryStatus(db: DeliveryDb, now = Date.now()) {
  const [worker, counts, oldest] = await Promise.all([
    db.prepare("SELECT last_seen FROM intake_worker WHERE id=1").first<{last_seen: number}>(),
    db.prepare("SELECT delivery_status AS status,count(*) AS total FROM intakes GROUP BY delivery_status").all(),
    db.prepare("SELECT MIN(created_at) AS oldest FROM intakes WHERE delivery_status <> 'accepted'").first<{oldest: number | null}>(),
  ]);
  return { workerFresh: !!worker && worker.last_seen >= now - WORKER_FRESH_MS, lastSeen: worker?.last_seen ?? null, counts: counts.results, oldestUnacceptedAt: oldest?.oldest ?? null };
}
