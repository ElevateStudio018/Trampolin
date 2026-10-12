import type { Metadata } from "next";
import Link from "next/link";
import { ActionButton } from "@/components/forms";
import { Badge, Card, Container, EmptyState, LinkButton, PageHeader, formatDate } from "@/components/ui";
import { requireActor } from "@/server/auth/current";
import { listProgressLogs } from "@/server/me/collection";
import { deleteLogAction } from "./actions";
import { GeneralNoteForm } from "./note-form";

export const metadata: Metadata = { title: "Progress history" };

export default async function ProgressPage() {
  const actor = await requireActor("/progress");
  const logs = await listProgressLogs(actor);
  const byMonth = new Map<string, typeof logs>();
  for (const l of logs) {
    const key = new Date(l.occurredOn).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
    byMonth.set(key, [...(byMonth.get(key) ?? []), l]);
  }
  return (
    <Container>
      <PageHeader
        eyebrow="Personal · private"
        title="Progress history"
        description="Training notes, sessions and milestones. Only you can see these — they are never shown on your profile or used by the assistant."
        actions={<LinkButton href="/collection" variant="secondary">Collection</LinkButton>}
      />
      <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <section aria-label="Timeline">
          {logs.length === 0 ? (
            <EmptyState title="No history yet">Add a note here, or from any Trick Book entry to link it to a skill.</EmptyState>
          ) : (
            [...byMonth.entries()].map(([month, items]) => (
              <div key={month} className="mb-8">
                <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">{month}</h2>
                <ol className="relative flex flex-col gap-3 border-l border-line pl-5">
                  {items.map((l) => (
                    <li key={l.id} className="relative">
                      <span aria-hidden className={`absolute -left-[26px] top-4 size-2.5 rounded-full ${l.kind === "milestone" ? "bg-pad" : "bg-line-strong"}`} />
                      <Card className="p-4">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div>
                            <p className="font-medium">{l.title}</p>
                            <p className="text-xs text-muted">
                              {formatDate(l.occurredOn)}
                              {l.entryName && (
                                <>
                                  {" · "}
                                  <Link href={`/tricks/${l.entrySlug}`} className="text-accent hover:underline">
                                    {l.entryName}
                                  </Link>
                                </>
                              )}
                              {l.videoId && (
                                <>
                                  {" · "}
                                  <Link href={`/videos/${l.videoId}`} className="text-accent hover:underline">
                                    ▶ {l.videoTitle}
                                  </Link>
                                </>
                              )}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge tone={l.kind === "milestone" ? "pad" : l.kind === "session" ? "accent" : "neutral"}>{l.kind}</Badge>
                            <ActionButton action={deleteLogAction} fields={{ id: l.id }} variant="ghost" confirm="Delete this note permanently?" ariaLabel={`Delete note ${l.title}`}>
                              Delete
                            </ActionButton>
                          </div>
                        </div>
                        {l.body && <p className="mt-2 whitespace-pre-line text-sm text-ink-2">{l.body}</p>}
                      </Card>
                    </li>
                  ))}
                </ol>
              </div>
            ))
          )}
        </section>
        <aside>
          <Card className="p-5">
            <h2 className="mb-3 font-semibold">Add to history</h2>
            <GeneralNoteForm />
          </Card>
        </aside>
      </div>
    </Container>
  );
}
