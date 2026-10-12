import type { Metadata } from "next";
import Link from "next/link";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { Badge, Card, Container, PageHeader, SectionTitle } from "@/components/ui";
import { env } from "@/lib/env";
import { hasRole } from "@/server/actor";
import { requirePageRole } from "@/server/auth/current";
import { llmConfigured, tokensUsedToday, usageSummary } from "@/server/llm/client";
import { draftCounts } from "@/server/research/drafts";
import { getSearchProvider } from "@/server/research/search-providers";
import { analyzerCatalog } from "@/server/video/service";

export const metadata: Metadata = { title: "Studio" };

function Stat({ label, value, href, tone }: { label: string; value: number | string; href?: string; tone?: "warn" | "danger" }) {
  const inner = (
    <Card className="h-full p-4 hover:border-line-strong">
      <p className="text-sm text-muted">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${tone === "danger" ? "text-danger" : tone === "warn" ? "text-warn" : ""}`}>{value}</p>
    </Card>
  );
  return href ? <Link href={href}>{inner}</Link> : inner;
}

export default async function StudioHome() {
  const actor = await requirePageRole("reviewer", "/studio");
  const [drafts, jobRows, reportRows, usage, today] = await Promise.all([
    draftCounts(),
    db.execute<{ status: string; n: number }>(sql`select status, count(*)::int as n from jobs where created_at > now() - interval '7 days' group by status`),
    db.execute<{ n: number }>(sql`select count(*)::int as n from reports where status = 'open'`),
    usageSummary(7),
    tokensUsedToday(),
  ]);
  const jobs = Object.fromEntries(jobRows.rows.map((r) => [r.status, r.n])) as Record<string, number>;
  const provider = getSearchProvider();
  const integrations = [
    { name: "Language model (assistant, research extraction)", ok: llmConfigured(), detail: llmConfigured() ? `${env().ANTHROPIC_MODEL} · ${today.toLocaleString()} / ${env().LLM_DAILY_TOKEN_BUDGET.toLocaleString()} tokens today` : "Not configured — assistant runs retrieval-only; research uses excerpt extraction" },
    { name: "Web search (research agent)", ok: !!provider, detail: provider ? provider.name : "Not configured — research uses reviewer-supplied sources only" },
    ...analyzerCatalog().map((a) => ({ name: `Video: ${a.label}`, ok: a.availability.available, detail: a.availability.available ? a.version : a.availability.reason })),
  ];
  return (
    <Container>
      <PageHeader eyebrow="Studio" title="Overview" description="Review work, research status and the health of external integrations." />
      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Drafts awaiting review" value={drafts.pending_review ?? 0} href="/studio/review" tone={(drafts.pending_review ?? 0) > 0 ? "warn" : undefined} />
        <Stat label="Need more sources / conflicting" value={(drafts.needs_more_sources ?? 0) + (drafts.conflicting_information ?? 0)} href="/studio/review" />
        <Stat label="Jobs failed or blocked (7 days)" value={(jobs.failed ?? 0) + (jobs.blocked ?? 0)} href="/studio/research" tone={(jobs.failed ?? 0) > 0 ? "danger" : undefined} />
        {hasRole(actor, "admin") ? (
          <Stat label="Open reports" value={reportRows.rows[0]?.n ?? 0} href="/studio/moderation" tone={(reportRows.rows[0]?.n ?? 0) > 0 ? "danger" : undefined} />
        ) : (
          <Stat label="Jobs queued" value={jobs.queued ?? 0} href="/studio/research" />
        )}
      </div>
      <section className="mt-10">
        <SectionTitle>Integrations</SectionTitle>
        <ul className="flex flex-col divide-y divide-line rounded-[var(--radius-card)] border border-line bg-surface">
          {integrations.map((i) => (
            <li key={i.name} className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <span className="font-medium">{i.name}</span>
              <span className="flex items-center gap-2 text-sm text-muted">
                {i.detail} <Badge tone={i.ok ? "ok" : "warn"}>{i.ok ? "Active" : "Unavailable"}</Badge>
              </span>
            </li>
          ))}
        </ul>
      </section>
      <section className="mt-10">
        <SectionTitle>Language-model usage (7 days)</SectionTitle>
        {usage.length === 0 ? (
          <p className="text-sm text-muted">No model calls recorded.</p>
        ) : (
          <div className="overflow-x-auto rounded-[var(--radius-card)] border border-line bg-surface">
            <table className="w-full text-sm">
              <thead className="text-left text-muted">
                <tr>
                  {["Day", "Feature", "Calls", "Input tokens", "Output tokens", "Errors", "Avg latency"].map((h) => (
                    <th key={h} className="px-4 py-2 font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {usage.map((u) => (
                  <tr key={u.day + u.feature} className="border-t border-line">
                    <td className="px-4 py-2">{u.day}</td>
                    <td className="px-4 py-2">{u.feature}</td>
                    <td className="px-4 py-2">{u.calls}</td>
                    <td className="px-4 py-2">{u.input_tokens.toLocaleString()}</td>
                    <td className="px-4 py-2">{u.output_tokens.toLocaleString()}</td>
                    <td className="px-4 py-2">{u.errors}</td>
                    <td className="px-4 py-2">{u.avg_latency_ms} ms</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </Container>
  );
}
