import { z } from "zod";
import type { DraftClaim } from "@/db/schema";
import { normalizeName, trigramSimilarity, truncate } from "@/lib/text";
import { generateStructured, llmConfigured } from "@/server/llm/client";

export type SourceDoc = { sourceId: string; url: string; title: string; text: string };
export type ExtractInput = { topic: string; aliases: string[]; documents: SourceDoc[] };
export type ExtractOutput = {
  summary: string;
  claims: DraftClaim[];
  aliasesFound: string[];
  unresolvedQuestions: string[];
  extractor: string;
};

// ---------------------------------------------------------------------------
// Sentence utilities
// ---------------------------------------------------------------------------

export function splitSentences(text: string): string[] {
  return text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+(?=[A-Z0-9“"(])|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 25 && s.length <= 400);
}

function mentions(sentence: string, terms: string[]): boolean {
  const n = ` ${normalizeName(sentence)} `;
  return terms.some((t) => t && n.includes(` ${t} `));
}

const DEFINITION_CUES = /\b(is|are|means|refers to|consists of|known as|called|defined as)\b/i;
const DOMAIN_CUES = /\b(somersault|twist|salto|rotation|landing|tuck|pike|straight|straddle|bounce|routine|trampoline|feet|back|front)\b/i;

function scoreSentence(s: string) {
  return (DEFINITION_CUES.test(s) ? 2 : 0) + (DOMAIN_CUES.test(s) ? 2 : 0) + (s.length < 220 ? 1 : 0);
}

/** "X, also known as Y" / "Y (or X)" style alias mentions next to the topic. */
export function findAliases(text: string, topic: string): string[] {
  const out = new Set<string>();
  const t = topic.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp(`${t}[^.]{0,90}?\\b(?:also known as|also called|aka)\\s+(?:an?\\s+|the\\s+)?["“']?([A-Z][\\w’'-]+(?:\\s[\\w’'-]+){0,3})`, "gi"),
    new RegExp(`${t}\\s*\\((?:or\\s+|aka\\s+)?["“']?([A-Z][\\w’'-]+(?:\\s[\\w’'-]+){0,2})["”']?\\)`, "gi"),
  ];
  for (const re of patterns) for (const m of text.matchAll(re)) if (m[1] && normalizeName(m[1]) !== normalizeName(topic)) out.add(m[1].trim().replace(/[”"']$/, ""));
  return [...out].slice(0, 8);
}

// ---------------------------------------------------------------------------
// Conflict detection: compares numeric rotation/twist statements across sources.
// ---------------------------------------------------------------------------

const NUM_WORDS: Record<string, number> = { a: 1, one: 1, single: 1, two: 2, double: 2, three: 3, triple: 3, four: 4, quadruple: 4 };

function parseAmount(raw: string): number | null {
  const s = raw.toLowerCase().trim();
  const frac = s.match(/^(\d+)?\s*(½|1\/2|and a half)$/);
  if (/^(half|a half|½|1\/2)$/.test(s)) return 0.5;
  if (frac) return Number(frac[1] ?? 0) + 0.5;
  const words = s.match(/^(a|one|two|three|four|single|double|triple)(?: and a half)?$/);
  if (words) return NUM_WORDS[words[1]!]! + (s.includes("half") ? 0.5 : 0);
  const n = Number(s.replace("½", ".5"));
  return Number.isFinite(n) ? n : null;
}

/** Extracts the twist count a sentence attributes to the topic, e.g. "one and a half twists" -> 1.5. */
export function twistCount(sentence: string): number | null {
  const m = sentence.match(/\b((?:\d+\s*)?(?:½|1\/2)|\d+(?:\.5)?|half|a half|(?:a|one|two|three|four)(?: and a half)?)[\s-]+(?:full\s+)?twists?\b/i);
  if (!m) return null;
  return parseAmount(m[1]!);
}

export function detectConflicts(claims: DraftClaim[]): { conflicting: boolean; questions: string[] } {
  const counts = new Map<number, string[]>();
  for (const c of claims) {
    const n = twistCount(c.statement);
    if (n === null) continue;
    const sources = c.sourceRefs.map((r) => r.sourceId);
    counts.set(n, [...(counts.get(n) ?? []), ...sources]);
  }
  if (counts.size <= 1) return { conflicting: false, questions: [] };
  const desc = [...counts.entries()].map(([n, s]) => `${n} twist${n === 1 ? "" : "s"} (${new Set(s).size} source${new Set(s).size === 1 ? "" : "s"})`).join(" vs ");
  return { conflicting: true, questions: [`Sources disagree on the amount of twist: ${desc}. Check a primary source before approving.`] };
}

// ---------------------------------------------------------------------------
// Extractor 1: deterministic excerpt extraction (no model, always available)
// ---------------------------------------------------------------------------

/**
 * Selects verbatim sentences that mention the topic (or an alias) from each document.
 * Claims are the sentences themselves, so every claim is a direct quote of its source.
 * Near-identical sentences from different documents are merged into one claim with
 * several citations — note that agreement may come from copying, not independence.
 */
export function excerptExtract(input: ExtractInput): ExtractOutput {
  const terms = [input.topic, ...input.aliases].map(normalizeName).filter(Boolean);
  const claims: DraftClaim[] = [];
  const aliasesFound = new Set<string>();
  for (const doc of input.documents) {
    for (const a of findAliases(doc.text, input.topic)) aliasesFound.add(a);
    const picked = splitSentences(doc.text)
      .filter((s) => mentions(s, terms))
      .map((s) => ({ s, score: scoreSentence(s) }))
      .filter((x) => x.score >= 2)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);
    for (const { s } of picked) {
      // Merge only near-identical sentences that state the same quantities; merging
      // "one and a half twists" with "two and a half twists" would hide a conflict.
      const existing = claims.find((c) => trigramSimilarity(c.statement, s) > 0.8 && quantities(c.statement) === quantities(s));
      if (existing) {
        if (!existing.sourceRefs.some((r) => r.sourceId === doc.sourceId)) existing.sourceRefs.push({ sourceId: doc.sourceId, excerpt: s, stance: "supports" });
      } else {
        claims.push({ statement: s, sourceRefs: [{ sourceId: doc.sourceId, excerpt: s, stance: "supports" }] });
      }
    }
  }
  const unresolved: string[] = [];
  if (claims.length === 0) unresolved.push(`No sentence in the fetched sources mentions “${input.topic}” in a definitional way.`);
  const independentHosts = new Set(input.documents.map((d) => safeHost(d.url)));
  if (claims.length > 0 && independentHosts.size < 2) unresolved.push("Only one website supports these claims; look for an independent source.");
  const best = claims[0]?.statement ?? "";
  return {
    summary: best ? truncate(best, 300) : "",
    claims,
    aliasesFound: [...aliasesFound],
    unresolvedQuestions: unresolved,
    extractor: "excerpt-v1",
  };
}

const QUANTITY_WORDS = /\b(\d+(?:\.\d+)?|½|¼|¾|half|quarter|one|two|three|four|five|single|double|triple)\b/gi;
function quantities(s: string) {
  return (s.toLowerCase().match(QUANTITY_WORDS) ?? []).join(",");
}

function safeHost(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

// ---------------------------------------------------------------------------
// Extractor 2: language model with verbatim-quote validation
// ---------------------------------------------------------------------------

const llmSchema = z.object({
  summary: z.string().describe("One or two neutral sentences summarising only what the documents support. Empty if nothing relevant."),
  aliases: z.array(z.string()).describe("Alternative names for the topic that appear in the documents."),
  claims: z.array(
    z.object({
      statement: z.string().describe("One atomic factual statement about the topic."),
      evidence: z.array(
        z.object({
          doc: z.number().int().describe("Index of the supporting document, as numbered in the prompt."),
          quote: z.string().describe("An exact, verbatim quote (5-60 words) copied from that document."),
          stance: z.enum(["supports", "contradicts"]),
        }),
      ),
    }),
  ),
  open_questions: z.array(z.string()).describe("Contradictions or gaps a human reviewer should resolve."),
});

const SYSTEM = `You extract facts about trampoline gymnastics terminology from source documents for a knowledge base that human reviewers verify.
Rules:
- Use ONLY the provided documents. Never add knowledge of your own.
- Every claim must cite at least one document with an exact verbatim quote copied character-for-character.
- If documents disagree, record each version as a separate claim and add an open question.
- Do not describe how to perform skills or give training or safety advice; only definitions, naming and rules.
- If the documents do not discuss the topic, return empty arrays.`;

function normalizeForQuote(s: string) {
  return s.replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/\s+/g, " ").trim().toLowerCase();
}

export async function llmExtract(input: ExtractInput, userId: string | null): Promise<ExtractOutput> {
  const docs = input.documents.map((d, i) => `<document index="${i}" title="${d.title.replace(/"/g, "'")}" url="${d.url}">\n${truncate(d.text, 12_000)}\n</document>`).join("\n\n");
  const out = await generateStructured({
    feature: "research",
    userId,
    system: SYSTEM,
    prompt: `Topic: ${input.topic}\nKnown aliases: ${input.aliases.join(", ") || "none"}\n\n${docs}`,
    schema: llmSchema,
    maxTokens: 6000,
  });

  // Validation: a quote must literally occur in the document it cites, otherwise the
  // citation is dropped; a claim left with no valid support is flagged unsupported.
  const claims: DraftClaim[] = out.claims.map((c) => {
    const refs = c.evidence
      .filter((e) => {
        const doc = input.documents[e.doc];
        return doc && e.quote.trim().length >= 10 && normalizeForQuote(doc.text).includes(normalizeForQuote(e.quote));
      })
      .map((e) => ({ sourceId: input.documents[e.doc]!.sourceId, excerpt: e.quote.trim(), stance: e.stance }));
    return { statement: c.statement, sourceRefs: refs, flag: refs.some((r) => r.stance === "supports") ? undefined : ("unsupported" as const) };
  });
  const dropped = out.claims.reduce((n, c) => n + c.evidence.length, 0) - claims.reduce((n, c) => n + c.sourceRefs.length, 0);
  const unresolved = [...out.open_questions];
  if (dropped > 0) unresolved.push(`${dropped} citation(s) proposed by the model were discarded because the quote was not found verbatim in the source.`);
  return {
    summary: claims.some((c) => !c.flag) ? out.summary : "",
    claims,
    aliasesFound: out.aliases.filter((a) => input.documents.some((d) => normalizeName(d.text).includes(normalizeName(a)))),
    unresolvedQuestions: unresolved,
    extractor: "llm",
  };
}

/** Uses the model when configured, falling back to excerpt extraction on any model failure. */
export async function extract(input: ExtractInput, userId: string | null, log: (m: string) => void): Promise<ExtractOutput> {
  if (llmConfigured()) {
    try {
      return await llmExtract(input, userId);
    } catch (err) {
      log(`Model extraction unavailable (${err instanceof Error ? err.message : "error"}); falling back to excerpt extraction.`);
    }
  } else {
    log("No language model configured; using excerpt extraction (verbatim sentences only).");
  }
  return excerptExtract(input);
}
