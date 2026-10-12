import type { Metadata } from "next";
import Link from "next/link";
import { ActionButton } from "@/components/forms";
import { Badge, Card, Container, EvidenceBadge, Notice, PageHeader, SectionTitle, formatDate } from "@/components/ui";
import { assistantHistory, type AssistantAnswer } from "@/server/assistant/answer";
import { requireActor } from "@/server/auth/current";
import { llmConfigured } from "@/server/llm/client";
import { clearHistoryAction } from "./actions";
import { AskForm } from "./ask-form";

export const metadata: Metadata = { title: "Assistant" };

const MODE: Record<AssistantAnswer["mode"], { label: string; tone: "accent" | "warn" | "neutral" }> = {
  llm: { label: "Generated from cited records", tone: "accent" },
  retrieval_only: { label: "Retrieval only — records shown as stored", tone: "warn" },
  no_match: { label: "No matching records", tone: "neutral" },
};

function AnswerView({ question, answer }: { question: string; answer: AssistantAnswer }) {
  const cite = new Map(answer.citations.map((c, i) => [c.key, i + 1]));
  return (
    <article className="flex flex-col gap-4" aria-label="Answer">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-semibold">{question}</h2>
        <Badge tone={MODE[answer.mode].tone}>{MODE[answer.mode].label}</Badge>
      </div>
      {answer.safetyNotice && <Notice tone="warn" title="Safety">{answer.safetyNotice}</Notice>}
      {answer.degradedReason && <Notice tone="info">{answer.degradedReason} Showing the matching records directly instead.</Notice>}
      <div className="flex flex-col gap-3 text-[15px] leading-relaxed">
        {answer.blocks.map((b, i) => (
          <p key={i} className="whitespace-pre-line">
            {b.text.replace(/\s*\[C\d+\]/g, "")}{" "}
            {b.citationKeys.map((k) => (
              <a key={k} href={`#cite-${k}`} className="align-super text-xs font-semibold text-accent hover:underline">
                [{cite.get(k)}]
              </a>
            ))}
          </p>
        ))}
      </div>
      {answer.caveats.length > 0 && (
        <ul className="list-disc pl-5 text-sm text-muted">
          {answer.caveats.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
      )}
      {answer.citations.length > 0 && (
        <section aria-label="Citations" className="border-t border-line pt-3">
          <h3 className="mb-2 text-sm font-semibold">Citations</h3>
          <ol className="flex flex-col gap-2 text-sm">
            {answer.citations.map((c) => (
              <li key={c.key} id={`cite-${c.key}`} className="flex gap-2">
                <span className="w-6 shrink-0 text-right font-mono text-muted">[{cite.get(c.key)}]</span>
                <div className="min-w-0">
                  <p>
                    {c.statement}{" "}
                    {c.claimStatus === "disputed" && <Badge tone="danger">disputed</Badge>}
                  </p>
                  <p className="text-xs text-muted">
                    <Link href={`/tricks/${c.entrySlug}`} className="text-accent hover:underline">
                      {c.entryName}
                    </Link>
                    {" · "}
                    {c.sources.map((s, i) => (
                      <span key={s.url}>
                        {i > 0 && ", "}
                        <a href={s.url} target="_blank" rel="noopener noreferrer nofollow" className="hover:text-ink">
                          {s.publisher || s.title}
                        </a>
                        {s.stance === "contradicts" && " (contradicts)"}
                      </span>
                    ))}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </section>
      )}
      {answer.entries.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted">Records consulted:</span>
          {answer.entries.map((e) => (
            <Link key={e.slug} href={`/tricks/${e.slug}`} className="inline-flex items-center gap-1 hover:text-accent">
              {e.name} <EvidenceBadge status={e.evidenceStatus} />
            </Link>
          ))}
        </div>
      )}
    </article>
  );
}

export default async function AssistantPage({ searchParams }: { searchParams: Promise<{ a?: string }> }) {
  const actor = await requireActor("/assistant");
  const { a } = await searchParams;
  const history = await assistantHistory(actor, 30);
  const current = history.find((h) => h.id === a) ?? null;
  const modelOn = llmConfigured();
  return (
    <Container>
      <PageHeader
        eyebrow="Assistant"
        title="Ask the Trick Book"
        description="Answers come only from published Trick Book records and cite them. Your private notes are never searched."
      />
      {!modelOn && (
        <div className="mt-6">
          <Notice tone="info" title="Retrieval-only mode">
            No language model is configured on this server, so answers show the matching records and their cited claims as stored, without generated wording.
          </Notice>
        </div>
      )}
      <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="flex min-w-0 flex-col gap-6">
          <Card className="p-4">
            <AskForm />
          </Card>
          {current && (
            <Card className="p-5">
              <AnswerView question={current.question} answer={current.answer} />
            </Card>
          )}
        </div>
        <aside>
          <SectionTitle
            action={
              history.length > 0 ? (
                <ActionButton action={clearHistoryAction} fields={{}} variant="ghost" confirm="Delete your assistant history?">
                  Clear
                </ActionButton>
              ) : undefined
            }
          >
            Your questions
          </SectionTitle>
          {history.length === 0 ? (
            <p className="text-sm text-muted">No questions yet.</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {history.map((h) => (
                <li key={h.id}>
                  <Link
                    href={`/assistant?a=${h.id}`}
                    aria-current={h.id === a ? "page" : undefined}
                    className={`block rounded-[var(--radius-control)] px-3 py-2 text-sm hover:bg-surface-2 ${h.id === a ? "bg-surface-2" : ""}`}
                  >
                    <span className="line-clamp-2">{h.question}</span>
                    <span className="text-xs text-muted">{formatDate(h.createdAt)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </aside>
      </div>
    </Container>
  );
}
