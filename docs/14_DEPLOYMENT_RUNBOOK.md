# Deployment Runbook — first production environment

1. EU-region account/project and network segmentation.
2. Managed PostgreSQL Multi-AZ; create separate migrator/runtime users.
3. Managed private object storage with KMS, versioning and retention policy.
4. Managed Redis/queue only when asynchronous jobs are enabled.
5. Deploy schema migration with migrator user.
6. Apply RLS SQL and execute cross-tenant database tests with runtime user.
7. Configure OIDC issuer/audience/JWKS and disable dev auth.
8. Configure HTTPS resolver domain; registrar lock + DNSSEC where supported.
9. Deploy API behind WAF/rate limiting; no direct DB/storage public exposure.
10. Deploy web app with strict CSP after frontend asset review.
11. Configure malware scanner before accepting customer evidence.
12. Configure audit-log export to independent immutable sink.
13. Enable backups and run an actual restore into an isolated environment.
14. Keep Registry live submission flags false until official adapter tests pass.
15. Run pen test and launch-gate review.
