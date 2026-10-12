import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { Badge, Card, Container, PageHeader, formatDate } from "@/components/ui";
import { getSource } from "@/server/kb/sources";

export const metadata: Metadata = { title: "Source" };

export default async function SourcePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();
  const source = await getSource(id);
  if (!source) notFound();
  return (
    <Container className="max-w-3xl">
      <PageHeader
        eyebrow="Source"
        title={source.title}
        description={
          <>
            {source.publisher || "Unknown publisher"} ·{" "}
            <a href={source.url} target="_blank" rel="noopener noreferrer nofollow" className="text-accent hover:underline break-all">
              {source.url}
            </a>
          </>
        }
      />
      <div className="mt-4 flex flex-wrap gap-2 text-sm">
        <Badge tone={source.reliability === "primary" ? "ok" : source.reliability === "secondary" ? "info" : "neutral"}>{source.reliability}</Badge>
        <Badge>{source.retrievalMethod}</Badge>
        <Badge>accessed {formatDate(source.accessedAt)}</Badge>
      </div>
      {source.notes && <p className="mt-3 text-sm text-ink-2">{source.notes}</p>}
      <h2 className="mb-3 mt-8 font-semibold">Claims citing this source ({source.cited.length})</h2>
      <ul className="flex flex-col gap-2">
        {source.cited.map((c, i) => (
          <li key={i}>
            <Card className="p-4 text-sm">
              <p>{c.statement}</p>
              {c.excerpt && <q className="mt-1 block italic text-muted">{c.excerpt}</q>}
              <p className="mt-2 text-xs text-muted">
                <Link className="text-accent hover:underline" href={`/tricks/${c.entrySlug}`}>
                  {c.entryName}
                </Link>{" "}
                · {c.stance}
              </p>
            </Card>
          </li>
        ))}
      </ul>
      <p className="mt-6 text-xs text-muted">
        Several entries citing one source is not independent confirmation: if this source is wrong, all of them are affected.
      </p>
    </Container>
  );
}
