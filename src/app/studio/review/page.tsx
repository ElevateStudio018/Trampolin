import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Container, EmptyState, PageHeader, REVIEW_META, ReviewBadge, formatDate } from "@/components/ui";
import { cn } from "@/lib/cn";
import { requirePageRole } from "@/server/auth/current";
import { draftCounts, listDrafts, type ReviewStatus } from "@/server/research/drafts";

export const metadata: Metadata = { title: "Review queue" };

const TABS: (ReviewStatus | "open")[] = ["open", "pending_review", "needs_more_sources", "conflicting_information", "approved", "rejected"];

export default async function ReviewQueue({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const actor = await requirePageRole("reviewer", "/studio/review");
  const { status: raw } = await searchParams;
  const status = TABS.includes(raw as ReviewStatus) ? (raw as ReviewStatus | "open") : "open";
  const [drafts, counts] = await Promise.all([listDrafts(actor, status), draftCounts()]);
  return (
    <Container>
      <PageHeader eyebrow="Studio" title="Review queue" description="Research drafts and member suggestions. Approving imports only the claims you select, with their sources." />
      <nav aria-label="Filter drafts" className="mt-6 flex gap-1 overflow-x-auto">
        {TABS.map((t) => (
          <Link
            key={t}
            href={`/studio/review?status=${t}`}
            aria-current={t === status ? "page" : undefined}
            className={cn("whitespace-nowrap rounded-full px-3 py-1.5 text-sm", t === status ? "bg-ink text-bg" : "bg-surface-2 text-ink-2 hover:bg-line")}
          >
            {t === "open" ? "All open" : REVIEW_META[t]!.label}{" "}
            <span className="opacity-70">{t === "open" ? (counts.pending_review ?? 0) + (counts.needs_more_sources ?? 0) + (counts.conflicting_information ?? 0) : (counts[t] ?? 0)}</span>
          </Link>
        ))}
      </nav>
      {drafts.length === 0 ? (
        <div className="mt-6">
          <EmptyState title="Nothing here">Drafts appear when the research agent runs or members suggest changes.</EmptyState>
        </div>
      ) : (
        <ul className="mt-4 flex flex-col divide-y divide-line rounded-[var(--radius-card)] border border-line bg-surface">
          {drafts.map((d) => (
            <li key={d.id}>
              <Link href={`/studio/review/${d.id}`} className="flex flex-col gap-1 px-4 py-3 hover:bg-surface-2 sm:flex-row sm:items-center sm:justify-between">
                <span>
                  <span className="font-medium">{d.topic}</span>
                  <span className="ml-2 text-xs text-muted">{d.entryName ? `improves “${d.entryName}”` : "new entry"}</span>
                </span>
                <span className="flex flex-wrap items-center gap-2 text-xs text-muted">
                  {d.possibleDuplicateOf && <Badge tone="danger">possible duplicate</Badge>}
                  <Badge>{d.extractor}</Badge>
                  {d.claimCount} claims · {formatDate(d.createdAt)}
                  <ReviewBadge status={d.status} />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Container>
  );
}
