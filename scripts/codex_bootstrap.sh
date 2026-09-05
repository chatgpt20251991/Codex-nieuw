#!/usr/bin/env bash
set -euo pipefail
npm ci
npm run db:generate
npx prisma validate --schema apps/api/prisma/schema.prisma
npm run typecheck
npm run build
npm test
cat <<'MSG'
Base compile gates passed.
Next: run npm run test:integration against the isolated PostgreSQL cluster, then continue at codex/NEXT_TASKS.md Gate 3.
MSG
