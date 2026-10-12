# Project status

_Last updated: 2026-10-12. Read this first when resuming work._

## Summary

A working first version of the whole platform: a Trick Book with per-statement citations and evidence labels, personal collections and private notes, a research agent with a review queue, a grounded assistant, a private video library with an extensible analysis boundary, community features with moderation, and staff tooling. The core flows are covered by integration tests (158) and browser end-to-end tests (21), all passing at the time of writing.

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
| Profile & privacy settings UI | verified_against_criteria | `e2e/forms.spec.ts`: saved values persist after reload and selects keep the new value immediately after saving (regression for a React 19 form-reset bug). |
| Data export & account deletion | tested_with_limitations | Export: e2e downloads JSON without secrets. Deletion: service tests (removes rows, video files and posters, needs the password); the delete button is not e2e-tested. |
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
| Admin user management (roles, suspension) | verified_against_criteria | Service tests (admin-only, no self-changes, reversible suspension, handle search with `_`). e2e: an admin promotes a member, who then gets into Studio. The suspend button itself is not e2e-tested. |
| Entry editor (create, edit, claims, relations, publish) | verified_against_criteria | e2e: create a draft, publishing is refused without a sourced claim, add a claim with a new source while unsaved text edits are kept, save with no false conflict, publish, then check the public page. The relations form is covered by service tests only. |
| Password change | verified_against_criteria | Service test and e2e: the current password is required, other sessions are revoked, this browser stays signed in, and the new password works. |
| Content-Security-Policy | verified_against_criteria | Per-request nonce via `src/proxy.ts`. e2e checks the header and that client navigation works with no CSP violations; the full suite passes with the policy on. |
| Video poster images | verified_against_criteria | ffmpeg extracts a JPEG frame during processing, served with the same access check as the video and deleted with it (`video.test.ts`). |
| 3D skill animations | verified_against_criteria | `src/animation/`: physics-based motion for 21 Trick Book skills, 33 more studio skills (doubles, triples and twisters such as full in back out, rudy out, triple full and triffis half out, marked as not yet in the Trick Book) and 5 linking moves, FIG notation player and combination builder, WebM export. A 14-segment body (de Leva 1996 masses, 55 kg, 1.65 m) gives the inertia tensor for every shape; in the air the CoM is ballistic (g = 9.81 m/s²) and somersault angular momentum is conserved (ω = H/I), with twist rate following the long-axis inertia; the bed is a simulated spring/damper (depression, contact time, static sag). Shapes are held through multiple somersaults, with a twist "in" done early and a twist "out" as the shape opens. The default camera is a phone held by a spectator in a gym hall (pan, zoom, slight sway; steady under reduced motion). Each animation shows a physics table. `tests/animation.test.ts`: every spec lands in its stated pose with the right twist total and matches the entry's stored counts; CoM acceleration in flight is −g; I·ω stays constant while the shape changes; no body part goes below the (sunken) bed; combinations are continuous; bed depression and flight time stay in plausible ranges. `e2e/animation.spec.ts`: rendering, phases, notation, combinations and a recorded WebM. Body shape over time is prescribed, not motion capture; shapes not given by sources are labelled. |
| Background worker & daily gap scan | verified_against_criteria | Ran `npm run worker`: it scheduled the scan and processed jobs. Without a search provider the scan lists gaps and queues nothing (test). |
| Responsive layout, no horizontal overflow | verified_against_criteria | `e2e/visual.spec.ts` checks 18 pages at desktop and Pixel 7 sizes; screenshots were inspected manually, including dark mode. |

## Seed content provenance

34 published entries and 2 unsourced drafts (`Back somersault`, `Front somersault`) from 14 sources. All claims were checked against **search-engine excerpts** on 2026-10-12, because the full pages could not be fetched from the build environment. Paraphrased excerpts are prefixed "Search summary:". **No entry is marked verified.** Two entries (Adolph, Corkscrew) are marked conflicting because their sources disagree. A reviewer should read the primary sources (especially the FIG Code of Points PDF) in full before upgrading anything to `verified`.

## Known limitations and bugs

- 3D animations use real mechanics (gravity, bed spring, conservation of angular momentum) but a prescribed body shape over time, typical flight times rather than measurements, and no air resistance, twist–somersault coupling or travel across the bed. They describe what a skill is, never how to learn it; the kaboom's heel rebound and arm technique are not modelled.

- No password reset or email verification (no email service is configured). Password change while signed in is supported.
- Local-disk video storage only, so it needs a persistent volume. Serverless hosting requires an S3 `BlobStorage` implementation.
- Videos are not transcoded. Codecs browsers can't play (e.g. HEVC) are flagged with a warning on the video page, but not converted.
- Rate limiting keys on the last `X-Forwarded-For` entry, so it relies on a correctly configured reverse proxy.
- The assistant is single-turn (no follow-up context). Retrieval-only answers repeat stored wording verbatim.
- Conflict detection compares twist and somersault counts. Other contradictions (e.g. landing position) rely on reviewers.
- Fetched text and LLM output are treated as untrusted, but a prompt-injection attempt inside a fetched page could still distort an LLM draft. Quote validation and human review are the safeguards.
- The CSP allows inline *styles* (`style-src 'unsafe-inline'`) for a few style attributes; scripts are nonce-only.

## Current priorities

1. Have a reviewer verify the seed content against primary sources and fill the two unsourced drafts.
2. Configure a search API and an Anthropic key in a staging environment. Run `npm run eval:assistant` and a few research jobs in model mode, and record cost and latency.
3. Choose an email provider and add password reset and email verification.

## Environment variables (names only)

`DATABASE_URL` (required), `APP_ORIGIN`, `STORAGE_DIR`, `VIDEO_MAX_BYTES`, `SIGNUP_RATE_LIMIT_PER_HOUR`, `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`, `LLM_DAILY_TOKEN_BUDGET`, `SEARCH_PROVIDER`, `SEARCH_API_KEY`, `RESEARCH_ALLOWED_DOMAINS`, `VIDEO_MODEL_ENDPOINT`, `VIDEO_MODEL_API_KEY`. Tests: `TEST_DATABASE_URL`, `PLAYWRIGHT_CHROMIUM_PATH`.

## Commands

`npm run dev` · `npm run worker` · `npm run db:migrate` · `npm run db:seed` · `npm test` · `npm run test:e2e` · `npm run eval:assistant` · `npm run typecheck` · `npm run lint` · `npm run make-admin -- <email>`

## Test results at last run

- `npm run typecheck`, `npm run lint`: clean.
- `npm test`: 9 files, 158 tests passed.
- `npx playwright test` (after `next build`): 21 passed (desktop + mobile visual).
- `npm run eval:assistant` (retrieval-only): 13/13.
