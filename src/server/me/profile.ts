import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  assistantQueries,
  collectionItems,
  comments,
  entries,
  posts,
  profiles,
  progressLogs,
  users,
  videos,
} from "@/db/schema";
import { ValidationError, UnauthorizedError } from "@/lib/errors";
import { type Actor, assertSignedIn, hasRole } from "@/server/actor";
import { audit } from "@/server/audit";
import { verifyPassword } from "@/server/auth/password";
import { storage } from "@/server/storage";

export const profileInputSchema = z.object({
  displayName: z.string().trim().min(1, "Required").max(60),
  bio: z.string().trim().max(500).default(""),
  homeClub: z.string().trim().max(80).default(""),
  profileVisibility: z.enum(["private", "members", "public"]),
  collectionVisibility: z.enum(["private", "members", "public"]),
});

export async function getOwnProfile(actor: Actor) {
  assertSignedIn(actor);
  const [p] = await db
    .select({ profile: profiles, email: users.email, role: users.role, createdAt: users.createdAt })
    .from(profiles)
    .innerJoin(users, eq(users.id, profiles.userId))
    .where(eq(profiles.userId, actor.id));
  return p!;
}

export async function updateProfile(actor: Actor, input: z.input<typeof profileInputSchema>) {
  assertSignedIn(actor);
  const parsed = profileInputSchema.safeParse(input);
  if (!parsed.success) throw new ValidationError("Please fix the highlighted fields", z.flattenError(parsed.error).fieldErrors);
  await db.update(profiles).set({ ...parsed.data, updatedAt: new Date() }).where(eq(profiles.userId, actor.id));
}

function canView(actor: Actor, ownerId: string, v: "private" | "members" | "public") {
  return actor?.id === ownerId || v === "public" || (v === "members" && actor !== null) || hasRole(actor, "admin");
}

/** Public profile view with visibility enforcement. Returns null when not visible (indistinguishable from missing). */
export async function getPublicProfile(handle: string, actor: Actor) {
  const [p] = await db
    .select({ profile: profiles, createdAt: users.createdAt, suspended: users.suspendedAt })
    .from(profiles)
    .innerJoin(users, eq(users.id, profiles.userId))
    .where(eq(profiles.handle, handle));
  if (!p || (p.suspended && !hasRole(actor, "admin"))) return null;
  if (!canView(actor, p.profile.userId, p.profile.profileVisibility)) return null;
  const showCollection = canView(actor, p.profile.userId, p.profile.collectionVisibility);
  const landed = showCollection
    ? await db
        .select({ slug: entries.slug, name: entries.canonicalName, status: collectionItems.status })
        .from(collectionItems)
        .innerJoin(entries, eq(entries.id, collectionItems.entryId))
        .where(and(eq(collectionItems.userId, p.profile.userId), eq(entries.state, "published")))
        .orderBy(desc(collectionItems.updatedAt))
        .limit(60)
    : null;
  const viewerIsMember = actor !== null;
  const publicVideos = await db
    .select({ id: videos.id, title: videos.title, createdAt: videos.createdAt })
    .from(videos)
    .where(
      and(
        eq(videos.ownerId, p.profile.userId),
        eq(videos.status, "ready"),
        eq(videos.hiddenByModeration, false),
        actor?.id === p.profile.userId
          ? sql`true`
          : viewerIsMember
            ? sql`${videos.visibility} in ('public','members')`
            : eq(videos.visibility, "public"),
      ),
    )
    .orderBy(desc(videos.createdAt))
    .limit(12);
  return { ...p.profile, joinedAt: p.createdAt, collection: landed, videos: publicVideos };
}

/** Everything the platform stores about the user, for a self-service data export. */
export async function exportMyData(actor: Actor) {
  assertSignedIn(actor);
  const [account] = await db.select({ email: users.email, role: users.role, createdAt: users.createdAt }).from(users).where(eq(users.id, actor.id));
  const [profile] = await db.select().from(profiles).where(eq(profiles.userId, actor.id));
  return {
    exportedAt: new Date().toISOString(),
    account,
    profile,
    collection: await db.select().from(collectionItems).where(eq(collectionItems.userId, actor.id)),
    progressLogs: await db.select().from(progressLogs).where(eq(progressLogs.userId, actor.id)),
    videos: (await db.select().from(videos).where(eq(videos.ownerId, actor.id))).map(({ storageKey: _k, ...v }) => v),
    posts: await db.select().from(posts).where(eq(posts.authorId, actor.id)),
    comments: await db.select().from(comments).where(eq(comments.authorId, actor.id)),
    assistantQuestions: await db
      .select({ question: assistantQueries.question, createdAt: assistantQueries.createdAt })
      .from(assistantQueries)
      .where(eq(assistantQueries.userId, actor.id)),
  };
}

/**
 * Permanently deletes the account. Rows cascade via foreign keys; stored video files are
 * removed after the database transaction commits.
 */
export async function deleteAccount(actor: Actor, password: string) {
  assertSignedIn(actor);
  const [u] = await db.select({ hash: users.passwordHash }).from(users).where(eq(users.id, actor.id));
  if (!u || !(await verifyPassword(password, u.hash))) throw new UnauthorizedError("Password is incorrect");
  const keys = await db.transaction(async (tx) => {
    const vids = await tx.select({ key: videos.storageKey }).from(videos).where(eq(videos.ownerId, actor.id));
    await audit(null, "account.delete", "user", actor.id, {}, tx);
    await tx.delete(users).where(eq(users.id, actor.id));
    return vids.map((v) => v.key);
  });
  await Promise.all(keys.map((k) => storage().delete(k).catch(() => undefined)));
}
