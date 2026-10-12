import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { Badge, Card, Container, EvidenceBadge, PageHeader, SectionTitle, formatDate } from "@/components/ui";
import { requirePageRole } from "@/server/auth/current";
import { getEntryById, getEntryBySlug, listCategories, searchEntries } from "@/server/kb/entries";
import { listSources } from "@/server/kb/sources";
import { AddClaimForm, EntryForm, RelationForm, RemoveClaimButton, StateButtons } from "../entry-form";

export const metadata: Metadata = { title: "Edit entry" };

export default async function EditEntryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await requirePageRole("reviewer", `/studio/entries/${id}`);
  if (!z.string().uuid().safeParse(id).success) notFound();
  const base = await getEntryById(id);
  if (!base) notFound();
  const [entry, categories, sources, all] = await Promise.all([getEntryBySlug(base.slug, actor), listCategories(actor), listSources(actor), searchEntries({ sort: "name", pageSize: 100, includeDrafts: true }, actor)]);
  if (!entry) notFound();
  return (
    <Container>
      <PageHeader
        eyebrow={<Link href="/studio">Studio</Link>}
        title={entry.canonicalName}
        description={
          <span className="inline-flex flex-wrap items-center gap-2">
            <Badge tone={entry.state === "published" ? "ok" : "warn"}>{entry.state}</Badge>
            <EvidenceBadge status={entry.evidenceStatus} /> revision {entry.revision}
            {entry.state === "published" && (
              <Link href={`/tricks/${entry.slug}`} className="text-accent hover:underline">
                View public page →
              </Link>
            )}
          </span>
        }
        actions={<StateButtons id={entry.id} state={entry.state} />}
      />
      <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="flex min-w-0 flex-col gap-8">
          <Card className="p-5">
            <EntryForm
              categories={categories}
              initial={{
                id: entry.id,
                contentVersion: entry.contentVersion,
                canonicalName: entry.canonicalName,
                summary: entry.summary,
                body: entry.body,
                kind: entry.kind,
                categorySlug: entry.categorySlug ?? "",
                figNotation: entry.figNotation ?? "",
                quarterRotations: entry.quarterRotations?.toString() ?? "",
                halfTwists: entry.halfTwists?.toString() ?? "",
                position: entry.position ?? "",
                evidenceStatus: entry.evidenceStatus,
                tags: entry.tags.join(", "),
                aliases: entry.aliases.map((a) => a.alias).join(", "),
              }}
            />
          </Card>
          <section>
            <SectionTitle>Claims ({entry.claims.length})</SectionTitle>
            <ul className="flex flex-col gap-2">
              {entry.claims.map((c) => (
                <li key={c.id}>
                  <Card className="flex flex-col gap-2 p-3 text-sm sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <p>{c.statement}</p>
                      <p className="mt-1 text-xs text-muted">
                        <Badge>{c.status}</Badge> {c.citations.map((ci) => `${ci.publisher || ci.title} (${ci.stance})`).join("; ") || "no sources"}
                      </p>
                    </div>
                    <RemoveClaimButton claimId={c.id} />
                  </Card>
                </li>
              ))}
            </ul>
            <Card className="mt-3 p-4">
              <h3 className="mb-3 text-sm font-semibold">Add a claim</h3>
              <AddClaimForm entryId={entry.id} sources={sources.map((s) => ({ id: s.id, title: s.title, publisher: s.publisher }))} />
            </Card>
          </section>
        </div>
        <aside className="flex flex-col gap-6">
          <section>
            <SectionTitle>Links to other entries</SectionTitle>
            <ul className="mb-3 flex flex-col gap-1 text-sm">
              {entry.relations.map((r) => (
                <li key={r.slug}>
                  {r.direction === "out" ? "→" : "←"} {r.name} <span className="text-xs text-muted">({r.kind})</span>
                </li>
              ))}
            </ul>
            <Card className="p-4">
              <RelationForm fromId={entry.id} entries={all.items.filter((e) => e.id !== entry.id).map((e) => ({ id: e.id, name: e.canonicalName }))} />
            </Card>
          </section>
          <section>
            <SectionTitle>Revisions</SectionTitle>
            <ol className="flex flex-col gap-1 text-xs">
              {entry.revisions.map((r) => (
                <li key={r.revision}>
                  <span className="font-mono text-muted">r{r.revision}</span> {r.changeSummary} · {formatDate(r.createdAt)}
                </li>
              ))}
            </ol>
          </section>
        </aside>
      </div>
    </Container>
  );
}
