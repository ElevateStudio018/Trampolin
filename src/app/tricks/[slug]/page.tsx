import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import {
  Badge,
  Card,
  Container,
  EVIDENCE_META,
  EvidenceBadge,
  LinkButton,
  RotationGlyph,
  SectionTitle,
  formatDate,
  rotationLabel,
} from "@/components/ui";
import { getActor } from "@/server/auth/current";
import { hasRole } from "@/server/actor";
import { findSlugByAlias, getEntryBySlug, relatedEntries } from "@/server/kb/entries";
import { collectionStatusFor, listProgressLogs } from "@/server/me/collection";
import { listMyVideos } from "@/server/video/service";
import { CollectionControls, NoteForm, SuggestForm } from "../entry-client";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const entry = await getEntryBySlug(slug, null);
  return entry ? { title: entry.canonicalName, description: entry.summary } : { title: "Not found" };
}

const RELATION_LABEL: Record<string, string> = {
  related: "Related",
  variant_of: "Variant",
  distinct_from: "Not to be confused with",
  component_of: "Part of",
};

const CLAIM_STATUS: Record<string, { label: string; tone: "ok" | "warn" | "danger" | "neutral" }> = {
  supported: { label: "Supported", tone: "ok" },
  limited: { label: "Limited support", tone: "warn" },
  disputed: { label: "Disputed", tone: "danger" },
  unsupported: { label: "Unsupported", tone: "neutral" },
};

export default async function EntryPage({ params }: Props) {
  const { slug } = await params;
  const actor = await getActor();
  const entry = await getEntryBySlug(slug, actor);
  if (!entry) {
    const canonical = await findSlugByAlias(slug);
    if (canonical && canonical !== slug) permanentRedirect(`/tricks/${canonical}`);
    notFound();
  }
  const [related, status, logs, myVideos] = await Promise.all([
    relatedEntries(entry.id),
    collectionStatusFor(actor, entry.id),
    actor ? listProgressLogs(actor, { entryId: entry.id, limit: 20 }) : Promise.resolve([]),
    actor ? listMyVideos(actor) : Promise.resolve([]),
  ]);
  const isReviewer = hasRole(actor, "reviewer");
  const rot = rotationLabel(entry.quarterRotations, entry.halfTwists);
  const distinctions = entry.relations.filter((r) => r.kind === "distinct_from");
  const otherRelations = entry.relations.filter((r) => r.kind !== "distinct_from");
  const sourceIndex = new Map(entry.sources.map((s, i) => [s.sourceId, i + 1]));

  return (
    <Container className="pb-8">
      <nav aria-label="Breadcrumb" className="pt-6 text-sm text-muted">
        <Link href="/tricks" className="hover:text-ink">
          Trick Book
        </Link>
        {entry.categoryName && (
          <>
            {" / "}
            <Link href={`/tricks?category=${entry.categorySlug}`} className="hover:text-ink">
              {entry.categoryName}
            </Link>
          </>
        )}
      </nav>

      <header className="mt-3 flex flex-col gap-5 border-b border-line pb-6 md:flex-row md:items-start md:justify-between">
        <div className="flex min-w-0 gap-4">
          <RotationGlyph quarters={entry.quarterRotations} halfTwists={entry.halfTwists} size={56} />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-3xl font-semibold tracking-tight">{entry.canonicalName}</h1>
              {entry.state !== "published" && <Badge tone="warn">{entry.state}</Badge>}
            </div>
            {entry.aliases.length > 0 && (
              <p className="mt-1 text-sm text-muted">
                Also called: <span className="text-ink-2">{entry.aliases.map((a) => a.alias).join(", ")}</span>
              </p>
            )}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <EvidenceBadge status={entry.evidenceStatus} />
              {entry.figNotation && (
                <Badge tone="accent" title="FIG numeric notation">
                  <span className="font-mono">{entry.figNotation}</span>
                </Badge>
              )}
              {rot && <Badge>{rot}</Badge>}
              {entry.position && entry.position !== "none" && <Badge>{entry.position === "any" ? "any position" : entry.position}</Badge>}
            </div>
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-start gap-2 md:items-end">
          {actor ? (
            <CollectionControls entryId={entry.id} status={status} />
          ) : (
            <LinkButton href={`/login?next=/tricks/${entry.slug}`} variant="secondary" size="sm">
              Sign in to save
            </LinkButton>
          )}
          {isReviewer && (
            <LinkButton href={`/studio/entries/${entry.id}`} variant="ghost" size="sm">
              Edit entry
            </LinkButton>
          )}
        </div>
      </header>

      <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex min-w-0 flex-col gap-8">
          <section aria-labelledby="summary">
            <h2 id="summary" className="sr-only">
              Summary
            </h2>
            <p className="text-lg leading-relaxed text-ink">{entry.summary}</p>
            {entry.body && <div className="prose-tb mt-3 whitespace-pre-line text-[15px]">{entry.body}</div>}
            <p className="mt-3 text-sm text-muted">{EVIDENCE_META[entry.evidenceStatus]?.help}</p>
          </section>

          {distinctions.length > 0 && (
            <section aria-labelledby="distinctions">
              <SectionTitle id="distinctions">Not to be confused with</SectionTitle>
              <ul className="flex flex-col gap-2">
                {distinctions.map((r) => (
                  <li key={r.slug} className="rounded-[var(--radius-control)] border border-line bg-surface px-4 py-3 text-sm">
                    <Link href={`/tricks/${r.slug}`} className="font-medium text-accent hover:underline">
                      {r.name}
                    </Link>
                    {r.note && <span className="text-ink-2"> — {r.note}</span>}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section aria-labelledby="claims">
            <SectionTitle id="claims" action={<span className="text-xs text-muted">{entry.claims.length} claims · {entry.sources.length} sources</span>}>
              What the sources say
            </SectionTitle>
            {entry.claims.length === 0 ? (
              <p className="rounded-[var(--radius-control)] border border-dashed border-line-strong px-4 py-6 text-sm text-muted">
                No sourced claims yet. This entry should not be relied on.
              </p>
            ) : (
              <ol className="flex flex-col gap-3">
                {entry.claims.map((c) => {
                  const st = CLAIM_STATUS[c.status] ?? CLAIM_STATUS.unsupported!;
                  return (
                    <li key={c.id} className="rounded-[var(--radius-card)] border border-line bg-surface p-4">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <p className="min-w-0 flex-1 text-[15px] leading-relaxed text-ink">{c.statement}</p>
                        <Badge tone={st.tone}>{st.label}</Badge>
                      </div>
                      {c.citations.length > 0 && (
                        <details className="group mt-2">
                          <summary className="cursor-pointer list-none text-sm text-accent hover:underline">
                            {c.citations.map((ci) => `[${sourceIndex.get(ci.sourceId)}]`).join(" ")} Show {c.citations.length === 1 ? "excerpt" : "excerpts"}
                          </summary>
                          <ul className="mt-2 flex flex-col gap-2">
                            {c.citations.map((ci) => (
                              <li key={ci.sourceId} className="border-l-2 border-line-strong pl-3 text-sm">
                                <p className="text-ink-2">
                                  {ci.stance === "contradicts" && <Badge tone="danger" className="mr-1">contradicts</Badge>}
                                  {ci.stance === "context" && <Badge className="mr-1">context</Badge>}
                                  {ci.excerpt ? <q className="italic">{ci.excerpt}</q> : <span className="text-muted">No excerpt recorded.</span>}
                                </p>
                                <p className="mt-1 text-xs text-muted">
                                  [{sourceIndex.get(ci.sourceId)}] {ci.publisher || ci.title} · {ci.retrievalMethod}
                                </p>
                              </li>
                            ))}
                          </ul>
                        </details>
                      )}
                    </li>
                  );
                })}
              </ol>
            )}
          </section>

          <section aria-labelledby="sources">
            <SectionTitle id="sources">Sources</SectionTitle>
            {entry.sources.length === 0 ? (
              <p className="text-sm text-muted">None.</p>
            ) : (
              <ol className="flex flex-col gap-2 text-sm">
                {entry.sources.map((s, i) => (
                  <li key={s.sourceId} className="flex gap-3">
                    <span className="w-6 shrink-0 text-right font-mono text-muted">[{i + 1}]</span>
                    <div className="min-w-0">
                      <a href={s.url} target="_blank" rel="noopener noreferrer nofollow" className="font-medium text-accent hover:underline">
                        {s.title}
                      </a>
                      <span className="text-muted"> — {s.publisher || "unknown publisher"}</span>
                      <div className="mt-0.5 flex flex-wrap gap-1.5 text-xs text-muted">
                        <Badge tone={s.reliability === "primary" ? "ok" : s.reliability === "secondary" ? "info" : "neutral"}>{s.reliability}</Badge>
                        <span>accessed {formatDate(s.accessedAt)}</span>
                        <Link href={`/sources/${s.sourceId}`} className="hover:text-ink">
                          · what else it supports
                        </Link>
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </section>

          {actor && (
            <section aria-labelledby="my-notes">
              <SectionTitle id="my-notes" action={<Link href="/progress" className="text-sm text-accent hover:underline">All history</Link>}>
                My private notes
              </SectionTitle>
              <Card className="p-4">
                {logs.length > 0 && (
                  <ul className="mb-4 flex flex-col divide-y divide-line">
                    {logs.map((l) => (
                      <li key={l.id} className="py-2 text-sm">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">{l.title}</span>
                          <Badge tone={l.kind === "milestone" ? "pad" : "neutral"}>{l.kind}</Badge>
                          <span className="text-xs text-muted">{formatDate(l.occurredOn)}</span>
                        </div>
                        {l.body && <p className="mt-1 whitespace-pre-line text-ink-2">{l.body}</p>}
                      </li>
                    ))}
                  </ul>
                )}
                <NoteForm entryId={entry.id} videos={myVideos.filter((v) => v.video.status === "ready").map((v) => ({ id: v.video.id, title: v.video.title }))} />
              </Card>
            </section>
          )}
        </div>

        <aside className="flex flex-col gap-6">
          {otherRelations.length > 0 && (
            <section aria-labelledby="linked">
              <SectionTitle id="linked">Linked entries</SectionTitle>
              <ul className="flex flex-col gap-2">
                {otherRelations.map((r) => (
                  <li key={r.slug} className="text-sm">
                    <Link href={`/tricks/${r.slug}`} className="font-medium text-accent hover:underline">
                      {r.name}
                    </Link>
                    <span className="text-xs text-muted"> · {RELATION_LABEL[r.kind]}</span>
                    {r.note && <p className="text-xs text-muted">{r.note}</p>}
                  </li>
                ))}
              </ul>
            </section>
          )}
          {related.filter((r) => !entry.relations.some((x) => x.slug === r.slug)).length > 0 && (
            <section aria-labelledby="discover">
              <SectionTitle id="discover">Discover similar</SectionTitle>
              <ul className="flex flex-col gap-2">
                {related.filter((r) => !entry.relations.some((x) => x.slug === r.slug)).map((r) => (
                  <li key={r.slug}>
                    <Link href={`/tricks/${r.slug}`} className="block rounded-[var(--radius-control)] border border-line bg-surface px-3 py-2 hover:border-line-strong">
                      <span className="text-sm font-medium">{r.canonical_name}</span>
                      <span className="block text-xs text-muted">{r.reason}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
          <section aria-labelledby="history">
            <SectionTitle id="history">Revision history</SectionTitle>
            <p className="mb-2 text-xs text-muted">Last reviewed {formatDate(entry.lastReviewedAt)} · revision {entry.revision}</p>
            <ol className="flex flex-col gap-1.5 text-xs text-ink-2">
              {entry.revisions.slice(0, 6).map((r) => (
                <li key={r.revision}>
                  <span className="font-mono text-muted">r{r.revision}</span> {r.changeSummary} <span className="text-muted">· {formatDate(r.createdAt)}</span>
                </li>
              ))}
            </ol>
          </section>
          <section aria-labelledby="suggest">
            <SectionTitle id="suggest">Suggest a correction</SectionTitle>
            {actor ? (
              <Card className="p-4">
                <SuggestForm entryId={entry.id} topic={entry.canonicalName} />
              </Card>
            ) : (
              <p className="text-sm text-muted">
                <Link href={`/login?next=/tricks/${entry.slug}`} className="text-accent hover:underline">
                  Sign in
                </Link>{" "}
                to suggest additions with sources.
              </p>
            )}
          </section>
        </aside>
      </div>
    </Container>
  );
}
