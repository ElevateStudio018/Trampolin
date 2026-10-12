# Project status

_Last updated: 2026-10-12. Read this first when resuming work._

## Summary

A working first version of the whole platform: a Trick Book with per-statement citations and evidence labels, personal collections and private notes, a research agent with a review queue, a grounded assistant, a private video library with an extensible analysis boundary, community features with moderation, and staff tooling. The core flows are covered by integration tests (82) and browser end-to-end tests (14), all passing at the time of writing.

Stack and layout: see [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md). Setup: [`README.md`](README.md). Deployment: [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).

## Feature status

Status values: `verified_against_criteria` · `tested_with_limitations` · `implemented_not_tested` · `blocked_by_external_dependency` · `not_implemented`.

| Feature | Status | Acceptance criteria and evidence |
| --- | --- | --- |
| Trick Book search & filters | verified_against_criteria | Typos ("rudi", "baranni"), aliases ("BBO", "rudy"), category/evidence filters, pagination and the empty state are covered by `tests/kb.test.ts` and `e2e/trickbook.spec.ts`. |
| Entry pages (claims, excerpts, sources, revisions, related, distinctions) | verified_against_criteria | e2e opens Rudolph, expands an excerpt and checks the source link. Alias URLs redirect with 308, unknown slugs return 404. |
| Duplicate detection & normalisation | verified_against_criteria | Exact alias clashes are rejected; near matches ("Rudolf") are flagged (`kb.test.ts`, `research.test.ts`). |
| Publishing rules & revision history | verified_against_criteria | AI drafts can't be published, publishing needs a sourced claim, stale edits are rejected, and each change writes a revision (`kb.test.ts`). |
| Accounts, sessions, roles, rate limits | verified_against_criteria | `auth.test.ts`: hashed tokens, suspension, a curator account that can't sign in, duplicate handling. e2e: sign-up/in/out, and `/studio` is forbidden to members. |
| Personal collection | verified_against_criteria | Saved state survives reload (e2e). Other users get Forbidden for private collections. Visibility settings are honoured (`collection.test.ts`). |
| Progress history & private notes | verified_against_criteria | Owner-only reads and deletes; future dates rejected; another member cannot see the notes (e2e). |
| Profile & privacy settings UI | tested_with_limitations | Visibility logic is tested at service level and the settings page renders (visual test). Saving the form in a browser is not e2e-tested. |
| Data export & account deletion | tested_with_limitations | Service tests: the export excludes secrets and storage paths; deletion removes rows and video files and needs the password. UI buttons not e2e-tested. |
| Research agent: pipeline with reviewer-supplied / pasted sources | verified_against_criteria | Verbatim excerpts, near-duplicate merging, conflict detection, idempotent jobs and drafts, blocked status when there are no sources, approval imports only ticked supported claims without publishing (`research.test.ts`, e2e). |
| Research agent: automatic web search | blocked_by_external_dependency | Brave/Tavily adapters exist but no API key was available; never called for real. |
| Research agent: page fetching | tested_with_limitations | SSRF guard, robots.txt and HTML parsing are unit-tested. A manual fetch of nodejs.org worked. Trampoline sites are not reachable from the build sandbox (DNS blocked). |
| Research agent: LLM extraction | implemented_not_tested | The quote-validation code path has not run against a real model (no API key). The excerpt extractor is the tested fallback. |
| Review queue & reviewer decisions | verified_against_criteria | Members can't review; double review is rejected; claims without a source can't be approved; duplicates must merge or be justified (tests + e2e). |
| Community suggestions → review queue | verified_against_criteria | `research.test.ts`: sourced suggestions start `pending_review`, unsourced ones `needs_more_sources`. |
| Assistant, retrieval-only mode | verified_against_criteria | 13-case eval set passes (`npm run eval:assistant`, `assistant.test.ts`). Every citation resolves to a real source; off-topic questions return `no_match`; coaching and readiness questions get the safety notice (e2e). |
| Assistant, language-model mode | tested_with_limitations | Output validation (fabricated keys stripped, uncited paragraphs dropped, fallback when budget is exceeded) is tested with a mocked model. The real API has never been called. |
| LLM cost controls | tested_with_limitations | The daily token budget and per-call usage log are implemented; the budget-exceeded path is tested via mock. Usage table in Studio. |
| Video upload, validation, storage, streaming, access control | verified_against_criteria | Magic-byte sniffing, size limit, empty/corrupt files, ffprobe metadata, range streaming (206), 404 for other users, cross-origin rejection, deletion removes the file (`video.test.ts`, `video.spec.ts`). |
| Video technical-metadata analyzer | verified_against_criteria | Real ffprobe output stored with limitations. |
| Video skill recognition | blocked_by_external_dependency | No model exists. The analyzer reports itself unavailable; contract and evaluation requirements are in `docs/VIDEO_ANALYSIS.md`. |
| Community posts, likes, comments | verified_against_criteria | Visibility (members vs public) for visitors, like toggling, and no commenting on hidden posts (`community.test.ts`, e2e posting). |
| Bookmarks | verified_against_criteria | Toggle and list covered in `community.test.ts`. |
| Reports & moderation | verified_against_criteria | Duplicate reports absorbed, admin-only resolution, hiding removes content for others (tests + e2e). |
| Admin user management (roles, suspension) | tested_with_limitations | Service tests: admin-only, no self-changes, suspension blocks sign-in and is reversible. The UI buttons are not e2e-tested. |
| Entry editor (create, edit, claims, relations, publish) | tested_with_limitations | All service functions are tested; the editor UI renders, but its forms are not e2e-tested. |
| Background worker & daily gap scan | verified_against_criteria | Ran `npm run worker`: it scheduled the scan and processed jobs. Without a search provider the scan lists gaps and queues nothing (test). |
| Responsive layout, no horizontal overflow | verified_against_criteria | `e2e/visual.spec.ts` checks 18 pages at desktop and Pixel 7 sizes; screenshots were inspected manually, including dark mode. |

## Seed content provenance

34 published entries and 2 unsourced drafts (`Back somersault`, `Front somersault`) from 14 sources. All claims were checked against **search-engine excerpts** on 2026-10-12, because the full pages could not be fetched from the build environment. Paraphrased excerpts are prefixed "Search summary:". **No entry is marked verified.** Two entries (Adolph, Corkscrew) are marked conflicting because their sources disagree. A reviewer should read the primary sources (especially the FIG Code of Points PDF) in full before upgrading anything to `verified`.

## Known limitations and bugs

- No password reset or email verification (no email service is configured). No password change UI.
- Local-disk video storage only, so it needs a persistent volume. Serverless hosting requires an S3 `BlobStorage` implementation.
- Videos are served as uploaded: no transcoding or thumbnails. Some MOV/HEVC files will not play in every browser.
- Rate limiting keys on the last `X-Forwarded-For` entry, so it relies on a correctly configured reverse proxy.
- The assistant is single-turn (no follow-up context). Retrieval-only answers repeat stored wording verbatim.
- Conflict detection only compares twist counts. Other contradictions rely on reviewers.
- Fetched text and LLM output are treated as untrusted, but a prompt-injection attempt inside a fetched page could still distort an LLM draft. Quote validation and human review are the safeguards.
- No Content-Security-Policy header yet (would need nonces for Next.js inline scripts).
- Server-side form errors echo values, but the entry editor loses unsaved edits when a claim is added on the same page (it reloads at the new revision).

## Current priorities

1. Have a reviewer verify the seed content against primary sources and fill the two unsourced drafts.
2. Configure a search API and an Anthropic key in a staging environment. Run `npm run eval:assistant` and a few research jobs in model mode, and record cost and latency.
3. Add e2e coverage for the settings, entry-editor and admin forms; add password reset once an email provider is chosen.

## Environment variables (names only)

`DATABASE_URL` (required), `APP_ORIGIN`, `STORAGE_DIR`, `VIDEO_MAX_BYTES`, `SIGNUP_RATE_LIMIT_PER_HOUR`, `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`, `LLM_DAILY_TOKEN_BUDGET`, `SEARCH_PROVIDER`, `SEARCH_API_KEY`, `RESEARCH_ALLOWED_DOMAINS`, `VIDEO_MODEL_ENDPOINT`, `VIDEO_MODEL_API_KEY`. Tests: `TEST_DATABASE_URL`, `PLAYWRIGHT_CHROMIUM_PATH`.

## Commands

`npm run dev` · `npm run worker` · `npm run db:migrate` · `npm run db:seed` · `npm test` · `npm run test:e2e` · `npm run eval:assistant` · `npm run typecheck` · `npm run lint` · `npm run make-admin -- <email>`

## Test results at last run

- `npm run typecheck`, `npm run lint`: clean.
- `npm test`: 8 files, 82 tests passed.
- `npx playwright test` (after `next build`): 14 passed (desktop + mobile visual).
- `npm run eval:assistant` (retrieval-only): 13/13.
