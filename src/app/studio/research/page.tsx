import type { Metadata } from "next";
import Link from "next/link";
import { AutoRefresh } from "@/components/auto-refresh";
import { Badge, Card, Container, PageHeader, SectionTitle, StatusBadge, formatDate } from "@/components/ui";
import { requirePageRole } from "@/server/auth/current";
import { listJobs, type LogLine } from "@/server/jobs/queue";
import { searchEntries } from "@/server/kb/entries";
import { findGaps } from "@/server/research/pipeline";
import { getSearchProvider } from "@/server/research/search-providers";
import { DrainButton, GapScanButton, ResearchForm } from "./forms";

export const metadata: Metadata = { title: "Research agent" };

export default async function ResearchPage() {
  const actor = await requirePageRole("reviewer", "/studio/research");
  const [gaps, jobs, list] = await Promise.all([findGaps(15), listJobs("research.", 40), searchEntries({ sort: "name", pageSize: 100, includeDrafts: true }, actor)]);
  const active = jobs.some((j) => j.status === "queued" || j.status === "running");
  const searchEnabled = !!getSearchProvider();
  return (
    <Container>
      {active && <AutoRefresh intervalMs={4000} />}
      <PageHeader
        eyebrow="Studio"
        title="Research agent"
        description="Finds weak entries, gathers sources, extracts cited claims and files drafts for review. It never publishes on its own."
        actions={
          <>
            <GapScanButton />
            <DrainButton />
          </>
        }
      />
      <div className="mt-6 grid gap-8 lg:grid-cols-2">
        <section>
          <SectionTitle>Start a research job</SectionTitle>
          <Card className="p-4">
            <ResearchForm entries={list.items.map((e) => ({ id: e.id, name: e.canonicalName }))} searchEnabled={searchEnabled} />
          </Card>
        </section>
        <section>
          <SectionTitle>Knowledge gaps</SectionTitle>
          <ul className="flex flex-col divide-y divide-line rounded-[var(--radius-card)] border border-line bg-surface">
            {gaps.map((g) => (
              <li key={g.entryId} className="flex flex-col gap-1 px-4 py-2.5">
                <Link href={`/studio/entries/${g.entryId}`} className="text-sm font-medium hover:text-accent">
                  {g.name}
                </Link>
                <span className="flex flex-wrap gap-1">
                  {g.reasons.map((r) => (
                    <Badge key={r} tone={r.includes("No supporting") || r.includes("conflict") ? "danger" : "neutral"}>
                      {r}
                    </Badge>
                  ))}
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>
      <section className="mt-10">
        <SectionTitle>Recent jobs</SectionTitle>
        {jobs.length === 0 ? (
          <p className="text-sm text-muted">No research jobs yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {jobs.map((j) => {
              const p = j.payload as { topic?: string; reason?: string };
              const r = j.result as { draftId?: string; status?: string } | null;
              return (
                <li key={j.id}>
                  <Card className="p-3">
                    <details>
                      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-2 text-sm">
                        <StatusBadge status={j.status} />
                        <span className="font-medium">{j.kind === "research.gap_scan" ? `Gap scan (${p.reason ?? "manual"})` : p.topic}</span>
                        <span className="text-xs text-muted">
                          {formatDate(j.createdAt)} · attempt {j.attempts}/{j.maxAttempts}
                        </span>
                        {r?.draftId && (
                          <Link href={`/studio/review/${r.draftId}`} className="text-xs text-accent hover:underline">
                            View draft →
                          </Link>
                        )}
                        {j.error && <span className="text-xs text-danger">{j.error}</span>}
                      </summary>
                      <ol className="mt-2 flex flex-col gap-0.5 border-t border-line pt-2 font-mono text-xs">
                        {(j.log as LogLine[]).map((l, i) => (
                          <li key={i} className={l.level === "error" ? "text-danger" : l.level === "warn" ? "text-warn" : "text-ink-2"}>
                            {l.at.slice(11, 19)} {l.message}
                          </li>
                        ))}
                        {(j.log as LogLine[]).length === 0 && <li className="text-muted">No log yet.</li>}
                      </ol>
                    </details>
                  </Card>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </Container>
  );
}
