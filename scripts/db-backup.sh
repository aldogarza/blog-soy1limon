#!/usr/bin/env bash
# Dumps the linked (real) Supabase project into backups/, which is git-ignored.
# The database password is read from SUPABASE_DB_PASSWORD or asked interactively by the CLI.
set -euo pipefail

cd "$(dirname "$0")/.."

stamp="$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p backups
chmod 700 backups

pnpm exec supabase db dump --linked --file "backups/${stamp}-schema.sql"
pnpm exec supabase db dump --linked --data-only --use-copy --file "backups/${stamp}-data.sql"
chmod 600 "backups/${stamp}-"*.sql

echo "Backup written to backups/${stamp}-schema.sql and backups/${stamp}-data.sql (git-ignored)."
