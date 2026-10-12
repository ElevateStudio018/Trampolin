# Architecture

## Overview

A single Next.js application (server components + server actions) backed by PostgreSQL, plus a background worker process that shares the same code. All business logic lives in `src/server/*` as plain TypeScript services that take an explicit `actor` argument; pages and actions are thin adapters. Authorization is enforced inside the services, so every entry point (page, action, route handler, worker, test) gets the same checks.

```
src/
  app/            routes: pages, server actions, route handlers (UI only)
  components/     design system (ui.tsx), forms (client), nav
  db/             schema.ts (single source of truth), seed data, SQL helpers
  lib/            env parsing, errors, text normalisation (no server deps)
  server/
    actor.ts      Actor type + role checks (member < reviewer < admin)
    auth/         scrypt passwords, DB sessions (hashed tokens), cookie glue
    kb/           entries (search, duplicates, edit, publish rules), sources & claims
    me/           collection, progress logs, profile, export, account deletion
    research/     search providers, safe fetcher, extraction, pipeline, drafts/review
    assistant/    retrieval, safety classifier, answer composition, eval set
    llm/          the only module that calls the language model (budget, usage log)
    video/        upload validation, storage, streaming authz, analyzer registry, jobs
    community/    posts, comments, likes, bookmarks, reports, moderation, admin users
    jobs/         Postgres job queue (SKIP LOCKED) + runner
    storage/      blob storage interface (local disk implementation)
scripts/          migrate, seed, reset, worker, make-admin, assistant eval
tests/            Vitest integration tests against a real database
e2e/              Playwright end-to-end and visual tests against a production build
```

## Key decisions

| Decision | Reason |
| --- | --- |
| PostgreSQL full-text search + `pg_trgm` instead of a search service or embeddings | The corpus is small and name-centric; trigram similarity handles misspellings ("rudi" → Rudolph) and aliases, FTS handles descriptions. No extra service, no embedding costs. |
| Claims as first-class rows (`claims` ↔ `claim_sources` ↔ `sources`) | Each statement carries its own citations, stance (supports / contradicts / context) and excerpt. Evidence can be inspected per statement, and the assistant cites claims rather than whole pages. |
| Evidence status on entries + status on claims | Separates "how trustworthy is this entry overall" from "how well supported is this statement". Conflicts stay visible instead of being averaged away. |
| Aliases globally unique (normalised) | One spelling maps to one entry, which prevents silent duplicates and enables `/tricks/<alias>` redirects. |
| Optimistic concurrency (`revision`) + full snapshot per revision | Concurrent reviewer edits fail loudly instead of overwriting each other, and history is auditable. |
| Custom session auth (scrypt, opaque token, only SHA-256 stored) | No third-party dependency, works offline, tokens are useless if the DB leaks. |
| Postgres job queue with partial unique index on `dedupe_key` | Idempotent enqueueing (double clicks and scheduler ticks share a job), multiple workers via `FOR UPDATE SKIP LOCKED`, no Redis. |
| Research output only as *drafts* | Approval is the single path into the Trick Book. It imports only the claims a reviewer ticks that have a supporting source. Approval does not publish unless the reviewer asks for it. |
| Extraction validates quotes | LLM-proposed citations are kept only if the quote occurs verbatim in the cited document. Without a model, extraction quotes whole sentences, so it cannot paraphrase wrongly. |
| Assistant retrieval over published entries only | Private notes, drafts and other users' data are never in the model context. |
| Analyzer registry for video | Models plug in behind one interface. An unconfigured analyzer reports itself unavailable and is never simulated. |
| Raw-body streaming upload route | Avoids buffering large files in memory. The type is sniffed from magic bytes and the size limit is enforced while streaming. |

## Data model (main tables)

- **users, profiles, sessions**: role (`member`/`reviewer`/`admin`), suspension; profile and collection visibility (`private`/`members`/`public`).
- **categories, entries, entry_aliases, entry_relations**: the Trick Book. `entries.search_vector` is a generated, weighted `tsvector` (names A, summary B, body C). `search_names` (name + aliases) has a trigram index. Relations: `related`, `variant_of`, `distinct_from`, `component_of`.
- **sources, claims, claim_sources**: sources are unique by normalised URL and record publisher, reliability (`primary`/`secondary`/`community`/`unknown`), retrieval method and access time.
- **entry_revisions**: snapshot + change summary per revision.
- **jobs**: queue (`research.gap_scan`, `research.entry`, `video.probe`, `video.analyze`) with log lines, attempts, backoff and result.
- **research_drafts**: payload (summary, aliases, claims with source refs, open questions, extractor), review status (`pending_review`, `approved`, `rejected`, `needs_more_sources`, `conflicting_information`), unique `content_hash`.
- **collection_items, progress_logs**: personal data. Logs are only ever readable by their owner.
- **videos, video_analyses**: owner, storage key, sha256, ffprobe metadata, visibility, moderation flag, explicit `training_consent`, plus per-analyzer results.
- **posts, comments, post_likes, post_bookmarks, reports**: community. A partial unique index means one open report per reporter and target.
- **audit_log, rate_limits, llm_usage, assistant_queries**: operations, cost monitoring and the user's own question history.

Schema: `src/db/schema.ts`. Migrations: `drizzle/`.

## Data flows

**Search / entry page.** Visitor → `searchEntries` (published only unless a reviewer asks for drafts) → FTS + trigram ranking → cards. The entry page loads claims → citations → sources and shows excerpts and retrieval method.

**Research.** Gap scan (daily via worker, or manual) ranks weak entries → `research.entry` jobs → candidate URLs (reviewer-supplied first, then the search API if configured) → `fetchDocument` (https only, DNS-resolved private IPs refused, robots.txt, 12 s timeout, 2 MB cap, redirects re-validated) or reviewer-pasted text → sources upserted → extraction (LLM with quote validation, else excerpt extraction) → duplicate check against all names and aliases → conflict check (differing twist counts) → draft with status → reviewer decision → claims applied transactionally with a new revision.

**Assistant.** Signed-in user → rate limit → safety classifier (instructions / readiness) → retrieval (name/alias mention, then FTS OR-query) → if nothing matches, "no match" with no model call → else the model gets the records with claim keys `C1..Cn` → output validation (unknown keys stripped; paragraphs without valid keys dropped) → stored in the user's history. On any model failure, or without a key: retrieval-only answer from the stored claims.

**Video.** Browser `POST /api/videos` (same-origin check) → streamed to storage while hashing and size-checking, magic-byte sniff → row with status `processing` → `video.probe` job (ffprobe) → `ready` or `failed` with a message. Playback goes through `/api/videos/:id/stream`, which runs the same visibility check as the page and supports HTTP ranges. Files are never served from a public path.

## External services and what crosses the boundary

| Service | Data sent | When |
| --- | --- | --- |
| Anthropic API (optional) | Assistant: the question + published Trick Book records. Research: fetched public page text. Never private notes, emails or videos. | Only if `ANTHROPIC_API_KEY` is set, within `LLM_DAILY_TOKEN_BUDGET` |
| Brave / Tavily search (optional) | Research queries built from public entry names | Only if `SEARCH_PROVIDER` + `SEARCH_API_KEY` are set |
| Public websites | HTTP GET with an identifying user agent | Research jobs, robots.txt respected |
| Video model endpoint (optional) | The video file, only when its owner requests skill recognition | Only if `VIDEO_MODEL_ENDPOINT` is set |

## Security measures

- Passwords: scrypt (N=16384) with per-user salt. Sessions: 256-bit random tokens; only SHA-256 hashes are stored; `HttpOnly`, `SameSite=Lax`, `Secure` when the origin is https.
- Authorization inside services (`assertRole`, owner checks in queries). Private things return 404, not 403, where existence itself is sensitive.
- CSRF: server actions use Next's origin check; the upload route checks `Origin`.
- Input validation with zod on every write. React escaping everywhere (no raw HTML rendering). Source URLs are restricted to http(s).
- Rate limits in Postgres: sign-in (per IP and per email), sign-up, posting, comments, reports, uploads, analysis, assistant and suggestions.
- SSRF guard and robots.txt in the research fetcher. Upload type sniffing and size limit while streaming. Storage keys are generated server-side and validated against traversal.
- Security headers: `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`.
- No secrets in client bundles; `src/lib/env.ts` is only imported by server modules.
