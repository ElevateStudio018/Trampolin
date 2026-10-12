import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Card, Container, EmptyState, PageHeader, formatDate } from "@/components/ui";
import { cn } from "@/lib/cn";
import { requirePageRole } from "@/server/auth/current";
import { listReports } from "@/server/community/service";
import { ResolveForm } from "./forms";

export const metadata: Metadata = { title: "Moderation" };

export default async function ModerationPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const actor = await requirePageRole("admin", "/studio/moderation");
  const { status: raw } = await searchParams;
  const status = raw === "actioned" || raw === "dismissed" ? raw : "open";
  const reports = await listReports(actor, status);
  return (
    <Container>
      <PageHeader eyebrow="Studio" title="Moderation" description="Reports from members. Hiding content removes it from everyone except its author and admins; it can be restored." />
      <nav className="mt-6 flex gap-1" aria-label="Report status">
        {(["open", "actioned", "dismissed"] as const).map((s) => (
          <Link key={s} href={`/studio/moderation?status=${s}`} aria-current={s === status ? "page" : undefined} className={cn("rounded-full px-3 py-1.5 text-sm", s === status ? "bg-ink text-bg" : "bg-surface-2 text-ink-2")}>
            {s}
          </Link>
        ))}
      </nav>
      {reports.length === 0 ? (
        <div className="mt-6">
          <EmptyState title="No reports" />
        </div>
      ) : (
        <ul className="mt-4 flex flex-col gap-3">
          {reports.map(({ report: r, reporterHandle, target }) => (
            <li key={r.id}>
              <Card className="flex flex-col gap-3 p-4">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <Badge tone="danger">{r.reason}</Badge>
                  <Badge>{r.targetType}</Badge>
                  {target.hidden && <Badge tone="warn">currently hidden</Badge>}
                  <span className="text-muted">
                    reported by @{reporterHandle} · {formatDate(r.createdAt)}
                  </span>
                </div>
                <blockquote className="border-l-2 border-line-strong pl-3 text-sm text-ink-2">
                  {target.href ? (
                    <Link href={target.href} className="hover:text-accent">
                      {target.text.slice(0, 400)}
                    </Link>
                  ) : (
                    target.text
                  )}
                </blockquote>
                {r.details && <p className="text-sm">“{r.details}”</p>}
                {r.status === "open" ? (
                  target.exists && <ResolveForm reportId={r.id} hidden={target.hidden} />
                ) : (
                  <p className="text-xs text-muted">
                    {r.status} {formatDate(r.resolvedAt)} {r.resolutionNote && `· ${r.resolutionNote}`}
                  </p>
                )}
              </Card>
            </li>
          ))}
        </ul>
      )}
    </Container>
  );
}
