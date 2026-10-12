import { and, desc, eq, lt, or, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { comments, entries, postBookmarks, postLikes, posts, profiles, reports, users, videos } from "@/db/schema";
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";
import { type Actor, assertRole, assertSignedIn, hasRole } from "@/server/actor";
import { audit } from "@/server/audit";
import { rateLimit } from "@/server/ratelimit";

/** Community content is only visible to signed-in members unless marked public. */
function postVisibility(actor: Actor): SQL {
  const notHidden = hasRole(actor, "admin") ? sql`true` : actor ? sql`(${posts.hiddenByModeration} = false or ${posts.authorId} = ${actor.id})` : sql`${posts.hiddenByModeration} = false`;
  const vis = actor ? sql`(${posts.visibility} in ('public','members') or ${posts.authorId} = ${actor.id})` : sql`${posts.visibility} = 'public'`;
  return sql`${notHidden} and ${vis}`;
}

export const postSchema = z.object({
  body: z.string().trim().min(2, "Write something").max(2000, "Keep posts under 2000 characters"),
  entryId: z.string().uuid().optional().nullable(),
  videoId: z.string().uuid().optional().nullable(),
  visibility: z.enum(["members", "public"]).default("members"),
});

export async function createPost(actor: Actor, input: z.input<typeof postSchema>) {
  assertSignedIn(actor);
  await rateLimit(`post:${actor.id}`, 10, 600);
  const parsed = postSchema.safeParse(input);
  if (!parsed.success) throw new ValidationError("Please fix the highlighted fields", z.flattenError(parsed.error).fieldErrors);
  const data = parsed.data;
  if (data.videoId) {
    const [v] = await db.select().from(videos).where(eq(videos.id, data.videoId));
    if (!v || v.ownerId !== actor.id) throw new ForbiddenError("You can only share your own videos");
    if (v.visibility === "private") throw new ValidationError("Change the video's visibility before sharing it", { videoId: ["This video is private"] });
  }
  if (data.entryId) {
    const [e] = await db.select({ id: entries.id }).from(entries).where(and(eq(entries.id, data.entryId), eq(entries.state, "published")));
    if (!e) throw new ValidationError("Unknown skill");
  }
  const [p] = await db.insert(posts).values({ ...data, entryId: data.entryId ?? null, videoId: data.videoId ?? null, authorId: actor.id }).returning();
  return p!;
}

export type FeedPost = Awaited<ReturnType<typeof listFeed>>["items"][number];

/** Keyset-paginated feed (newest first). `before` is the createdAt ISO cursor. */
export async function listFeed(actor: Actor, opts: { before?: string; limit?: number; authorId?: string; postId?: string } = {}) {
  const limit = Math.min(opts.limit ?? 20, 50);
  const where: SQL[] = [postVisibility(actor)];
  if (opts.before && !Number.isNaN(Date.parse(opts.before))) where.push(lt(posts.createdAt, new Date(opts.before)));
  if (opts.authorId) where.push(eq(posts.authorId, opts.authorId));
  if (opts.postId) where.push(eq(posts.id, opts.postId));
  const viewer = actor?.id ?? "00000000-0000-0000-0000-000000000000";
  const rows = await db
    .select({
      id: posts.id,
      body: posts.body,
      createdAt: posts.createdAt,
      visibility: posts.visibility,
      hidden: posts.hiddenByModeration,
      authorId: posts.authorId,
      authorHandle: profiles.handle,
      authorName: profiles.displayName,
      entrySlug: entries.slug,
      entryName: entries.canonicalName,
      videoId: videos.id,
      videoTitle: videos.title,
      videoVisible: sql<boolean>`${videos.id} is not null and ${videos.hiddenByModeration} = false and ${videos.status} = 'ready' and (${videos.visibility} = 'public' or (${videos.visibility} = 'members' and ${actor !== null}) or ${videos.ownerId} = ${viewer})`,
      likes: sql<number>`(select count(*)::int from post_likes l where l.post_id = ${posts.id})`,
      commentCount: sql<number>`(select count(*)::int from comments c where c.post_id = ${posts.id} and c.hidden_by_moderation = false)`,
      likedByMe: sql<boolean>`exists(select 1 from post_likes l where l.post_id = ${posts.id} and l.user_id = ${viewer})`,
      bookmarkedByMe: sql<boolean>`exists(select 1 from post_bookmarks b where b.post_id = ${posts.id} and b.user_id = ${viewer})`,
    })
    .from(posts)
    .innerJoin(profiles, eq(profiles.userId, posts.authorId))
    .innerJoin(users, and(eq(users.id, posts.authorId), sql`${users.suspendedAt} is null`))
    .leftJoin(entries, eq(entries.id, posts.entryId))
    .leftJoin(videos, eq(videos.id, posts.videoId))
    .where(and(...where))
    .orderBy(desc(posts.createdAt))
    .limit(limit + 1);
  const items = rows.slice(0, limit);
  return { items, nextCursor: rows.length > limit ? items[items.length - 1]!.createdAt.toISOString() : null };
}

export async function getPost(actor: Actor, postId: string) {
  if (!z.string().uuid().safeParse(postId).success) return null;
  const { items } = await listFeed(actor, { postId, limit: 1 });
  const post = items[0];
  if (!post) return null;
  const commentRows = await db
    .select({ id: comments.id, body: comments.body, createdAt: comments.createdAt, hidden: comments.hiddenByModeration, authorId: comments.authorId, authorHandle: profiles.handle, authorName: profiles.displayName })
    .from(comments)
    .innerJoin(profiles, eq(profiles.userId, comments.authorId))
    .where(and(eq(comments.postId, postId), hasRole(actor, "admin") ? sql`true` : or(eq(comments.hiddenByModeration, false), actor ? eq(comments.authorId, actor.id) : sql`false`)))
    .orderBy(comments.createdAt)
    .limit(200);
  return { ...post, comments: commentRows };
}

async function assertPostVisible(actor: Actor, postId: string) {
  const [p] = await db.select({ id: posts.id }).from(posts).where(and(eq(posts.id, postId), postVisibility(actor)));
  if (!p) throw new NotFoundError("Post not found");
}

export async function addComment(actor: Actor, postId: string, body: string) {
  assertSignedIn(actor);
  await rateLimit(`comment:${actor.id}`, 30, 600);
  const text = body.trim();
  if (text.length < 1 || text.length > 1000) throw new ValidationError("Comments must be 1–1000 characters", { body: ["1–1000 characters"] });
  await assertPostVisible(actor, postId);
  const [c] = await db.insert(comments).values({ postId, authorId: actor.id, body: text }).returning();
  return c!;
}

export async function toggleLike(actor: Actor, postId: string) {
  assertSignedIn(actor);
  await assertPostVisible(actor, postId);
  const removed = await db.delete(postLikes).where(and(eq(postLikes.postId, postId), eq(postLikes.userId, actor.id))).returning();
  if (removed.length === 0) await db.insert(postLikes).values({ postId, userId: actor.id }).onConflictDoNothing();
  return removed.length === 0;
}

export async function toggleBookmark(actor: Actor, postId: string) {
  assertSignedIn(actor);
  await assertPostVisible(actor, postId);
  const removed = await db.delete(postBookmarks).where(and(eq(postBookmarks.postId, postId), eq(postBookmarks.userId, actor.id))).returning();
  if (removed.length === 0) await db.insert(postBookmarks).values({ postId, userId: actor.id }).onConflictDoNothing();
  return removed.length === 0;
}

export async function listBookmarks(actor: Actor) {
  assertSignedIn(actor);
  const ids = await db.select({ postId: postBookmarks.postId }).from(postBookmarks).where(eq(postBookmarks.userId, actor.id)).orderBy(desc(postBookmarks.createdAt)).limit(50);
  const out: FeedPost[] = [];
  for (const { postId } of ids) {
    const { items } = await listFeed(actor, { postId, limit: 1 });
    if (items[0]) out.push(items[0]);
  }
  return out;
}

export async function deletePost(actor: Actor, postId: string) {
  assertSignedIn(actor);
  const [p] = await db.select().from(posts).where(eq(posts.id, postId));
  if (!p) throw new NotFoundError("Post not found");
  if (p.authorId !== actor.id && !hasRole(actor, "admin")) throw new ForbiddenError();
  await db.delete(posts).where(eq(posts.id, postId));
  if (p.authorId !== actor.id) await audit(actor.id, "post.delete", "post", postId);
}

export async function deleteComment(actor: Actor, commentId: string) {
  assertSignedIn(actor);
  const [c] = await db.select().from(comments).where(eq(comments.id, commentId));
  if (!c) throw new NotFoundError("Comment not found");
  if (c.authorId !== actor.id && !hasRole(actor, "admin")) throw new ForbiddenError();
  await db.delete(comments).where(eq(comments.id, commentId));
}

// ---------------------------------------------------------------------------
// Reports and moderation
// ---------------------------------------------------------------------------

export const REPORT_REASONS = ["spam", "harassment", "dangerous", "privacy", "copyright", "other"] as const;
export const reportSchema = z.object({
  targetType: z.enum(["post", "comment", "video", "profile"]),
  targetId: z.string().uuid(),
  reason: z.enum(REPORT_REASONS),
  details: z.string().trim().max(1000).default(""),
});

export async function fileReport(actor: Actor, input: z.input<typeof reportSchema>) {
  assertSignedIn(actor);
  await rateLimit(`report:${actor.id}`, 20, 3600);
  const parsed = reportSchema.safeParse(input);
  if (!parsed.success) throw new ValidationError("Invalid report");
  const r = parsed.data;
  // Repeated reports of the same target by the same person are absorbed (partial unique index).
  await db.insert(reports).values({ ...r, reporterId: actor.id }).onConflictDoNothing();
}

export async function listReports(actor: Actor, status: "open" | "actioned" | "dismissed" = "open") {
  assertRole(actor, "admin");
  const rows = await db
    .select({ report: reports, reporterHandle: profiles.handle })
    .from(reports)
    .innerJoin(profiles, eq(profiles.userId, reports.reporterId))
    .where(eq(reports.status, status))
    .orderBy(desc(reports.createdAt))
    .limit(100);
  return Promise.all(rows.map(async (r) => ({ ...r, target: await describeTarget(r.report.targetType, r.report.targetId) })));
}

async function describeTarget(type: string, id: string): Promise<{ text: string; href: string | null; hidden: boolean; exists: boolean }> {
  if (type === "post") {
    const [p] = await db.select().from(posts).where(eq(posts.id, id));
    return p ? { text: p.body, href: `/community/${p.id}`, hidden: p.hiddenByModeration, exists: true } : { text: "(deleted)", href: null, hidden: false, exists: false };
  }
  if (type === "comment") {
    const [c] = await db.select().from(comments).where(eq(comments.id, id));
    return c ? { text: c.body, href: `/community/${c.postId}`, hidden: c.hiddenByModeration, exists: true } : { text: "(deleted)", href: null, hidden: false, exists: false };
  }
  if (type === "video") {
    const [v] = await db.select().from(videos).where(eq(videos.id, id));
    return v ? { text: v.title, href: `/videos/${v.id}`, hidden: v.hiddenByModeration, exists: true } : { text: "(deleted)", href: null, hidden: false, exists: false };
  }
  const [p] = await db.select().from(profiles).where(eq(profiles.userId, id));
  return p ? { text: `@${p.handle}: ${p.bio}`, href: `/u/${p.handle}`, hidden: false, exists: true } : { text: "(deleted)", href: null, hidden: false, exists: false };
}

/** Resolves a report. "hide" removes the target from public view; it can be restored later. */
export async function resolveReport(actor: Actor, reportId: string, action: "hide" | "dismiss" | "restore", note: string) {
  assertRole(actor, "admin");
  return db.transaction(async (tx) => {
    const [r] = await tx.select().from(reports).where(eq(reports.id, reportId)).for("update");
    if (!r) throw new NotFoundError("Report not found");
    const hidden = action === "hide";
    if (action !== "dismiss") {
      if (r.targetType === "post") await tx.update(posts).set({ hiddenByModeration: hidden }).where(eq(posts.id, r.targetId));
      if (r.targetType === "comment") await tx.update(comments).set({ hiddenByModeration: hidden }).where(eq(comments.id, r.targetId));
      if (r.targetType === "video") await tx.update(videos).set({ hiddenByModeration: hidden }).where(eq(videos.id, r.targetId));
      if (r.targetType === "profile" && hidden) await tx.update(profiles).set({ bio: "", profileVisibility: "private" }).where(eq(profiles.userId, r.targetId));
    }
    // Resolving one report closes all open reports for the same target.
    await tx
      .update(reports)
      .set({ status: action === "dismiss" ? "dismissed" : "actioned", resolvedBy: actor.id, resolvedAt: new Date(), resolutionNote: note.slice(0, 1000) })
      .where(and(eq(reports.targetType, r.targetType), eq(reports.targetId, r.targetId), eq(reports.status, "open")));
    await audit(actor.id, `moderation.${action}`, r.targetType, r.targetId, { reportId, note }, tx);
  });
}

// ---------------------------------------------------------------------------
// Admin: users
// ---------------------------------------------------------------------------

export async function listUsers(actor: Actor, q = "") {
  assertRole(actor, "admin");
  const like = `%${q.replace(/[%_]/g, "")}%`;
  return db
    .select({ id: users.id, email: users.email, role: users.role, suspendedAt: users.suspendedAt, createdAt: users.createdAt, handle: profiles.handle, displayName: profiles.displayName })
    .from(users)
    .innerJoin(profiles, eq(profiles.userId, users.id))
    .where(q ? or(sql`${users.email}::text ilike ${like}`, sql`${profiles.handle}::text ilike ${like}`) : sql`true`)
    .orderBy(desc(users.createdAt))
    .limit(100);
}

export async function setUserRole(actor: Actor, userId: string, role: "member" | "reviewer" | "admin") {
  assertRole(actor, "admin");
  if (userId === actor.id) throw new ValidationError("You can't change your own role");
  await db.update(users).set({ role }).where(eq(users.id, userId));
  await audit(actor.id, "user.role", "user", userId, { role });
}

export async function setSuspended(actor: Actor, userId: string, suspended: boolean) {
  assertRole(actor, "admin");
  if (userId === actor.id) throw new ValidationError("You can't suspend yourself");
  await db.update(users).set({ suspendedAt: suspended ? new Date() : null }).where(eq(users.id, userId));
  if (suspended) await db.execute(sql`delete from sessions where user_id = ${userId}`);
  await audit(actor.id, suspended ? "user.suspend" : "user.unsuspend", "user", userId);
}
