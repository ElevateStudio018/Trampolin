import Link from "next/link";
import { Card, Container, EvidenceBadge, LinkButton, SectionTitle, COLLECTION_META, formatDate } from "@/components/ui";
import { getActor } from "@/server/auth/current";
import { kbStats, listCategories } from "@/server/kb/entries";
import { collectionSummary, listCollection, listProgressLogs } from "@/server/me/collection";
import { listFeed } from "@/server/community/service";

function SearchHero() {
  return (
    <form role="search" action="/tricks" className="flex w-full max-w-xl gap-2">
      <label htmlFor="home-q" className="sr-only">
        Search the Trick Book
      </label>
      <input
        id="home-q"
        name="q"
        type="search"
        placeholder="Search a skill — barani, rudy, ball out…"
        className="h-12 min-w-0 flex-1 rounded-[var(--radius-control)] border border-line-strong bg-surface px-4 text-[15px] focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25"
      />
      <button className="h-12 rounded-[var(--radius-control)] bg-accent px-5 font-medium text-accent-ink hover:opacity-90">Search</button>
    </form>
  );
}

export default async function Home() {
  const actor = await getActor();
  const [stats, categories] = await Promise.all([kbStats(), listCategories(actor)]);
  const published = Object.values(stats.byStatus).reduce((a, b) => a + (b ?? 0), 0);

  const personal = actor
    ? await Promise.all([collectionSummary(actor.id), listCollection(actor, actor.id, { status: "working_on" }), listProgressLogs(actor, { limit: 4 }), listFeed(actor, { limit: 3 })])
    : null;

  return (
    <>
      <section className="border-b border-line bg-surface">
        <Container className="flex flex-col gap-6 py-10 sm:py-14">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-pad">{actor ? `Welcome back, ${actor.displayName}` : "Trampoline trick book"}</p>
          <h1 className="max-w-3xl text-3xl font-semibold leading-tight tracking-tight sm:text-[2.6rem]">
            Every skill, every name it goes by, and exactly where the information comes from.
          </h1>
          <SearchHero />
          <dl className="flex flex-wrap gap-x-8 gap-y-3 text-sm">
            <div>
              <dt className="text-muted">Published entries</dt>
              <dd className="text-xl font-semibold">{published}</dd>
            </div>
            <div>
              <dt className="text-muted">Cited sources</dt>
              <dd className="text-xl font-semibold">{stats.sources}</dd>
            </div>
            <div>
              <dt className="text-muted">Verified against a primary source</dt>
              <dd className="text-xl font-semibold">{stats.byStatus.verified ?? 0}</dd>
            </div>
            <div>
              <dt className="text-muted">With conflicting sources</dt>
              <dd className="text-xl font-semibold">{stats.byStatus.conflicting ?? 0}</dd>
            </div>
          </dl>
        </Container>
      </section>

      <Container className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex min-w-0 flex-col gap-8">
          {personal && (
            <section aria-labelledby="working-on">
              <SectionTitle id="working-on" action={<Link href="/collection" className="text-sm text-accent hover:underline">Collection</Link>}>
                Working on
              </SectionTitle>
              {personal[1].length === 0 ? (
                <Card className="p-5 text-sm text-ink-2">
                  Nothing marked as “working on” yet. Open any entry and set its status to keep track.
                </Card>
              ) : (
                <ul className="grid gap-2 sm:grid-cols-2">
                  {personal[1].slice(0, 6).map((i) => (
                    <li key={i.entryId}>
                      <Link href={`/tricks/${i.slug}`} className="flex items-center justify-between rounded-[var(--radius-control)] border border-line bg-surface px-4 py-3 hover:border-line-strong">
                        <span className="font-medium">{i.name}</span>
                        <span className="text-xs text-muted">{i.logCount} notes</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          <section aria-labelledby="browse">
            <SectionTitle id="browse" action={<Link href="/explore" className="text-sm text-accent hover:underline">Explore</Link>}>
              Browse by category
            </SectionTitle>
            <ul className="grid gap-3 sm:grid-cols-2">
              {categories.map((c) => (
                <li key={c.slug}>
                  <Link href={`/tricks?category=${c.slug}`} className="flex h-full flex-col rounded-[var(--radius-card)] border border-line bg-surface p-4 hover:border-line-strong">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="font-semibold">{c.name}</span>
                      <span className="text-sm text-muted">{c.count}</span>
                    </span>
                    <span className="mt-1 text-sm text-ink-2">{c.description}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>

          <section aria-labelledby="how" className="rounded-[var(--radius-card)] border border-line bg-surface p-5">
            <h2 id="how" className="font-semibold">How to read an entry</h2>
            <p className="mt-1 text-sm text-ink-2">Each entry carries an evidence label, and every statement links to the excerpt that supports it.</p>
            <ul className="mt-3 flex flex-wrap gap-2">
              {["verified", "limited_evidence", "conflicting", "community", "ai_draft"].map((s) => (
                <li key={s}>
                  <EvidenceBadge status={s} />
                </li>
              ))}
            </ul>
            <Link href="/about" className="mt-3 inline-block text-sm text-accent hover:underline">
              About the data →
            </Link>
          </section>
        </div>

        <aside className="flex flex-col gap-6">
          {personal ? (
            <>
              <Card className="p-5">
                <h2 className="font-semibold">Your collection</h2>
                <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
                  {(["saved", "working_on", "landed"] as const).map((k) => (
                    <div key={k} className="rounded-[var(--radius-control)] bg-surface-2 px-2 py-3">
                      <dd className="text-xl font-semibold">{personal[0][k]}</dd>
                      <dt className="text-xs text-muted">{COLLECTION_META[k]!.label}</dt>
                    </div>
                  ))}
                </dl>
              </Card>
              <Card className="p-5">
                <SectionTitle action={<Link href="/progress" className="text-sm text-accent hover:underline">All</Link>}>Recent notes</SectionTitle>
                {personal[2].length === 0 ? (
                  <p className="text-sm text-muted">No notes yet.</p>
                ) : (
                  <ul className="flex flex-col gap-2 text-sm">
                    {personal[2].map((l) => (
                      <li key={l.id}>
                        <span className="font-medium">{l.title}</span>
                        <span className="block text-xs text-muted">
                          {formatDate(l.occurredOn)}
                          {l.entryName && ` · ${l.entryName}`}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
              <Card className="p-5">
                <SectionTitle action={<Link href="/community" className="text-sm text-accent hover:underline">Feed</Link>}>Community</SectionTitle>
                {personal[3].items.length === 0 ? (
                  <p className="text-sm text-muted">No posts yet.</p>
                ) : (
                  <ul className="flex flex-col gap-3 text-sm">
                    {personal[3].items.map((p) => (
                      <li key={p.id}>
                        <Link href={`/community/${p.id}`} className="line-clamp-2 hover:text-accent">
                          {p.body}
                        </Link>
                        <span className="text-xs text-muted">@{p.authorHandle}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </>
          ) : (
            <Card className="p-5">
              <h2 className="font-semibold">Track your own progress</h2>
              <p className="mt-1 text-sm text-ink-2">Save skills, keep private training notes, store your videos and ask the assistant questions grounded in the Trick Book.</p>
              <div className="mt-4 flex gap-2">
                <LinkButton href="/signup">Create account</LinkButton>
                <LinkButton href="/login" variant="secondary">
                  Sign in
                </LinkButton>
              </div>
            </Card>
          )}
          <Card className="p-5">
            <h2 className="font-semibold">3D animations</h2>
            <p className="mt-1 text-sm text-ink-2">See each skill in 3D, phase by phase, including twisting doubles and combinations.</p>
            <LinkButton href="/animate" variant="secondary" size="sm" className="mt-3">
              Open animations
            </LinkButton>
          </Card>
          <Card className="p-5">
            <h2 className="font-semibold">Ask the assistant</h2>
            <p className="mt-1 text-sm text-ink-2">Questions are answered only from Trick Book records, with citations. It says so when the records don&apos;t cover something.</p>
            <LinkButton href="/assistant" variant="secondary" size="sm" className="mt-3">
              Open assistant
            </LinkButton>
          </Card>
        </aside>
      </Container>
    </>
  );
}
