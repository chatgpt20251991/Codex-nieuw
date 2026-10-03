# Private intake mail worker

Status: implementation prepared. Keep public intake disabled until the real mail
path, error notification and processing have been verified. The ordinary mailbox
roundtrip does not prove PHP delivery. `mail() === true` means local mail queue
acceptance, never proven inbox delivery.

## Architecture

Sites records an intake in D1 before acknowledging receipt. A private PHP 8.2+
CLI process on the existing Vimexx account polls the HTTPS delivery API. Requests
are atomically claimed with a ten-minute lease. The worker sends only to
`info@eubatterypassport.nl`, from the same address, with the validated visitor
address as Reply-To. No attachments, visitor-selected recipients, SMTP passwords
or public PHP endpoints are used.

The dedicated 32-byte random token is held only in the private PHP config. Sites
stores its SHA-256 verifier. The endpoint supports only claim, acknowledgement
and aggregate queue status. Requests require HTTPS, authentication, bounded JSON
and runtime enablement. Responses and logs must not expose secrets or intake data
to unauthenticated callers.

## Install and activate

1. Publish the reviewed website source and D1 migration with `INTAKE_ENABLED=false`
   and `INTAKE_WORKER_ENABLED=false`.
2. Copy `worker.php` outside **all** documentroots, into
   `/home/u223943p491486/eubp-mail-private` (directory mode 0700). Preserve this
   directory and its journal through future deployments.
3. Provision a dedicated random 64-character hex token in private `config.php`
   (0600). Never reuse a mailbox or hosting password. Never commit the config.
   For browser credential entry, hand this step to the account owner.
4. Set Sites runtime `INTAKE_WORKER_TOKEN_SHA256` to the SHA-256 hex verifier;
   set a separate random secret `RATE_LIMIT_SALT`. Only then enable the worker.
5. Schedule `php /home/u223943p491486/eubp-mail-private/worker.php` every minute.
   Configure cron error output to `info@eubatterypassport.nl`; do not discard it.
   Avoid global settings changes if other cron tasks use a different recipient.
   Verify permissions, PHP/cURL/fsync, HTTPS validation and actual queue polling.
6. With explicit authorization, send a labeled synthetic test using the worker's
   exact fixed mail transport. Inspect its receipt in the real mailbox and local
   mail logs, including return path. Verify that a deliberately simulated error
   reaches the operator. Do not change an account-wide PHP mailfrom setting
   without checking effects on the account's other websites.
7. After successful delivery and alert tests, enable `INTAKE_ENABLED=true`, apply
   the runtime revision, submit one labeled end-to-end synthetic intake and verify
   D1 acceptance plus actual mailbox receipt. Repeating its requestId must not
   create another message. Turn intake off again if any required check fails.

The PHP preflight and tests send **no real email**. On the selected server,
`php verify.php` passed with PHP 8.3.30 on September 18, 2026. The temporary
verification cron was removed afterward. A 404 from the not-yet-published
delivery endpoint at that point only proved HTTPS reachability.

## Failure and recovery

- The local journal is committed before sending, and commits the result before
  acknowledging D1. Unacknowledged receipts are retried before new claims.
  Lost acknowledgements never cause a known accepted message to be sent again.
- A definite local rejection backs off and retries, up to twelve attempts.
- A crash while handing a message to the mail queue leaves `uncertain`. Automatic
  re-sending stops, because delivery may already have happened. This intentionally
  does not promise exactly-once delivery.
- Uncertain requests or requests waiting over 30 minutes close the public intake
  and emit a generic operator alert at most daily. A heartbeat older than ten
  minutes also closes intake. `state/health.json` shows counts and timestamps.
- Inspect the fixed request ID/Message-ID in mailbox and DirectAdmin outgoing
  logs before reconciling an uncertain request. Preserve the receipt/lease.
  If acceptance is proven and the lease matches the final attempt, acknowledge
  accepted; never reset an accepted journal entry merely to force a resend.
  Otherwise, process the stored intake manually and record that decision.
- If the cron runner itself stops, the website closes after ten minutes but the
  stopped process cannot send its own alert. Check cron/hosting status separately.
- D1 cleanup only removes accepted records older than 90 days; unsent requests
  are never silently discarded by age. Mailbox copies and minimal receipt files
  require operational retention handling. Do not delete pending receipts.

## Checks

Run `node --experimental-strip-types --test test/*.test.mjs`, the TypeScript check,
the normal website build, and `php ops/mail-worker/test.php` on PHP 8.2+.
The PHP tests use an injected fake transport. Preserve both tests and the D1
migration in GitHub; keep the private config and runtime state out of Git.
