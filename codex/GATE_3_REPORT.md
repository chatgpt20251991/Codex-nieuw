# Gate 3 — passport disclosure and capability access

Review baseline: `e9ee73144503ce562177cf2e639a87a78349a70d`.
GitHub Actions confirmed Gate 1 and Gate 2 on that commit in
[run 33982077710](https://github.com/chatgpt20251991/Codex-nieuw/actions/runs/33982077710):
clean install, Prisma generation/validation, typecheck, production builds,
20 rule tests, 43 source checks and 14 real PostgreSQL/API integration tests.

## Findings and changes

- The publisher filtered restricted values but copied `battery.lifecycleStatus`
  into the public snapshot. The same alias leaked item-tier field 67 through a
  model-tier grant. An explicit projection now applies the configured field tier
  to that alias, strips internal IDs and provenance metadata, and selects only
  public fields or the exact granted tier. Field 50 is excluded from both
  capability tiers. Stored `accessTier` labels never override the rule catalogue.
- The public HTTP reader applies that projection to stored public snapshots too,
  so older snapshots cannot bypass the current output contract. It still reads
  only `get_public_passport_snapshot`, never canonical passport versions.
- The token resolver used `validFrom` from a SQL metadata response that did not
  contain it; a future grant was usable immediately. It now reads and validates
  the actual grant within the same tenant transaction as disclosure and audit.
- An unscoped stored grant could omit the battery filter and select another
  published passport. Missing battery scope, absent expiry, unknown tiers and
  authority-only stored tiers now fail closed. Request body identifiers or roles
  cannot expand the token's scope.
- `POST /v1/access-grants/:id/revoke` revokes a grant under tenant RLS. Repeated
  revocation is idempotent. Creation/revocation and their audit events commit
  together. Restricted reads also require a successful audit insert. Row locks
  serialize grant reads with revocation; a response already in progress cannot
  be recalled, but subsequent reads reject a revoked grant.

## Regression evidence

The new `test/integration/passport-disclosure.test.cjs` publishes a real passport
through the API, with all 71 values created, linked to fixture evidence and
validated through the normal endpoints. It does not prebuild the primary
publication snapshot. Eight additional scenarios cover public storage/HTTP/QR,
both capability tiers, field 50, token hashes, invalid/future/expired/revoked
tokens, malformed stored grants, cross-tenant/item scope, unpublished drafts and
legacy metadata. Before the fix, six of those eight scenarios failed while the
existing 14 isolation tests passed.

After the fixes, all **22/22** PostgreSQL/API integration tests passed locally,
with no skips, on Node 24.15.0 and PostgreSQL 16.14.
Clean locked install, Prisma generation/validation, all workspace typechecks,
20 rule tests, 43 source checks and both production builds also passed.

Run `npm run test:integration` to execute both suites on a fresh migrated database
using the non-owner runtime role. This remains a required CI step.

## Boundaries and next work

Evidence records are verified database fixtures for this gate. MinIO signed
upload, byte integrity and malware scanning are not proven by these tests. Gate 4
is next. Full lifecycle/hash-chain E2E remains Gate 5. Production OIDC, external
authority identity, action-level delegated scopes and legal/standards review are
still outstanding. Registry flags remain false; no registration state is faked.

The external response intentionally no longer includes internal battery/model
IDs, evidence IDs, source/validation metadata or arbitrary canonical properties.
Legacy public snapshot rows and their historical hashes are not rewritten; HTTP
responses are filtered. If such rows have been exported or served by another
path, review/regenerate those projections before rollout. Newly published public
snapshots store the filtered document and its corresponding hash.

The ten existing Dependabot PRs are separate upgrade work. Six fail CI (Nest core,
common/platform, Prisma/client and TypeScript); four pass. Upgrade related Nest
packages together and Prisma CLI/client together, and review TypeScript's removed
module-resolution option. A passing dependency PR is not a production release
approval. No existing dependency PR was merged by this review.
