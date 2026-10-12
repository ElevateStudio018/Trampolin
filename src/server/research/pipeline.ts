import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { entries, entryAliases, jobs } from "@/db/schema";
import { ValidationError } from "@/lib/errors";
import { normalizeName, normalizeUrl } from "@/lib/text";
import { type Actor, assertRole } from "@/server/actor";
import { findPossibleDuplicates } from "@/server/kb/entries";
import { upsertSource } from "@/server/kb/sources";
import { appendLog, enqueue, finishJob, line, type JobRow, type LogLine } from "@/server/jobs/queue";
import { detectConflicts, extract, type SourceDoc } from "./extract";
import { FetchBlockedError, fetchDocument } from "./fetcher";
import { getSearchProvider } from "./search-providers";
import { saveDraft, type ReviewStatus } from "./drafts";

const MAX_SOURCES_PER_JOB = 5;

// ---------------------------------------------------------------------------
// Gap analysis
// ---------------------------------------------------------------------------

export type Gap = { entryId: string; name: string; slug: string; reasons: string[] };

/**
 * Finds entries that most need research: unsourced drafts, entries with no supporting
 * claims, entries backed by a single publisher, conflicting entries and stale reviews.
 */
export async function findGaps(limit = 25): Promise<Gap[]> {
  const res = await db.execute<{ id: string; name: string; slug: string; state: string; evidence_status: string; supported: number; publishers: number; stale: boolean }>(sql`
    select e.id, e.canonical_name as name, e.slug, e.state, e.evidence_status,
      count(cs.source_id) filter (where cs.stance = 'supports')::int as supported,
      count(distinct nullif(s.publisher, ''))::int as publishers,
      (e.last_reviewed_at is null or e.last_reviewed_at < now() - interval '365 days') as stale
    from entries e
    left join claims c on c.entry_id = e.id
    left join claim_sources cs on cs.claim_id = c.id
    left join sources s on s.id = cs.source_id
    where e.state <> 'archived'
    group by e.id
    order by e.canonical_name`);
  const gaps: Gap[] = [];
  for (const r of res.rows) {
    const reasons: string[] = [];
    if (r.evidence_status === "ai_draft") reasons.push("Unreviewed draft");
    if (Number(r.supported) === 0) reasons.push("No supporting sources");
    else if (Number(r.publishers) < 2) reasons.push("Only one publisher");
    if (r.evidence_status === "conflicting") reasons.push("Sources conflict");
    if (r.stale) reasons.push("Not reviewed in the last year");
    if (reasons.length) gaps.push({ entryId: r.id, name: r.name, slug: r.slug, reasons });
  }
  const weight = (g: Gap) => (g.reasons.includes("No supporting sources") ? 3 : 0) + (g.reasons.includes("Sources conflict") ? 2 : 0) + g.reasons.length;
  return gaps.sort((a, b) => weight(b) - weight(a)).slice(0, limit);
}

export async function enqueueGapScan(actorId: string | null, reason: "manual" | "scheduled") {
  const day = new Date().toISOString().slice(0, 10);
  const key = reason === "scheduled" ? `research.gap_scan:${day}` : `research.gap_scan:manual`;
  if (reason === "scheduled") {
    // One scheduled scan per day, even after the previous one finished.
    const [done] = await db.select({ id: jobs.id }).from(jobs).where(and(eq(jobs.dedupeKey, key)));
    if (done) return { job: null, created: false };
  }
  return enqueue("research.gap_scan", { reason }, key, actorId);
}

// ---------------------------------------------------------------------------
// Manual research requests from reviewers
// ---------------------------------------------------------------------------

export const researchRequestSchema = z.object({
  entryId: z.string().uuid().optional().nullable(),
  topic: z.string().trim().max(80).optional().default(""),
  urls: z.array(z.string().trim().url()).max(MAX_SOURCES_PER_JOB).default([]),
  /** Text pasted by a reviewer for pages the server cannot fetch (paywalled, PDF, blocked). */
  pasted: z
    .array(z.object({ url: z.string().trim().url(), title: z.string().trim().min(2).max(300), text: z.string().trim().min(40).max(20_000) }))
    .max(3)
    .default([]),
});

export async function requestResearch(actor: Actor, input: z.input<typeof researchRequestSchema>) {
  assertRole(actor, "reviewer");
  const parsed = researchRequestSchema.safeParse(input);
  if (!parsed.success) throw new ValidationError("Invalid research request", z.flattenError(parsed.error).fieldErrors);
  const r = parsed.data;
  let topic = r.topic;
  if (r.entryId) {
    const [e] = await db.select({ name: entries.canonicalName }).from(entries).where(eq(entries.id, r.entryId));
    if (!e) throw new ValidationError("Unknown entry");
    topic = e.name;
  }
  if (!topic) throw new ValidationError("Choose an entry or name a topic", { topic: ["Required"] });
  const key = `research.entry:${r.entryId ?? normalizeName(topic)}:${[...r.urls, ...r.pasted.map((p) => p.url)].map(normalizeUrl).sort().join(",")}`;
  return enqueue("research.entry", { entryId: r.entryId ?? null, topic, urls: r.urls, pasted: r.pasted }, key, actor.id);
}

// ---------------------------------------------------------------------------
// Job handlers
// ---------------------------------------------------------------------------

export async function runGapScan(job: JobRow) {
  const gaps = await findGaps(10);
  const log: LogLine[] = [line("info", `Found ${gaps.length} entries needing research.`)];
  if (!getSearchProvider()) {
    // Without web search an automatic job could only end up blocked; list the gaps for manual research instead.
    log.push(line("warn", "No web search provider configured: gaps are listed for manual research, no jobs queued."));
    for (const g of gaps) log.push(line("info", `${g.name}: ${g.reasons.join(", ")}`));
    await appendLog(job.id, log);
    await finishJob(job.id, "succeeded", { gaps: gaps.length, enqueued: 0 });
    return;
  }
  let enqueued = 0;
  for (const g of gaps) {
    const res = await enqueue("research.entry", { entryId: g.entryId, topic: g.name, urls: [], pasted: [] }, `research.entry:${g.entryId}:`, job.createdBy);
    if (res.created) enqueued++;
    log.push(line("info", `${g.name}: ${g.reasons.join(", ")}${res.created ? " → queued" : " → already queued"}`));
  }
  await appendLog(job.id, log);
  await finishJob(job.id, "succeeded", { gaps: gaps.length, enqueued });
}

type EntryPayload = { entryId: string | null; topic: string; urls: string[]; pasted: { url: string; title: string; text: string }[] };

export async function runEntryResearch(job: JobRow) {
  const p = job.payload as EntryPayload;
  const logs: LogLine[] = [];
  const log = (m: string, level: LogLine["level"] = "info") => logs.push(line(level, m));
  try {
    const aliases = p.entryId
      ? (await db.select({ alias: entryAliases.alias }).from(entryAliases).where(eq(entryAliases.entryId, p.entryId))).map((a) => a.alias)
      : [];

    // 1. Candidate URLs: reviewer-supplied first, then search results.
    const candidates = new Map<string, { url: string; title: string }>();
    for (const u of p.urls) candidates.set(normalizeUrl(u), { url: u, title: "" });
    const provider = getSearchProvider();
    const queries = [`${p.topic} trampoline`, ...aliases.slice(0, 2).map((a) => `"${a}" trampoline skill`), `${p.topic} trampolining glossary`];
    if (provider) {
      for (const q of queries) {
        if (candidates.size >= MAX_SOURCES_PER_JOB * 2) break;
        try {
          const results = await provider.search(q, 5);
          log(`Search (${provider.name}) “${q}” → ${results.length} results`);
          for (const r of results) if (!candidates.has(normalizeUrl(r.url))) candidates.set(normalizeUrl(r.url), { url: r.url, title: r.title });
        } catch (err) {
          log(`Search failed for “${q}”: ${err instanceof Error ? err.message : err}`, "warn");
        }
      }
    } else {
      log("No web search provider is configured (SEARCH_PROVIDER/SEARCH_API_KEY); only reviewer-supplied sources are used.", "warn");
    }

    if (candidates.size === 0 && p.pasted.length === 0) {
      log("Nothing to research: no search provider and no sources supplied.", "warn");
      await appendLog(job.id, logs);
      await finishJob(job.id, "blocked", { reason: "no_sources" }, "Blocked: configure a search provider or attach source URLs.");
      return;
    }

    // 2. Fetch and register sources.
    const docs: SourceDoc[] = [];
    for (const c of [...candidates.values()]) {
      if (docs.length >= MAX_SOURCES_PER_JOB) break;
      try {
        const doc = await fetchDocument(c.url);
        if (doc.text.length < 200) {
          log(`Skipped ${c.url}: page had too little text.`, "warn");
          continue;
        }
        const src = await upsertSource({ url: doc.url, title: doc.title || c.title || doc.url, publisher: doc.publisher, retrievalMethod: "automated page fetch" });
        docs.push({ sourceId: src.id, url: doc.url, title: src.title, text: doc.text });
        log(`Fetched ${doc.url} (${doc.text.length.toLocaleString()} chars)`);
      } catch (err) {
        log(`Could not fetch ${c.url}: ${err instanceof Error ? err.message : err}`, err instanceof FetchBlockedError ? "info" : "warn");
      }
    }
    for (const pasted of p.pasted) {
      const src = await upsertSource({ url: pasted.url, title: pasted.title, retrievalMethod: "text pasted by a reviewer" });
      docs.push({ sourceId: src.id, url: pasted.url, title: pasted.title, text: pasted.text });
      log(`Using reviewer-pasted text for ${pasted.url}`);
    }
    if (docs.length === 0) {
      log("No source could be retrieved.", "warn");
      await appendLog(job.id, logs);
      await finishJob(job.id, "blocked", { reason: "fetch_failed" }, "Blocked: none of the sources could be retrieved.");
      return;
    }

    // 3. Extract claims, detect duplicates and conflicts.
    const extracted = await extract({ topic: p.topic, aliases, documents: docs }, job.createdBy, (m) => log(m));
    log(`Extractor ${extracted.extractor}: ${extracted.claims.length} claims, ${extracted.aliasesFound.length} aliases found.`);
    const conflicts = detectConflicts(extracted.claims);
    const dupes = p.entryId ? [] : await findPossibleDuplicates([p.topic, ...extracted.aliasesFound]);
    if (dupes.length) log(`Possible duplicate of existing entry “${dupes[0]!.name}” (${dupes[0]!.match}).`, "warn");
    const unsupported = extracted.claims.filter((c) => c.flag === "unsupported").length;

    let status: ReviewStatus = "pending_review";
    if (conflicts.conflicting) status = "conflicting_information";
    else if (extracted.claims.length - unsupported === 0) status = "needs_more_sources";

    const { draft, created } = await saveDraft({
      jobId: job.id,
      entryId: p.entryId ?? (dupes[0]?.match === "exact" ? dupes[0].entryId : null),
      topic: p.topic,
      status,
      possibleDuplicateOf: !p.entryId && dupes[0] ? dupes[0].entryId : null,
      payload: {
        canonicalName: p.topic,
        summary: extracted.summary,
        aliases: extracted.aliasesFound.filter((a) => !aliases.some((x) => normalizeName(x) === normalizeName(a))),
        claims: extracted.claims.map((c) => (conflicts.conflicting && c.flag !== "unsupported" && /twist|somersault|salto|flip/i.test(c.statement) ? { ...c, flag: "conflict" as const } : c)),
        unresolvedQuestions: [...extracted.unresolvedQuestions, ...conflicts.questions],
        extractor: extracted.extractor,
      },
    });
    log(created ? `Draft saved with status ${status}.` : "An identical draft already exists; nothing new saved.");
    await appendLog(job.id, logs);
    await finishJob(job.id, "succeeded", { draftId: draft.id, created, status, claims: extracted.claims.length });
  } catch (err) {
    log(`Unexpected error: ${err instanceof Error ? err.message : String(err)}`, "error");
    await appendLog(job.id, logs);
    throw err;
  }
}
