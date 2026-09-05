# Gate 7 target-environment acceptance

These are deployment acceptance steps, not a deployment record. CI exercises
synthetic identity, storage, scanner and recovery fixtures. No real provider,
gateway, monitoring destination, backup schedule or production environment has
been configured by this runbook. Keep both Registry live flags false.

## Identity owner: prove the real provider contract

Register the API as its own resource/audience with the chosen provider. Set
`AUTH_MODE=oidc`, the exact HTTPS `OIDC_ISSUER`, its verified HTTPS
`OIDC_JWKS_URL`, and `OIDC_AUDIENCE` for this API. Map the provider-controlled
organisation and role fields using `OIDC_ORGANISATION_CLAIM` and
`OIDC_ROLE_CLAIM`; a dotted or namespaced name is a literal top-level claim name,
not a nested-object traversal expression.

The organisation claim must be the platform organisation's UUID, assigned by a
trusted provisioning process. End users must not edit this claim or grant
themselves an elevated role in a profile form. Roles must match the application's
five accepted values: `operator_admin`, `operator_user`, `compliance_manager`,
`service_provider` or `service_provider_admin`. An absent role defaults to
`operator_user`; unknown roles fail. Explicitly select the provider's asymmetric
algorithm from RS256, PS256 or ES256. Never put an IdP secret in a
`NEXT_PUBLIC_*` setting.

Record sanitized results for real API access tokens from two test organisations:
valid audience/issuer/claims accepted; ID token or wrong resource audience,
missing/ambiguous organisation, expired/future token, changed signature, unknown
key and foreign organisation access rejected. Exercise the provider's actual
signing-key rollover and JWKS outage. A service provider still needs a live
`WrittenAuthorisation`; possessing a signed role is insufficient for another
tenant's data. Confirm production `/v1/auth/dev-token` cannot issue a token.

The verifier currently requires `sub`, `iat`, `exp` and the organisation claim,
allows five seconds of clock tolerance, and caps token age at one hour. Choose a
short provider access-token lifetime consistent with incident response. This is
stateless JWT verification: revoking an IdP session does not itself make every
already-issued access token immediately invalid. Document the actual revocation
window, key-cache behavior and emergency containment process. Finish and test
the browser sign-in/redirect/logout flow against this provider before inviting
customers; API token verification alone does not prove that flow.

Evidence: `oidc-acceptance` record containing deployment revision, issuer,
audience, claim/role mapping, tested key IDs, sanitized request IDs and pass/fail
outcomes. Store neither bearer tokens nor private signing keys in the record.

## Operations owner: trust the gateway, not caller forwarding headers

The API's in-memory safety limiter uses the socket peer address and deliberately
does not trust forwarding headers. Behind one reverse proxy, users share that
proxy's API fallback budget; adding API replicas adds independent budgets.
`API_RATE_LIMIT_PER_MINUTE` and `AUTH_RATE_LIMIT_PER_MINUTE` therefore do not
implement a shared user limit or replace the edge/WAF.

`infra/nginx/security.conf.example` is an include for the **existing `http {}`
context**, once per dedicated API gateway. It declares URI maps, shared-memory
zones, inherited rate controls and a JSON log format. It supplies no host names,
listeners, certificate paths, upstream addresses or trust CIDRs. Review the
starting budgets of 600 API requests/minute and 120 sensitive requests/minute
with the stated bursts against the actual traffic model. They are engineering
examples, not a promise of service capacity.

The sensitive classification covers `/v1/auth`, `/v1/supplier-portal`,
`/v1/restricted-access` and `/v1/access-grants`, including their child routes.
The actual public resolver is `GET /v1/public/b/:publicId` and
`GET /v1/public/b/:publicId/qr.svg`; it remains available under the ordinary API
budget, without requiring login or payment. There is no blanket `/public`
authentication exception or raw canonical-passport route in the gateway snippet.

Before activation, the gateway owner must:

1. Make the API reachable only from the intended private gateway path. If a
   trusted load balancer precedes NGINX, list only its verified source CIDRs in
   `set_real_ip_from`, select its documented client-IP header and validate the
   chain with `real_ip_recursive`. Never trust all addresses or accept a header
   from a connection that bypasses the approved proxy.
2. In the existing proxy location, overwrite client-supplied forwarding fields
   with the gateway's verified address/protocol; strip caller `X-Request-ID` so
   the API generates its own UUID. Preserve the API's response `X-Request-ID`
   and all CSP/no-store headers. Keep HTML/API caching off and retain the exact
   `/v1/...` URI when proxying; a `proxy_pass` trailing URI changes rewriting
   behavior and must be tested. Add no permissive CORS override.
3. Select `eubp_security_json` for the approved local access-log destination.
   Edge-generated `edgeRequestId` identifies requests rejected before the API;
   `apiRequestId` correlates responses that reached it. Audit existing
   `limit_req` directives: a child override stops inheriting the parent limits,
   so repeat both budgets where a route overrides them. Native NGINX error logs
   may still include request lines; restrict and sanitize that separate stream
   before exporting it. The custom access-log format does not redact error logs.
4. Run `nginx -t` against the complete target configuration before reload and
   preserve its sanitized result. Test two independent clients, spoofed
   forwarding headers, route case/encoded variants, the real public/QR routes,
   capability failures, burst recovery and 429 handling through every ingress.
   Confirm ordinary shared-office traffic is not incorrectly blocked by the
   proxy-address API fallback. Adjust bounded fallback capacity using measured
   aggregate traffic; do not disable it or trust arbitrary headers.
5. Use one enforcing front door or a WAF/distributed limit facility whose
   counters are shared across all active ingress replicas. NGINX's open-source
   shared-memory zones share state among one instance's workers, not across
   machines. Attach the selected WAF rule-set/version and test evidence,
   including body/URI limits and its handling of the application's JSON and
   direct-to-storage upload flow.

The NGINX include was reviewed against the official
[rate-limit](https://nginx.org/en/docs/http/ngx_http_limit_req_module.html),
[URI map](https://nginx.org/en/docs/http/ngx_http_map_module.html),
[trusted real-IP](https://nginx.org/en/docs/http/ngx_http_realip_module.html),
[proxy](https://nginx.org/en/docs/http/ngx_http_proxy_module.html) and
[JSON access-log](https://nginx.org/en/docs/http/ngx_http_log_module.html)
contracts. It has not been activated or validated against a chosen deployment's
complete NGINX configuration. Evidence: reviewed gateway configuration hash,
trust topology/CIDRs, syntax-check result, WAF policy revision and load/abuse test
record with before/after 429 counts and ordinary-client success rates.

## On-call owner: collect and prove actionable alerts

Collect the API's JSON `http_request` records: `requestId`, `method`, normalized
`route`, `status` and `durationMs`. The logger deliberately omits raw URLs,
query parameters, bodies, token headers and client IPs. Rejection before router
matching can have `route="[unmatched]"`; keep those records in total/error counts.
Do not turn request IDs into indexed labels or add body/header capture to diagnose
an alert. Secure storage and access to all operational logs and audit exports.

For a Loki deployment, assign the API stream the collector label
`service="eubp-api"`. These ready-to-configure LogQL queries use the existing
record fields; no Loki instance or alert destination is installed by this PR:

```logql
# A: all completed API requests in five minutes
sum(count_over_time({service="eubp-api"} | json | event="http_request" | __error__="" [5m])) or vector(0)

# B: server errors in the same window
sum(count_over_time({service="eubp-api"} | json | event="http_request" | status >= 500 | __error__="" [5m])) or vector(0)

# C: invalid/denied access attempts
sum(count_over_time({service="eubp-api"} | json | event="http_request" | status=~"401|403" | __error__="" [5m])) or vector(0)

# D: application fallback rate rejections, including unmatched routes
sum(count_over_time({service="eubp-api"} | json | event="http_request" | status=429 | __error__="" [5m])) or vector(0)

# E: failures on scan-dependent operations; this does not identify the cause
sum(count_over_time({service="eubp-api"} | json | event="http_request" | status=503 | route=~"/v1/evidence/:id/(finalize|verify|extract)|/v1/supplier-portal/evidence/:id/finalize" | __error__="" [5m])) or vector(0)

# F: per-route p95 API latency, milliseconds
quantile_over_time(0.95, {service="eubp-api"} | json | event="http_request" | unwrap durationMs | __error__="" [5m]) by (route)
```

Parsing, numeric filters, range counts and latency unwrapping follow the official
[LogQL log-query](https://grafana.com/docs/loki/latest/query/log_queries/) and
[metric-query](https://grafana.com/docs/loki/latest/query/metric_queries/)
contracts. Zero fallbacks make quiet event categories usable in alert formulas.
Configure a separate missing-stream alarm after a regular health probe exists;
zero requests alone cannot distinguish no traffic from lost collection. Confirm
the emitted route templates and collector labels before activating queries.

Use these initial thresholds for an acceptance drill, then calibrate them to the
approved service objectives and representative traffic:

| Signal | Initial action threshold | First response |
|---|---|---|
| B/A error ratio | B at least 5 and B/A above 5%, sustained 5 minutes | Page on-call; inspect deployment/DB/storage/JWKS health using request IDs |
| C denied access | At least 30 in 5 minutes | Security triage; distinguish expired sessions, bad provider mapping and abuse |
| D application 429 | At least 10 in 5 minutes | Compare edge rejections and socket-proxy aggregation before changing capacity |
| E scan-dependent 503 | At least 3 in 5 minutes | Page operations; check private ClamAV, object versioning, storage and timeouts |
| F ordinary API latency | p95 above 2000 ms for 10 minutes with at least 100 requests/5 minutes | Investigate by route; give scan/extraction routes separate timeout-aligned objectives |
| ClamAV signature updates | Warning when last successful refresh exceeds 24 hours; release blocker above 48 hours | Restore signature updates and follow the evidence-ingress incident procedure; never accept a fake clean result |
| Recovery/CI security check | Any failed backup, missed approved backup deadline, restore drill or required scanner check | Open an incident/release block, preserve evidence and assign an owner |

The current HTTP logger does not emit the response error code, so E cannot prove
that a 503 specifically means `MALWARE_SCAN_UNAVAILABLE`. Collect private clamd/
FreshClam health and signature-age signals as well. A green `/v1/health` response
does not independently prove the scanner is reachable or its signatures current.

Malware detections persist `AuditEvent.action="evidence.malware_rejected"`;
successful accepted scan transitions persist `evidence.malware_clean` with the
hash, immutable storage version, scanner version and time. These are database
audit records, not existing stdout events. Provide a restricted audit-event
export to the security sink and alert on any rejection; do not grant the normal
runtime a cross-tenant RLS bypass to build that export. Until that integration
exists, assign a controlled audit review process and keep automated detection
notification marked unfinished. Scanner outages leave new scan-dependent
operations blocked; they must not erase old attestations or published versions.

Evidence: sanitized alert queries/rules, destination/on-call ownership, a delivered
test alert and acknowledgement for each critical signal, and scanner outage/
signature-refresh recovery timestamps. The scheduled GitHub dependency scan is
separate from production operational alerting.

## Release owner: recovery and independent security acceptance

Read `docs/18_MALWARE_SCANNING.md`, `docs/19_BACKUP_RESTORE_DRILL.md` and
`docs/20_WEB_SECURITY.md` before completing this short acceptance record:

| Owner | Required target-environment evidence |
|---|---|
| Storage/scanner operations | Versioned private EU storage and key/access configuration; real browser PUT origin/CORS; reviewed private clamd configuration and current signature refresh; clean/EICAR/timeout results; quarantined evidence cannot support new validation; legacy evidence re-review inventory |
| Recovery operations | Encrypted backup identifier/checksum and retained WAL/recovery point; restore into a separate approved destination; restored evidence bytes and exact versions match database hashes/scan attestations; owners/RLS/grants/hash chains/public projections unchanged; measured RPO/RTO versus signed targets; independent key/role recovery demonstrated |
| Security assessor | Authorized hosts/revision/accounts and written test scope; two-tenant IDOR/RLS and delegated-authorisation tests; JWT/claims/JWKS and capability expiry/revocation tests; public/restricted disclosure, stored/reflected XSS/CSP and upload/parser tests; edge/WAF bypass and rate tests; severity-ranked findings and retest record |
| Release/on-call owner | Required CI results and retained SBOM/SCA/secret/SAST evidence for the deployed revision; every blocking finding closed; alert delivery and incident rehearsal; rollback and continuity ownership; real domain/HTTPS/browser sign-in verified |

Use synthetic records for hostile-input tests unless the assessor's approved
scope explicitly requires otherwise. Do not restore over a live database, rewrite
published history, weaken a gate or enable the EU Registry to complete this
record. Unresolved provider selection, backup objectives, audit delivery or
penetration-test findings remain named launch blockers with an accountable
owner, rather than being counted as completed Gate 7 work.
