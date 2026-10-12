# Trampolin

A source-checked trampoline Trick Book with personal progress tracking, a grounded assistant, a research agent with a human review queue, a private video library and a small community.

Every Trick Book entry shows **where each statement comes from** and **how far the sources can be trusted** (verified, limited evidence, community, AI draft, or conflicting). Nothing machine-generated reaches the Trick Book without a reviewer approving it.

- Status, verification results and known limitations: [`PROJECT_STATUS.md`](PROJECT_STATUS.md)
- Architecture, data model and data flows: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
- Deployment: [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md)
- Video-analysis model contract: [`docs/VIDEO_ANALYSIS.md`](docs/VIDEO_ANALYSIS.md)

## Static demo (GitHub Pages)

`npm run build:static-demo` exports the published Trick Book from the database into `static-demo-dist/`: a read-only site with search, entry pages with 3D animations, the animation studio, explore, a browser-local collection and the assistant in retrieval-only mode. `.github/workflows/pages.yml` builds it from a freshly seeded database and deploys it to GitHub Pages on every push to the default branch. Enable it once under **Settings → Pages → Source: GitHub Actions**.

## 3D animations

`src/animation/` animates skills from their rotation and twist data (Three.js): each Trick Book skill with a motion model gets an animation on its page, and `/animate` adds a FIG notation player (e.g. `822o`, a tucked double with a full twist in each somersault) and a combination builder that only allows skills starting where the previous one landed. Playback has phase-by-phase steps, slow motion, camera angles and WebM export. The animations show what a skill is, not how to learn it.

## Stack

Next.js 16 (App Router, server actions) · React 19 · TypeScript · Tailwind CSS 4 · PostgreSQL 16 (`pg_trgm`, `citext`) via Drizzle ORM · Vitest · Playwright · ffprobe. Optional: Anthropic API (assistant wording, research extraction), Brave or Tavily search API (research agent), an external video model over HTTP.

## Run locally

Requirements: Node.js ≥ 22, PostgreSQL ≥ 14 with the `pg_trgm` and `citext` extensions available, and `ffmpeg`/`ffprobe` on the PATH.

```bash
npm install
cp .env.example .env              # set DATABASE_URL; everything else is optional

# create the database (once)
createdb trampolin_dev

npm run db:migrate                # apply migrations (creates the extensions if permitted)
npm run db:seed                   # categories, sources and the starting Trick Book
npm run dev                       # http://localhost:3000
npm run worker                    # optional in dev: background jobs + daily research gap scan
```

Sign up in the browser, then give yourself staff access:

```bash
npm run make-admin -- you@example.com           # or: ... you@example.com reviewer
```

Uploads and admin "Process queue now" also process jobs in-process, so the app works in development without the worker.

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` / `build` / `start` | Next.js development server, production build, production server |
| `npm run worker` | Background job worker (research jobs, video probing/analysis, daily gap scan) |
| `npm run db:migrate` / `db:seed` / `db:reset` | Apply migrations / seed / drop and re-migrate (refuses in production) |
| `npm run db:generate` | Generate a migration after changing `src/db/schema.ts` |
| `npm run make-admin -- <email> [reviewer\|admin]` | Promote a user |
| `npm run typecheck` / `lint` | TypeScript and ESLint |
| `npm test` | Integration tests (needs the `trampolin_test` database, see below) |
| `npm run test:e2e` | Production build + Playwright browser tests (needs `trampolin_e2e`) |
| `npm run eval:assistant` | Runs the assistant evaluation set against the configured database |

### Test databases

```bash
createdb -O trampolin trampolin_test
createdb -O trampolin trampolin_e2e
# in each: CREATE EXTENSION pg_trgm; CREATE EXTENSION citext;   (if your role cannot create extensions)
```

Tests reset these databases. Override the URLs with `TEST_DATABASE_URL`. Playwright uses the bundled Chromium, or `PLAYWRIGHT_CHROMIUM_PATH` if set.

## Environment variables

See [`.env.example`](.env.example). Only `DATABASE_URL` is required. Without the optional keys, the assistant runs in **retrieval-only mode**, the research agent uses **reviewer-supplied sources only**, and video **skill recognition is reported as unavailable**. The UI says so; nothing is simulated.
