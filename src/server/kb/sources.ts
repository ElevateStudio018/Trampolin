import { and, asc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db, type DbOrTx } from "@/db";
import { claimSources, claims, entries, entryRevisions, sources } from "@/db/schema";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { normalizeUrl } from "@/lib/text";
import { type Actor, assertRole } from "@/server/actor";
import { audit } from "@/server/audit";

export const sourceInputSchema = z.object({
  url: z
    .string()
    .trim()
    .url("Enter a full URL")
    .refine((u) => /^https?:\/\//i.test(u), "Only http(s) URLs"),
  title: z.string().trim().min(2).max(300),
  publisher: z.string().trim().max(200).default(""),
  reliability: z.enum(["primary", "secondary", "community", "unknown"]).default("unknown"),
  publishedAt: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  retrievalMethod: z.string().trim().max(120).default("manual reviewer entry"),
  notes: z.string().trim().max(1000).default(""),
});
export type SourceInput = z.input<typeof sourceInputSchema>;

/** Idempotent: the same URL (after normalisation) always maps to one source row. */
export async function upsertSource(input: SourceInput, tx: DbOrTx = db) {
  const parsed = sourceInputSchema.safeParse(input);
  if (!parsed.success) throw new ValidationError("Invalid source", z.flattenError(parsed.error).fieldErrors);
  const data = parsed.data;
  const normalizedUrl = normalizeUrl(data.url);
  const [row] = await tx
    .insert(sources)
    .values({ ...data, publishedAt: data.publishedAt ?? null, normalizedUrl })
    .onConflictDoUpdate({
      target: sources.normalizedUrl,
      // Keep the original record; only fill in a missing publisher.
      set: { publisher: sql`case when ${sources.publisher} = '' then excluded.publisher else ${sources.publisher} end` },
    })
    .returning();
  return row!;
}

export const claimInputSchema = z.object({
  statement: z.string().trim().min(5).max(800),
  status: z.enum(["supported", "limited", "disputed", "unsupported"]),
  citations: z
    .array(
      z.object({
        sourceId: z.string().uuid(),
        stance: z.enum(["supports", "contradicts", "context"]).default("supports"),
        excerpt: z.string().trim().max(1500).default(""),
      }),
    )
    .max(10)
    .default([]),
});
export type ClaimInput = z.input<typeof claimInputSchema>;

/**
 * Adds a claim to an entry. A claim marked "supported" or "limited" must cite at least
 * one supporting source — the platform never stores an uncited claim as supported.
 */
export async function addClaim(entryId: string, input: ClaimInput, actor: Actor, tx?: DbOrTx, opts: { recordRevision?: boolean } = {}) {
  assertRole(actor, "reviewer");
  const parsed = claimInputSchema.safeParse(input);
  if (!parsed.success) throw new ValidationError("Invalid claim", z.flattenError(parsed.error).fieldErrors);
  const data = parsed.data;
  const supporting = data.citations.filter((c) => c.stance === "supports");
  if ((data.status === "supported" || data.status === "limited") && supporting.length === 0)
    throw new ValidationError("A supported claim needs at least one supporting source.");
  const run = async (t: DbOrTx) => {
    const [entry] = await t.select({ id: entries.id }).from(entries).where(eq(entries.id, entryId));
    if (!entry) throw new NotFoundError("Entry not found");
    const [{ next }] = (await t.execute<{ next: number }>(sql`select coalesce(max(sort_order), -1)::int + 1 as next from claims where entry_id = ${entryId}`))
      .rows as [{ next: number }];
    const [claim] = await t.insert(claims).values({ entryId, statement: data.statement, status: data.status, sortOrder: next }).returning();
    if (data.citations.length)
      await t
        .insert(claimSources)
        .values(data.citations.map((c) => ({ claimId: claim!.id, sourceId: c.sourceId, stance: c.stance, excerpt: c.excerpt })))
        .onConflictDoNothing();
    if (opts.recordRevision) {
      const [e] = await t
        .update(entries)
        .set({ revision: sql`${entries.revision} + 1`, updatedAt: new Date() })
        .where(eq(entries.id, entryId))
        .returning();
      await t.insert(entryRevisions).values({
        entryId,
        revision: e!.revision,
        snapshot: { addedClaim: { statement: data.statement, status: data.status, citations: data.citations } },
        changeSummary: `Added claim: ${data.statement.slice(0, 80)}`,
        authorId: actor.id,
      });
    }
    await audit(actor.id, "claim.add", "entry", entryId, { claimId: claim!.id }, t);
    return claim!;
  };
  return tx ? run(tx) : db.transaction(run);
}

export async function removeClaim(claimId: string, actor: Actor) {
  assertRole(actor, "reviewer");
  return db.transaction(async (tx) => {
    const [c] = await tx.delete(claims).where(eq(claims.id, claimId)).returning();
    if (!c) throw new NotFoundError("Claim not found");
    const [e] = await tx
      .update(entries)
      .set({ revision: sql`${entries.revision} + 1`, updatedAt: new Date() })
      .where(eq(entries.id, c.entryId))
      .returning();
    await tx.insert(entryRevisions).values({
      entryId: c.entryId,
      revision: e!.revision,
      snapshot: { removedClaim: { statement: c.statement, status: c.status } },
      changeSummary: `Removed claim: ${c.statement.slice(0, 80)}`,
      authorId: actor.id,
    });
    await audit(actor.id, "claim.remove", "entry", c.entryId, { claimId }, tx);
  });
}

export async function listSources(actor: Actor) {
  assertRole(actor, "reviewer");
  return db
    .select({
      id: sources.id,
      url: sources.url,
      title: sources.title,
      publisher: sources.publisher,
      reliability: sources.reliability,
      retrievalMethod: sources.retrievalMethod,
      accessedAt: sources.accessedAt,
      citations: sql<number>`(select count(*)::int from claim_sources cs where cs.source_id = ${sources.id})`,
    })
    .from(sources)
    .orderBy(asc(sources.title));
}

export async function getSource(sourceId: string) {
  const [s] = await db.select().from(sources).where(eq(sources.id, sourceId));
  if (!s) return null;
  const cited = await db
    .select({ statement: claims.statement, entrySlug: entries.slug, entryName: entries.canonicalName, stance: claimSources.stance, excerpt: claimSources.excerpt })
    .from(claimSources)
    .innerJoin(claims, eq(claims.id, claimSources.claimId))
    .innerJoin(entries, and(eq(entries.id, claims.entryId), eq(entries.state, "published")))
    .where(eq(claimSources.sourceId, sourceId));
  return { ...s, cited };
}
