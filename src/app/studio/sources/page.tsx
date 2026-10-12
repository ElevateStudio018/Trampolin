import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Container, PageHeader, formatDate } from "@/components/ui";
import { requirePageRole } from "@/server/auth/current";
import { listSources } from "@/server/kb/sources";

export const metadata: Metadata = { title: "Sources" };

export default async function SourcesPage() {
  const actor = await requirePageRole("reviewer", "/studio/sources");
  const sources = await listSources(actor);
  return (
    <Container>
      <PageHeader eyebrow="Studio" title="Sources" description="Every source the knowledge base cites, with how it was retrieved." />
      <div className="mt-6 overflow-x-auto rounded-[var(--radius-card)] border border-line bg-surface">
        <table className="w-full text-sm">
          <thead className="text-left text-muted">
            <tr>
              {["Title", "Publisher", "Reliability", "Retrieval", "Accessed", "Citations"].map((h) => (
                <th key={h} className="px-4 py-2 font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sources.map((s) => (
              <tr key={s.id} className="border-t border-line align-top">
                <td className="px-4 py-2">
                  <Link href={`/sources/${s.id}`} className="font-medium text-accent hover:underline">
                    {s.title}
                  </Link>
                </td>
                <td className="px-4 py-2">{s.publisher}</td>
                <td className="px-4 py-2">
                  <Badge tone={s.reliability === "primary" ? "ok" : "neutral"}>{s.reliability}</Badge>
                </td>
                <td className="px-4 py-2 text-muted">{s.retrievalMethod}</td>
                <td className="px-4 py-2 text-muted">{formatDate(s.accessedAt)}</td>
                <td className="px-4 py-2">{s.citations}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Container>
  );
}
