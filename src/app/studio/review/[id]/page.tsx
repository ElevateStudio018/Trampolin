import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, Card, Container, Notice, PageHeader, ReviewBadge, SectionTitle, formatDate } from "@/components/ui";
import { requirePageRole } from "@/server/auth/current";
import { getDraft } from "@/server/research/drafts";
import { ReviewForm } from "./review-form";

export const metadata: Metadata = { title: "Review draft" };

export default async function DraftPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await requirePageRole("reviewer", `/studio/review/${id}`);
  const d = await getDraft(actor, id).catch(() => null);
  if (!d) notFound();
  const p = d.payload;
  const closed = d.status === "approved" || d.status === "rejected";
  return (
    <Container>
      <PageHeader
        eyebrow={<Link href="/studio/review">Review queue</Link>}
        title={d.topic}
        description={
          <>
            {d.target ? (
              <>
                Proposes changes to{" "}
                <Link href={`/tricks/${d.target.slug}`} className="text-accent hover:underline">
                  {d.target.name}
                </Link>
              </>
            ) : (
              "Proposes a new entry"
            )}{" "}
            · extractor <code className="text-xs">{p.extractor}</code> · {formatDate(d.createdAt)}
          </>
        }
        actions={<ReviewBadge status={d.status} />}
      />
      <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="flex min-w-0 flex-col gap-6">
          {d.duplicate && !d.target && (
            <Notice tone="warn" title="Possible duplicate">
              This topic closely matches{" "}
              <Link href={`/tricks/${d.duplicate.slug}`} className="underline">
                {d.duplicate.name}
              </Link>
              . Prefer merging into it.
            </Notice>
          )}
          {p.unresolvedQuestions.length > 0 && (
            <Notice tone="info" title="Open questions">
              <ul className="list-disc pl-4">
                {p.unresolvedQuestions.map((q) => (
                  <li key={q}>{q}</li>
                ))}
              </ul>
            </Notice>
          )}
          {p.summary && (
            <section>
              <SectionTitle>Proposed summary</SectionTitle>
              <p className="text-ink-2">{p.summary}</p>
            </section>
          )}
          {p.aliases.length > 0 && (
            <section>
              <SectionTitle>Aliases found</SectionTitle>
              <div className="flex flex-wrap gap-1.5">
                {p.aliases.map((a) => (
                  <Badge key={a}>{a}</Badge>
                ))}
              </div>
            </section>
          )}
          <section>
            <SectionTitle>Claims and evidence</SectionTitle>
            <ol className="flex flex-col gap-3">
              {p.claims.map((c, i) => (
                <li key={i}>
                  <Card className="p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <p className="min-w-0 flex-1 text-[15px]">
                        <span className="mr-2 font-mono text-xs text-muted">#{i}</span>
                        {c.statement}
                      </p>
                      {c.flag && <Badge tone={c.flag === "conflict" ? "warn" : "danger"}>{c.flag}</Badge>}
                    </div>
                    <ul className="mt-2 flex flex-col gap-2">
                      {c.sourceRefs.map((r, j) => {
                        const s = d.sources[r.sourceId];
                        return (
                          <li key={j} className="border-l-2 border-line-strong pl-3 text-sm">
                            {r.excerpt ? <q className="italic text-ink-2">{r.excerpt}</q> : <span className="text-muted">No excerpt — open the source and check it.</span>}
                            <p className="mt-0.5 text-xs text-muted">
                              {r.stance} ·{" "}
                              {s ? (
                                <a href={s.url} target="_blank" rel="noopener noreferrer nofollow" className="text-accent hover:underline">
                                  {s.title}
                                </a>
                              ) : (
                                "unknown source"
                              )}{" "}
                              {s && `· ${s.retrievalMethod}`}
                            </p>
                          </li>
                        );
                      })}
                      {c.sourceRefs.length === 0 && <li className="text-sm text-danger">No source supports this claim.</li>}
                    </ul>
                  </Card>
                </li>
              ))}
              {p.claims.length === 0 && <p className="text-sm text-muted">The draft contains no claims.</p>}
            </ol>
          </section>
        </div>
        <aside>
          {closed ? (
            <Card className="p-4 text-sm">
              <p className="font-medium">Decision: {d.status}</p>
              <p className="text-muted">
                by {d.reviewerName ?? "unknown"} · {formatDate(d.reviewedAt)}
              </p>
              {d.reviewNote && <p className="mt-2 text-ink-2">{d.reviewNote}</p>}
            </Card>
          ) : (
            <Card className="p-4">
              <ReviewForm
                draftId={d.id}
                isNew={!d.target}
                duplicate={d.duplicate ? { id: d.duplicate.id, name: d.duplicate.name } : null}
                claims={p.claims.map((c) => ({ statement: c.statement, supported: c.sourceRefs.some((r) => r.stance === "supports"), flag: c.flag }))}
              />
            </Card>
          )}
        </aside>
      </div>
    </Container>
  );
}
