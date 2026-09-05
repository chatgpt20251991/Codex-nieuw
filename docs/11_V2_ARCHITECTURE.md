# V2 Architecture

## Security boundaries

### Authenticated operator boundary
OIDC/JWT identifies the actor's home organisation. Tenant switching is not accepted from request bodies. A service provider may pass `X-Acting-Organisation-Id`, but `TenantGuard` accepts it only when a current written authorisation exists between the actor organisation and target responsible operator.

### Tenant database boundary
Tenant-owned queries run in a transaction that calls `set_config('app.current_org_id', ...)`. The RLS policy pack compares every row's `organisationId` to that session-local value. Production must use a runtime DB role that cannot bypass RLS.

### Public boundary
Public clients cannot read the canonical passport table. Publication generates a physically separate `PublicPassportSnapshot` whose JSON already contains only public fields. A SECURITY DEFINER function returns that projection to the resolver.

### Capability-token boundary
Supplier invitations and legitimate-interest restricted views use high-entropy bearer capability tokens. Raw tokens are returned once; only SHA-256 hashes are stored. Token resolvers are SECURITY DEFINER functions returning minimal context, after which normal tenant RLS resumes.

### Evidence boundary
Large documents upload directly to private S3-compatible storage through short-lived signed URLs. The client computes SHA-256. S3 checksum validation is requested; finalisation also verifies the actual object bytes/checksum before the evidence object is accepted.

## Compliance state boundaries
A value can be `submitted` without being `validated`. Extraction outputs remain `suggested`. A validated passport value requires verified evidence. Publication requires all current mandatory/activated conditional requirements and provenance. Registration is a separate later state.
