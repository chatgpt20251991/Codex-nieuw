#!/usr/bin/env bash
set -euo pipefail
npm install
npm run db:generate
npx prisma validate --schema apps/api/prisma/schema.prisma
npm run typecheck
npm run build
npm test
cat <<'MSG'
Base compile gates passed.
Next: create migrations, run Docker integration DB using separate runtime role, apply infra/postgres/001_rls.sql, then execute codex/NEXT_TASKS.md Gate 2 onward.
MSG
