#!/usr/bin/env bash
set -euo pipefail
node --env-file-if-exists=.env scripts/apply-rls.cjs
