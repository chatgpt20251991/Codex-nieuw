#!/usr/bin/env bash
set -euo pipefail
: "${DATABASE_URL:?Set DATABASE_URL first}"
command -v psql >/dev/null || { echo "psql is required" >&2; exit 1; }
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f infra/postgres/001_rls.sql
echo "RLS policy pack applied. Verify using the non-owner runtime DB role before production."
