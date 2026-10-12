#!/bin/sh
# Prepares the e2e database, then serves the production build. DATABASE_URL must point at an *_e2e database.
set -e
case "$DATABASE_URL" in *e2e*) ;; *) echo "DATABASE_URL must be the e2e database" >&2; exit 1 ;; esac
rm -rf ./storage-e2e
NODE_ENV=test npx tsx scripts/reset-db.ts
NODE_ENV=test npx tsx scripts/seed.ts
NODE_ENV=test npx tsx e2e/fixtures.ts
exec npx next start -p "$PORT"
