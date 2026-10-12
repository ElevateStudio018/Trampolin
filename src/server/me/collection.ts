import { and, asc, desc, eq, ilike, or, sql } from "drizzle-orm";
import { escapeLike } from "@/lib/text";
import { z } from "zod";
import { db } from "@/db";
import { categories, collectionItems, entries, profiles, progressLogs, videos } from "@/db/schema";
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";
import { type Actor, assertSignedIn, hasRole } from "@/server/actor";

export const COLLECTION_STATUSES = ["saved", "working_on", "landed"] as const;
export type CollectionStatus = (typeof COLLECTION_STATUSES)[number];

/** Idempotent save / status change. Only published entries can be collected. */
export async function setCollectionStatus(actor: Actor, entryId: string, status: CollectionStatus) {
  assertSignedIn(actor);
  if (!COLLECTION_STATUSES.includes(status)) throw new ValidationError("Unknown status");
  const [e] = await db.select({ state: entries.state }).from(entries).where(eq(entries.id, entryId));
  if (!e || e.state !== "published") throw new NotFoundError("Entry not found");
  await db
    .insert(collectionItems)
    .values({ userId: actor.id, entryId, status })
    .onConflictDoUpdate({ target: [collectionItems.userId, collectionItems.entryId], set: { status, updatedAt: new Date() } });
}

export async function removeFromCollection(actor: Actor, entryId: string) {
  assertSignedIn(actor);
  await db.delete(collectionItems).where(and(eq(collectionItems.userId, actor.id), eq(collectionItems.entryId, entryId)));
}

export async function collectionStatusFor(actor: Actor, entryId: string): Promise<CollectionStatus | null> {
  if (!actor) return null;
  const [row] = await db
    .select({ status: collectionItems.status })
    .from(collectionItems)
    .where(and(eq(collectionItems.userId, actor.id), eq(collectionItems.entryId, entryId)));
  return row?.status ?? null;
}

/**
 * Lists a user's collection. The owner always sees it; other viewers only when the
 * owner's collectionVisibility allows (members = any signed-in user, public = anyone).
 */
export async function listCollection(actor: Actor, ownerId: string, opts: { status?: CollectionStatus; q?: string } = {}) {
  if (actor?.id !== ownerId) {
    const [p] = await db.select({ v: profiles.collectionVisibility }).from(profiles).where(eq(profiles.userId, ownerId));
    if (!p) throw new NotFoundError("User not found");
    const allowed = p.v === "public" || (p.v === "members" && actor !== null) || hasRole(actor, "admin");
    if (!allowed) throw new ForbiddenError("This collection is private");
  }
  const where = [eq(collectionItems.userId, ownerId), eq(entries.state, "published")];
  if (opts.status) where.push(eq(collectionItems.status, opts.status));
  if (opts.q?.trim()) {
    const like = `%${escapeLike(opts.q.trim())}%`;
    where.push(or(ilike(entries.canonicalName, like), ilike(entries.searchNames, like))!);
  }
  return db
    .select({
      entryId: entries.id,
      slug: entries.slug,
      name: entries.canonicalName,
      summary: entries.summary,
      evidenceStatus: entries.evidenceStatus,
      categoryName: categories.name,
      quarterRotations: entries.quarterRotations,
      halfTwists: entries.halfTwists,
      status: collectionItems.status,
      updatedAt: collectionItems.updatedAt,
      logCount: sql<number>`(select count(*)::int from progress_logs pl where pl.user_id = ${ownerId} and pl.entry_id = ${entries.id})`,
    })
    .from(collectionItems)
    .innerJoin(entries, eq(entries.id, collectionItems.entryId))
    .leftJoin(categories, eq(categories.id, entries.categoryId))
    .where(and(...where))
    .orderBy(desc(collectionItems.updatedAt), asc(entries.canonicalName));
}

export async function collectionSummary(userId: string) {
  const res = await db.execute<{ status: CollectionStatus; n: number }>(
    sql`select status, count(*)::int as n from collection_items where user_id = ${userId} group by status`,
  );
  const counts = { saved: 0, working_on: 0, landed: 0 } as Record<CollectionStatus, number>;
  for (const r of res.rows) counts[r.status] = r.n;
  return counts;
}

// ---------------------------------------------------------------------------
// Progress logs (always private to the owner)
// ---------------------------------------------------------------------------

export const logInputSchema = z.object({
  kind: z.enum(["note", "milestone", "session"]).default("note"),
  title: z.string().trim().min(1, "Give it a title").max(120),
  body: z.string().trim().max(5000).default(""),
  occurredOn: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
    .refine((d) => !Number.isNaN(Date.parse(d)) && Date.parse(d) <= Date.now() + 86400_000, "Date can't be in the future"),
  entryId: z.string().uuid().optional().nullable(),
  videoId: z.string().uuid().optional().nullable(),
});
export type LogInput = z.input<typeof logInputSchema>;

export async function addProgressLog(actor: Actor, input: LogInput) {
  assertSignedIn(actor);
  const parsed = logInputSchema.safeParse(input);
  if (!parsed.success) throw new ValidationError("Please fix the highlighted fields", z.flattenError(parsed.error).fieldErrors);
  const data = parsed.data;
  if (data.videoId) {
    // A log may only reference the actor's own video.
    const [v] = await db.select({ ownerId: videos.ownerId }).from(videos).where(eq(videos.id, data.videoId));
    if (!v || v.ownerId !== actor.id) throw new ForbiddenError("You can only attach your own videos");
  }
  if (data.entryId) {
    const [e] = await db.select({ id: entries.id }).from(entries).where(and(eq(entries.id, data.entryId), eq(entries.state, "published")));
    if (!e) throw new ValidationError("Unknown entry", { entryId: ["Unknown entry"] });
  }
  const [row] = await db
    .insert(progressLogs)
    .values({ ...data, entryId: data.entryId ?? null, videoId: data.videoId ?? null, userId: actor.id })
    .returning();
  return row!;
}

export async function deleteProgressLog(actor: Actor, logId: string) {
  assertSignedIn(actor);
  const res = await db.delete(progressLogs).where(and(eq(progressLogs.id, logId), eq(progressLogs.userId, actor.id))).returning({ id: progressLogs.id });
  if (res.length === 0) throw new NotFoundError("Log not found");
}

/** Owner-only. There is deliberately no way to read another user's logs. */
export async function listProgressLogs(actor: Actor, opts: { entryId?: string; limit?: number } = {}) {
  assertSignedIn(actor);
  const where = [eq(progressLogs.userId, actor.id)];
  if (opts.entryId) where.push(eq(progressLogs.entryId, opts.entryId));
  return db
    .select({
      id: progressLogs.id,
      kind: progressLogs.kind,
      title: progressLogs.title,
      body: progressLogs.body,
      occurredOn: progressLogs.occurredOn,
      entrySlug: entries.slug,
      entryName: entries.canonicalName,
      videoId: progressLogs.videoId,
      videoTitle: videos.title,
    })
    .from(progressLogs)
    .leftJoin(entries, eq(entries.id, progressLogs.entryId))
    .leftJoin(videos, eq(videos.id, progressLogs.videoId))
    .where(and(...where))
    .orderBy(desc(progressLogs.occurredOn), desc(progressLogs.createdAt))
    .limit(opts.limit ?? 200);
}
