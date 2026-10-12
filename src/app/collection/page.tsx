import type { Metadata } from "next";
import Link from "next/link";
import { Badge, COLLECTION_META, Container, EmptyState, EvidenceBadge, LinkButton, Notice, PageHeader, RotationGlyph } from "@/components/ui";
import { cn } from "@/lib/cn";
import { requireActor } from "@/server/auth/current";
import { collectionSummary, listCollection, COLLECTION_STATUSES, type CollectionStatus } from "@/server/me/collection";
import { CollectionControls } from "../tricks/entry-client";

export const metadata: Metadata = { title: "My collection" };

export default async function CollectionPage({ searchParams }: { searchParams: Promise<{ status?: string; q?: string; welcome?: string }> }) {
  const actor = await requireActor("/collection");
  const sp = await searchParams;
  const status = COLLECTION_STATUSES.includes(sp.status as CollectionStatus) ? (sp.status as CollectionStatus) : undefined;
  const q = typeof sp.q === "string" ? sp.q.slice(0, 80) : "";
  const [items, counts] = await Promise.all([listCollection(actor, actor.id, { status, q }), collectionSummary(actor.id)]);
  const total = counts.saved + counts.working_on + counts.landed;
  const tab = (s?: CollectionStatus) => `/collection${s ? `?status=${s}` : ""}`;

  return (
    <Container>
      <PageHeader
        eyebrow="Personal"
        title="My collection"
        description="Skills you've saved, are working on or have landed. Private unless you change it in settings."
        actions={<LinkButton href="/progress" variant="secondary">Progress history</LinkButton>}
      />
      {sp.welcome && (
        <div className="mt-6">
          <Notice tone="ok" title="Your account is ready">
            Open any entry in the <Link href="/tricks" className="underline">Trick Book</Link> and save it to start your collection.
          </Notice>
        </div>
      )}
      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <nav aria-label="Filter by status" className="flex gap-1 overflow-x-auto">
          {[undefined, ...COLLECTION_STATUSES].map((s) => {
            const active = s === status;
            return (
              <Link
                key={s ?? "all"}
                href={tab(s)}
                aria-current={active ? "page" : undefined}
                className={cn("whitespace-nowrap rounded-full px-3 py-1.5 text-sm", active ? "bg-ink text-bg" : "bg-surface-2 text-ink-2 hover:bg-line")}
              >
                {s ? COLLECTION_META[s]!.label : "All"} <span className="opacity-70">{s ? counts[s] : total}</span>
              </Link>
            );
          })}
        </nav>
        <form action="/collection" role="search" className="flex gap-2">
          {status && <input type="hidden" name="status" value={status} />}
          <label htmlFor="cq" className="sr-only">Search my collection</label>
          <input id="cq" name="q" defaultValue={q} placeholder="Search my collection" className="h-9 w-full rounded-[var(--radius-control)] border border-line-strong bg-surface px-3 text-sm sm:w-56" />
        </form>
      </div>

      {items.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            title={total === 0 ? "Your collection is empty" : "Nothing matches"}
            action={<LinkButton href="/tricks">Browse the Trick Book</LinkButton>}
          >
            {total === 0 ? "Save skills from any Trick Book entry to track what you're learning." : "Try another filter or search term."}
          </EmptyState>
        </div>
      ) : (
        <ul className="mt-6 flex flex-col gap-3">
          {items.map((i) => (
            <li key={i.entryId} className="flex flex-col gap-3 rounded-[var(--radius-card)] border border-line bg-surface p-4 sm:flex-row sm:items-center">
              <div className="flex min-w-0 flex-1 items-start gap-3">
                <RotationGlyph quarters={i.quarterRotations} halfTwists={i.halfTwists} />
                <div className="min-w-0">
                  <Link href={`/tricks/${i.slug}`} className="font-semibold hover:text-accent">
                    {i.name}
                  </Link>
                  <p className="line-clamp-1 text-sm text-ink-2">{i.summary}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    <EvidenceBadge status={i.evidenceStatus} />
                    {i.categoryName && <Badge>{i.categoryName}</Badge>}
                    <span className="text-xs text-muted">{i.logCount} private notes</span>
                  </div>
                </div>
              </div>
              <CollectionControls entryId={i.entryId} status={i.status} />
            </li>
          ))}
        </ul>
      )}
    </Container>
  );
}
