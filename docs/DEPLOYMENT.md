# Deployment

The app is a standard Node.js server (`next start`) plus one long-running worker process, both using the same PostgreSQL database. Uploaded videos are stored on local disk at `STORAGE_DIR`. **This has not been deployed anywhere from this repository yet**; the steps below are the intended procedure, and they were exercised locally (production build, migrations, seed, e2e suite against `next start`).

## Requirements

- Node.js 22+, `ffmpeg`/`ffprobe` on the PATH of both processes.
- PostgreSQL 14+ (managed is fine, e.g. Supabase or RDS) with `pg_trgm` and `citext`. The first migration runs `CREATE EXTENSION IF NOT EXISTS`. If your role cannot create extensions, ask your provider to enable them.
- A persistent volume for `STORAGE_DIR`, shared by the web and worker processes. Single-host deployments (VM, Fly.io/Render with a volume, Docker host) fit this model. Serverless platforms without persistent disks need an S3-compatible `BlobStorage` implementation first (see `src/server/storage/index.ts`).

## Steps

```bash
npm ci
npm run build
DATABASE_URL=... npm run db:migrate      # on every deploy, before starting the new version
DATABASE_URL=... npm run db:seed         # first deploy only (idempotent)

# processes
npm start                                # web, port 3000 (PORT to change)
npm run worker                           # background jobs; run at least one
```

Then sign up and run `npm run make-admin -- <email>`.

## Configuration checklist

- `APP_ORIGIN=https://your-domain`. This also turns on the `Secure` cookie flag.
- Terminate TLS at a reverse proxy that **appends** the client IP to `X-Forwarded-For` (rate limits use the last entry).
- Set the proxy's request body limit to at least `VIDEO_MAX_BYTES`.
- Optional integrations: `ANTHROPIC_API_KEY` (+ `ANTHROPIC_MODEL`, `LLM_DAILY_TOKEN_BUDGET`), `SEARCH_PROVIDER` + `SEARCH_API_KEY`, `RESEARCH_ALLOWED_DOMAINS`, `VIDEO_MODEL_ENDPOINT`.
- Back up the database and `STORAGE_DIR` together.

## Cost notes

- Language model: every assistant question that matches records makes one call (≈1–3k input tokens). A research job makes one call over up to five documents (each capped at 12k characters). `LLM_DAILY_TOKEN_BUDGET` is a hard global cap (default 200k tokens/day). Usage per day and feature is shown in Studio → Overview.
- Search API: up to four queries per research job. The daily gap scan queues at most 10 jobs.
- Storage grows with uploads (default limit 200 MB per file, 20 uploads per user per hour).
