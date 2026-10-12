import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { assistantQueries } from "@/db/schema";
import { ValidationError } from "@/lib/errors";
import { type Actor, assertSignedIn } from "@/server/actor";
import { generateStructured, llmConfigured, LlmUnavailableError } from "@/server/llm/client";
import { rateLimit } from "@/server/ratelimit";
import { classifyQuestion, SAFETY_NOTICE, type SafetyClass } from "./safety";
import { retrieve, type RetrievedClaim, type RetrievedEntry } from "./retrieval";

export type Citation = {
  key: string;
  statement: string;
  claimStatus: string;
  entrySlug: string;
  entryName: string;
  evidenceStatus: string;
  sources: RetrievedClaim["sources"];
};

export type AnswerBlock = { text: string; citationKeys: string[] };

export type AssistantAnswer = {
  mode: "llm" | "retrieval_only" | "no_match";
  blocks: AnswerBlock[];
  citations: Citation[];
  entries: { slug: string; name: string; evidenceStatus: string }[];
  caveats: string[];
  safety: SafetyClass;
  safetyNotice: string | null;
  degradedReason?: string;
};

const QUESTION = z.string().trim().min(3, "Ask a question").max(500, "Keep questions under 500 characters");

const SYSTEM = `You answer questions about trampoline gymnastics terminology, skills and competition rules for a reference website.
Rules:
- Use ONLY the knowledge-base records provided. If they do not answer the question, say so plainly and set insufficient_evidence to true.
- Every paragraph that states a fact must cite one or more claim keys (like "C2") from the records. Never invent keys.
- Respect evidence labels: if a claim is "disputed" or the entry is "conflicting", say that sources disagree and present each version. If evidence is "limited_evidence", say the support is limited.
- Never give step-by-step instructions, drills, technique cues or progressions for performing skills, and never say whether a specific person can safely attempt a skill. Definitions, comparisons and rules are fine.
- Be concise: at most 3 short paragraphs.`;

const answerSchema = z.object({
  paragraphs: z.array(z.object({ text: z.string(), citations: z.array(z.string()) })),
  insufficient_evidence: z.boolean(),
});

function renderRecords(found: RetrievedEntry[]) {
  return found
    .map((e) => {
      const claimsText = e.claims
        .map((c) => `  [${c.key}] (${c.status}) ${c.statement}\n${c.sources.map((s) => `     source: ${s.title} — ${s.publisher || "unknown publisher"} (${s.reliability}, ${s.stance})`).join("\n")}`)
        .join("\n");
      return `ENTRY "${e.name}" (evidence: ${e.evidenceStatus}; aliases: ${e.aliases.join(", ") || "none"})\n  summary: ${e.summary}\n${claimsText || "  (no sourced claims)"}`;
    })
    .join("\n\n");
}

function citationsFor(found: RetrievedEntry[]): Map<string, Citation> {
  const map = new Map<string, Citation>();
  for (const e of found)
    for (const c of e.claims)
      map.set(c.key, { key: c.key, statement: c.statement, claimStatus: c.status, entrySlug: e.slug, entryName: e.name, evidenceStatus: e.evidenceStatus, sources: c.sources });
  return map;
}

function caveatsFor(found: RetrievedEntry[]): string[] {
  const out: string[] = [];
  if (found.some((e) => e.evidenceStatus === "conflicting")) out.push("Some of these sources disagree with each other. Read the cited claims before relying on the answer.");
  if (found.some((e) => e.evidenceStatus === "limited_evidence")) out.push("Most supporting sources are secondary or club glossaries; none has been verified against a primary source in full.");
  if (found.some((e) => e.evidenceStatus === "community" || e.evidenceStatus === "ai_draft")) out.push("Some content is community-submitted or unreviewed.");
  return out;
}

/** Deterministic answer from retrieved records, used when no model is configured or it fails. */
function retrievalOnly(found: RetrievedEntry[], cites: Map<string, Citation>): AnswerBlock[] {
  const primary = found.filter((e) => e.matchedBy === "name");
  const shown = (primary.length ? primary : found).slice(0, 3);
  return shown.map((e) => {
    const supported = e.claims.filter((c) => c.sources.some((s) => s.stance === "supports")).slice(0, 3);
    const lines = supported.map((c) => `${c.status === "disputed" ? "Disputed: " : ""}${c.statement} [${c.key}]`);
    return {
      text: `${e.name}: ${e.summary}${lines.length ? `\n${lines.join("\n")}` : ""}`,
      citationKeys: supported.map((c) => c.key).filter((k) => cites.has(k)),
    };
  });
}

export async function answerQuestion(actor: Actor, rawQuestion: string): Promise<AssistantAnswer & { id: string }> {
  assertSignedIn(actor);
  const parsedQ = QUESTION.safeParse(rawQuestion);
  if (!parsedQ.success) throw new ValidationError(parsedQ.error.issues[0]!.message, { question: [parsedQ.error.issues[0]!.message] });
  const question = parsedQ.data;
  await rateLimit(`assistant:${actor.id}`, 30, 3600);

  const safety = classifyQuestion(question);
  const found = await retrieve(question);
  const cites = citationsFor(found);
  const entriesOut = found.map((e) => ({ slug: e.slug, name: e.name, evidenceStatus: e.evidenceStatus }));
  const base = { safety, safetyNotice: safety === "ok" ? null : SAFETY_NOTICE[safety], entries: entriesOut, caveats: caveatsFor(found) };

  let answer: AssistantAnswer;
  if (found.length === 0) {
    answer = {
      ...base,
      mode: "no_match",
      blocks: [{ text: "The knowledge base doesn't have an entry that covers this question, so I can't answer it reliably. Try different wording, or suggest the topic so a reviewer can research it.", citationKeys: [] }],
      citations: [],
    };
  } else if (llmConfigured()) {
    try {
      const out = await generateStructured({
        feature: "assistant",
        userId: actor.id,
        system: SYSTEM,
        prompt: `Knowledge-base records:\n\n${renderRecords(found)}\n\nQuestion: ${question}${safety !== "ok" ? "\n\n(The question asks for performance instructions or a personal safety judgement. Do not provide them; answer only the factual part, if any.)" : ""}`,
        schema: answerSchema,
        maxTokens: 1500,
      });
      // Output validation: keep only citation keys that exist; drop factual paragraphs with none.
      let dropped = 0;
      const blocks: AnswerBlock[] = [];
      for (const p of out.paragraphs) {
        const keys = [...new Set(p.citations.map((k) => k.trim().toUpperCase()))].filter((k) => cites.has(k));
        if (keys.length === 0 && !out.insufficient_evidence) {
          dropped++;
          continue;
        }
        blocks.push({ text: p.text.replace(/\s*\[(C\d+)\]/g, (m, k: string) => (cites.has(k) ? m : "")), citationKeys: keys });
      }
      const caveats = [...base.caveats];
      if (dropped) caveats.push(`${dropped} part(s) of the generated answer were removed because they did not cite a knowledge-base record.`);
      if (out.insufficient_evidence) caveats.push("The knowledge base does not fully answer this question.");
      answer = {
        ...base,
        caveats,
        mode: "llm",
        blocks: blocks.length ? blocks : retrievalOnly(found, cites),
        citations: [...new Set(blocks.flatMap((b) => b.citationKeys))].map((k) => cites.get(k)!),
      };
      if (!blocks.length) answer.mode = "retrieval_only";
    } catch (err) {
      const reason = err instanceof LlmUnavailableError ? err.message : "The language model failed.";
      const blocks = retrievalOnly(found, cites);
      answer = { ...base, mode: "retrieval_only", blocks, citations: [...new Set(blocks.flatMap((b) => b.citationKeys))].map((k) => cites.get(k)!), degradedReason: reason };
    }
  } else {
    const blocks = retrievalOnly(found, cites);
    answer = { ...base, mode: "retrieval_only", blocks, citations: [...new Set(blocks.flatMap((b) => b.citationKeys))].map((k) => cites.get(k)!) };
  }

  const [row] = await db
    .insert(assistantQueries)
    .values({ userId: actor.id, question, mode: answer.mode, retrievedEntryIds: found.map((f) => f.id), answer })
    .returning({ id: assistantQueries.id });
  return { ...answer, id: row!.id };
}

export async function assistantHistory(actor: Actor, limit = 20) {
  assertSignedIn(actor);
  const rows = await db
    .select()
    .from(assistantQueries)
    .where(eq(assistantQueries.userId, actor.id))
    .orderBy(desc(assistantQueries.createdAt))
    .limit(limit);
  return rows.map((r) => ({ id: r.id, question: r.question, createdAt: r.createdAt, answer: r.answer as AssistantAnswer }));
}

export async function clearAssistantHistory(actor: Actor) {
  assertSignedIn(actor);
  await db.delete(assistantQueries).where(eq(assistantQueries.userId, actor.id));
}
