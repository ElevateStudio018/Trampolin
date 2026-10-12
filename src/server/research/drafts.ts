import { createHash } from "node:crypto";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { entries, entryAliases, entryRevisions, profiles, researchDrafts, sources, type DraftPayload } from "@/db/schema";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/errors";
import { normalizeName } from "@/lib/text";
import { type Actor, assertRole, assertSignedIn } from "@/server/actor";
import { audit } from "@/server/audit";
import { createEntry, findPossibleDuplicates, setEntryState, EVIDENCE_STATUSES } from "@/server/kb/entries";
import { addClaim, upsertSource } from "@/server/kb/sources";
import { rateLimit } from "@/server/ratelimit";

export type ReviewStatus = "pending_review" | "approved" | "rejected" | "needs_more_sources" | "conflicting_information";
const OPEN_STATUSES: ReviewStatus[] = ["pending_review", "needs_more_sources", "conflicting_information"];

function contentHash(topic: string, entryId: string | null, payload: DraftPayload) {
  const canonical = JSON.stringify({
    t: normalizeName(topic),
    e: entryId,
    s: payload.summary,
    c: payload.claims.map((c) => [c.statement, c.sourceRefs.map((r) => r.sourceId).sort()]),
    a: [...payload.aliases].sort(),
  });
  return createHash("sha256").update(canonical).digest("hex");
}

/** Stores a draft unless an identical one already exists (idempotent across job retries). */
export async function saveDraft(input: {
  jobId: string | null;
  entryId: string | null;
  topic: string;
  payload: DraftPayload;
  status: ReviewStatus;
  possibleDuplicateOf?: string | null;
}) {
  if (input.status === "approved") throw new Error("Drafts can never be created pre-approved");
  const hash = contentHash(input.topic, input.entryId, input.payload);
  const [row] = await db
    .insert(researchDrafts)
    .values({
      jobId: input.jobId,
      entryId: input.entryId,
      topic: input.topic,
      normalizedTopic: normalizeName(input.topic),
      payload: input.payload,
      contentHash: hash,
      status: input.status,
      possibleDuplicateOf: input.possibleDuplicateOf ?? null,
    })
    .onConflictDoNothing()
    .returning();
  if (row) return { draft: row, created: true };
  const [existing] = await db.select().from(researchDrafts).where(eq(researchDrafts.contentHash, hash));
  return { draft: existing!, created: false };
}

export async function listDrafts(actor: Actor, status?: ReviewStatus | "open") {
  assertRole(actor, "reviewer");
  const where =
    status === "open" || !status ? inArray(researchDrafts.status, OPEN_STATUSES) : eq(researchDrafts.status, status);
  return db
    .select({
      id: researchDrafts.id,
      topic: researchDrafts.topic,
      status: researchDrafts.status,
      createdAt: researchDrafts.createdAt,
      entryName: entries.canonicalName,
      entrySlug: entries.slug,
      extractor: sql<string>`${researchDrafts.payload}->>'extractor'`,
      claimCount: sql<number>`jsonb_array_length(${researchDrafts.payload}->'claims')`,
      possibleDuplicateOf: researchDrafts.possibleDuplicateOf,
    })
    .from(researchDrafts)
    .leftJoin(entries, eq(entries.id, researchDrafts.entryId))
    .where(where)
    .orderBy(desc(researchDrafts.createdAt))
    .limit(100);
}

export async function draftCounts() {
  const res = await db.execute<{ status: ReviewStatus; n: number }>(sql`select status, count(*)::int as n from research_drafts group by status`);
  return Object.fromEntries(res.rows.map((r) => [r.status, r.n])) as Partial<Record<ReviewStatus, number>>;
}

export async function getDraft(actor: Actor, id: string) {
  assertRole(actor, "reviewer");
  const [d] = await db.select().from(researchDrafts).where(eq(researchDrafts.id, id));
  if (!d) return null;
  const sourceIds = [...new Set(d.payload.claims.flatMap((c) => c.sourceRefs.map((r) => r.sourceId)))];
  const srcRows = sourceIds.length ? await db.select().from(sources).where(inArray(sources.id, sourceIds)) : [];
  const [target] = d.entryId ? await db.select({ id: entries.id, slug: entries.slug, name: entries.canonicalName }).from(entries).where(eq(entries.id, d.entryId)) : [];
  const [dupe] = d.possibleDuplicateOf
    ? await db.select({ id: entries.id, slug: entries.slug, name: entries.canonicalName }).from(entries).where(eq(entries.id, d.possibleDuplicateOf))
    : [];
  const [reviewer] = d.reviewedBy ? await db.select({ name: profiles.displayName }).from(profiles).where(eq(profiles.userId, d.reviewedBy)) : [];
  return { ...d, sources: Object.fromEntries(srcRows.map((s) => [s.id, s])), target: target ?? null, duplicate: dupe ?? null, reviewerName: reviewer?.name ?? null };
}

export const reviewSchema = z.object({
  decision: z.enum(["approved", "rejected", "needs_more_sources", "conflicting_information"]),
  note: z.string().trim().max(2000).default(""),
  /** Indexes of claims to import on approval. Unsupported claims are never imported. */
  claimIndexes: z.array(z.number().int().min(0)).default([]),
  evidenceStatus: z.enum(EVIDENCE_STATUSES).optional(),
  publish: z.boolean().default(false),
  /** Merge into this entry instead of creating a new one (resolves duplicates). */
  mergeIntoEntryId: z.string().uuid().optional().nullable(),
});

/**
 * Applies a reviewer decision. Approval is the only path by which research output
 * reaches the knowledge base, and it only imports claims that carry supporting sources.
 */
export async function reviewDraft(actor: Actor, draftId: string, input: z.input<typeof reviewSchema>) {
  assertRole(actor, "reviewer");
  const parsed = reviewSchema.safeParse(input);
  if (!parsed.success) throw new ValidationError("Invalid review", z.flattenError(parsed.error).fieldErrors);
  const r = parsed.data;
  if (r.decision !== "approved" && r.decision !== "needs_more_sources" && !r.note) {
    throw new ValidationError("Add a note explaining the decision", { note: ["Required"] });
  }

  return db.transaction(async (tx) => {
    const [d] = await tx.select().from(researchDrafts).where(eq(researchDrafts.id, draftId)).for("update");
    if (!d) throw new NotFoundError("Draft not found");
    if (d.status === "approved" || d.status === "rejected") throw new ConflictError(`This draft was already ${d.status}.`);

    let appliedEntryId: string | null = null;
    if (r.decision === "approved") {
      const chosen = r.claimIndexes.map((i) => d.payload.claims[i]).filter((c): c is NonNullable<typeof c> => Boolean(c));
      const importable = chosen.filter((c) => c.sourceRefs.some((ref) => ref.stance === "supports"));
      if (importable.length === 0) throw new ValidationError("Select at least one claim that has a supporting source.");

      let entryId = r.mergeIntoEntryId ?? d.entryId;
      if (!entryId) {
        if (d.possibleDuplicateOf && !r.mergeIntoEntryId && !r.note.toLowerCase().includes("not a duplicate")) {
          throw new ValidationError("This draft may duplicate an existing entry. Merge it into that entry, or explain “not a duplicate” in the note.");
        }
        const created = await createEntry(
          {
            canonicalName: d.payload.canonicalName || d.topic,
            summary: d.payload.summary || importable[0]!.statement.slice(0, 600),
            aliases: d.payload.aliases,
            evidenceStatus: r.evidenceStatus ?? "limited_evidence",
          },
          actor,
          { tx, changeSummary: `Created from research draft ${d.id}` },
        );
        entryId = created.id;
      } else {
        // Add new aliases that don't already belong to some entry.
        for (const alias of d.payload.aliases) {
          const n = normalizeName(alias);
          if (!n) continue;
          const clash = await findPossibleDuplicates([alias], undefined, tx);
          if (clash.some((c) => c.match === "exact")) continue;
          await tx.insert(entryAliases).values({ entryId, alias, normalizedAlias: n }).onConflictDoNothing();
        }
        await tx.execute(sql`update entries set search_names = (
            select concat_ws(' | ', e.normalized_name, string_agg(a.normalized_alias, ' | '))
            from entries e left join entry_aliases a on a.entry_id = e.id where e.id = ${entryId} group by e.normalized_name)
          where id = ${entryId}`);
        if (r.evidenceStatus) await tx.update(entries).set({ evidenceStatus: r.evidenceStatus }).where(eq(entries.id, entryId));
      }

      for (const c of importable) {
        await addClaim(
          entryId,
          {
            statement: c.statement,
            status: c.sourceRefs.some((x) => x.stance === "contradicts") ? "disputed" : "limited",
            citations: c.sourceRefs.map((x) => ({ sourceId: x.sourceId, excerpt: x.excerpt, stance: x.stance })),
          },
          actor,
          tx,
        );
      }
      const [e] = await tx
        .update(entries)
        .set({ revision: sql`${entries.revision} + 1`, updatedAt: new Date(), lastReviewedAt: new Date() })
        .where(eq(entries.id, entryId))
        .returning();
      await tx.insert(entryRevisions).values({
        entryId,
        revision: e!.revision,
        snapshot: { appliedDraft: d.id, claims: importable.map((c) => c.statement) },
        changeSummary: `Applied ${importable.length} claim(s) from research draft`,
        authorId: actor.id,
      });
      if (r.publish) await setEntryState(entryId, "published", actor, tx);
      appliedEntryId = entryId;
    }

    await tx
      .update(researchDrafts)
      .set({ status: r.decision, reviewNote: r.note, reviewedBy: actor.id, reviewedAt: new Date(), entryId: d.entryId ?? appliedEntryId })
      .where(eq(researchDrafts.id, draftId));
    await audit(actor.id, `draft.${r.decision}`, "research_draft", draftId, { appliedEntryId }, tx);
    return { appliedEntryId };
  });
}

// ---------------------------------------------------------------------------
// Community suggestions: members propose facts; they enter the same review queue.
// ---------------------------------------------------------------------------

export const suggestionSchema = z.object({
  topic: z.string().trim().min(2, "Name the skill or term").max(80),
  entryId: z.string().uuid().optional().nullable(),
  statement: z.string().trim().min(10, "Describe the fact in a sentence").max(800),
  sourceUrl: z.string().trim().url("Enter a full URL").optional().or(z.literal("")),
  sourceTitle: z.string().trim().max(300).optional().default(""),
  aliases: z.string().trim().max(300).optional().default(""),
});

export async function submitSuggestion(actor: Actor, input: z.input<typeof suggestionSchema>) {
  assertSignedIn(actor);
  await rateLimit(`suggest:${actor.id}`, 10, 3600);
  const parsed = suggestionSchema.safeParse(input);
  if (!parsed.success) throw new ValidationError("Please fix the highlighted fields", z.flattenError(parsed.error).fieldErrors);
  const s = parsed.data;
  let sourceRefs: DraftPayload["claims"][number]["sourceRefs"] = [];
  if (s.sourceUrl) {
    const src = await upsertSource({
      url: s.sourceUrl,
      title: s.sourceTitle || s.sourceUrl,
      reliability: "unknown",
      retrievalMethod: "submitted by a member (not yet checked)",
    });
    sourceRefs = [{ sourceId: src.id, excerpt: "", stance: "supports" }];
  }
  const dupes = s.entryId ? [] : await findPossibleDuplicates([s.topic]);
  if (s.entryId) {
    const [e] = await db.select({ id: entries.id }).from(entries).where(and(eq(entries.id, s.entryId), eq(entries.state, "published")));
    if (!e) throw new ValidationError("Unknown entry");
  }
  const payload: DraftPayload = {
    canonicalName: s.topic,
    summary: "",
    aliases: s.aliases
      .split(",")
      .map((a) => a.trim())
      .filter(Boolean)
      .slice(0, 10),
    claims: [{ statement: s.statement, sourceRefs, flag: sourceRefs.length ? undefined : "unsupported" }],
    unresolvedQuestions: [
      `Community suggestion from @${actor.handle}. ${sourceRefs.length ? "Check that the linked source actually supports the statement." : "No source was given; find one before approving."}`,
    ],
    extractor: "community",
  };
  const res = await saveDraft({
    jobId: null,
    entryId: s.entryId ?? (dupes[0]?.match === "exact" ? dupes[0].entryId : null),
    topic: s.topic,
    payload,
    status: sourceRefs.length ? "pending_review" : "needs_more_sources",
    possibleDuplicateOf: !s.entryId && dupes[0] ? dupes[0].entryId : null,
  });
  await audit(actor.id, "suggestion.submit", "research_draft", res.draft.id);
  return res.draft;
}
