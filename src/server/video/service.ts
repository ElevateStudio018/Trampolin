import { createHash, randomUUID } from "node:crypto";
import { once } from "node:events";
import { and, desc, eq, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { entries, profiles, videoAnalyses, videos } from "@/db/schema";
import { env } from "@/lib/env";
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";
import { type Actor, assertSignedIn, hasRole } from "@/server/actor";
import { audit } from "@/server/audit";
import { enqueue } from "@/server/jobs/queue";
import { rateLimit } from "@/server/ratelimit";
import { storage } from "@/server/storage";
import { analyzerById, analyzers } from "./analyzers";

export const ALLOWED_TYPES = { "video/mp4": "mp4", "video/quicktime": "mov", "video/webm": "webm" } as const;
export type VideoMime = keyof typeof ALLOWED_TYPES;

/** Identifies the container from magic bytes; the client-declared type is never trusted. */
export function sniffVideoType(head: Uint8Array): VideoMime | null {
  if (head.length >= 12 && String.fromCharCode(...head.slice(4, 8)) === "ftyp") {
    const brand = String.fromCharCode(...head.slice(8, 12));
    return brand === "qt  " ? "video/quicktime" : "video/mp4";
  }
  if (head.length >= 4 && head[0] === 0x1a && head[1] === 0x45 && head[2] === 0xdf && head[3] === 0xa3) return "video/webm";
  return null;
}

export const videoMetaSchema = z.object({
  title: z.string().trim().min(1, "Give the video a title").max(120),
  description: z.string().trim().max(2000).default(""),
  visibility: z.enum(["private", "members", "public"]).default("private"),
  entryId: z.string().uuid().optional().nullable(),
  trainingConsent: z.boolean().default(false),
});

/**
 * Streams an upload to storage while enforcing the size limit, sniffing the container
 * type from the first bytes and hashing the content. Nothing is written to the database
 * until the file is fully stored and validated.
 */
export async function storeUpload(actor: Actor, body: ReadableStream<Uint8Array>, originalFilename: string, meta: z.input<typeof videoMetaSchema>) {
  assertSignedIn(actor);
  await rateLimit(`upload:${actor.id}`, 20, 3600);
  const parsedMeta = videoMetaSchema.safeParse(meta);
  if (!parsedMeta.success) throw new ValidationError("Please fix the highlighted fields", z.flattenError(parsedMeta.error).fieldErrors);
  if (parsedMeta.data.entryId) {
    const [e] = await db.select({ id: entries.id }).from(entries).where(and(eq(entries.id, parsedMeta.data.entryId), eq(entries.state, "published")));
    if (!e) throw new ValidationError("Unknown skill", { entryId: ["Unknown skill"] });
  }

  const max = env().VIDEO_MAX_BYTES;
  const key = `videos/${actor.id}/${randomUUID()}`;
  const hash = createHash("sha256");
  const out = await storage().createWriteStream(key);
  const reader = body.getReader();
  let size = 0;
  let mime: VideoMime | null = null;
  let head = new Uint8Array(0);
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > max) throw new ValidationError(`The file is larger than the ${Math.round(max / 1024 / 1024)} MB limit.`);
      if (!mime && head.length < 16) {
        head = new Uint8Array([...head, ...value.slice(0, 16 - head.length)]);
        if (head.length >= 12) {
          mime = sniffVideoType(head);
          if (!mime) throw new ValidationError("Unsupported file type. Upload an MP4, MOV or WebM video.");
        }
      }
      hash.update(value);
      if (!out.write(value)) await once(out, "drain");
    }
    if (size === 0) throw new ValidationError("The file is empty.");
    if (!mime) throw new ValidationError("Unsupported file type. Upload an MP4, MOV or WebM video.");
    out.end();
    await once(out, "finish");
  } catch (err) {
    await reader.cancel().catch(() => undefined);
    out.destroy();
    await storage().delete(key);
    throw err;
  }

  const [video] = await db
    .insert(videos)
    .values({
      ownerId: actor.id,
      title: parsedMeta.data.title,
      description: parsedMeta.data.description,
      visibility: parsedMeta.data.visibility,
      entryId: parsedMeta.data.entryId ?? null,
      trainingConsent: parsedMeta.data.trainingConsent,
      storageKey: key,
      originalFilename: originalFilename.slice(0, 200) || `upload.${ALLOWED_TYPES[mime]}`,
      mimeType: mime,
      sizeBytes: size,
      sha256: hash.digest("hex"),
      status: "processing",
      statusMessage: "Checking the file…",
    })
    .returning();
  await enqueue("video.probe", { videoId: video!.id }, `video.probe:${video!.id}`, actor.id);
  await audit(actor.id, "video.upload", "video", video!.id, { size, mime });
  return video!;
}

/** Visibility rule shared by every read path. Moderation-hidden videos are visible only to owner and admins. */
function canView(actor: Actor, v: { ownerId: string; visibility: string; hiddenByModeration: boolean }) {
  if (actor?.id === v.ownerId || hasRole(actor, "admin")) return true;
  if (v.hiddenByModeration) return false;
  return v.visibility === "public" || (v.visibility === "members" && actor !== null);
}

export async function getVideo(actor: Actor, id: string) {
  if (!z.string().uuid().safeParse(id).success) return null;
  const [row] = await db
    .select({ video: videos, ownerHandle: profiles.handle, ownerName: profiles.displayName, entrySlug: entries.slug, entryName: entries.canonicalName })
    .from(videos)
    .innerJoin(profiles, eq(profiles.userId, videos.ownerId))
    .leftJoin(entries, eq(entries.id, videos.entryId))
    .where(eq(videos.id, id));
  if (!row || !canView(actor, row.video)) return null;
  const analysis = await db.select().from(videoAnalyses).where(eq(videoAnalyses.videoId, id)).orderBy(desc(videoAnalyses.createdAt));
  return { ...row, analyses: analysis, isOwner: actor?.id === row.video.ownerId };
}

export async function listMyVideos(actor: Actor) {
  assertSignedIn(actor);
  return db
    .select({ video: videos, entryName: entries.canonicalName })
    .from(videos)
    .leftJoin(entries, eq(entries.id, videos.entryId))
    .where(eq(videos.ownerId, actor.id))
    .orderBy(desc(videos.createdAt));
}

export async function listSharedVideos(actor: Actor, limit = 24) {
  return db
    .select({ id: videos.id, title: videos.title, createdAt: videos.createdAt, hasPoster: sql<boolean>`${videos.posterKey} is not null`, ownerHandle: profiles.handle, ownerName: profiles.displayName, entryName: entries.canonicalName })
    .from(videos)
    .innerJoin(profiles, eq(profiles.userId, videos.ownerId))
    .leftJoin(entries, eq(entries.id, videos.entryId))
    .where(
      and(
        eq(videos.status, "ready"),
        eq(videos.hiddenByModeration, false),
        actor ? or(eq(videos.visibility, "public"), eq(videos.visibility, "members")) : eq(videos.visibility, "public"),
        actor ? sql`${videos.ownerId} <> ${actor.id}` : sql`true`,
      ),
    )
    .orderBy(desc(videos.createdAt))
    .limit(limit);
}

/** Returns the storage location for streaming, after the same visibility check as getVideo. */
export async function videoForStreaming(actor: Actor, id: string) {
  if (!z.string().uuid().safeParse(id).success) return null;
  const [v] = await db.select().from(videos).where(eq(videos.id, id));
  if (!v || !canView(actor, v) || v.status === "failed") return null;
  return v;
}

export async function updateVideo(actor: Actor, id: string, input: z.input<typeof videoMetaSchema>) {
  assertSignedIn(actor);
  const parsed = videoMetaSchema.safeParse(input);
  if (!parsed.success) throw new ValidationError("Please fix the highlighted fields", z.flattenError(parsed.error).fieldErrors);
  const res = await db
    .update(videos)
    .set({ ...parsed.data, entryId: parsed.data.entryId ?? null })
    .where(and(eq(videos.id, id), eq(videos.ownerId, actor.id)))
    .returning({ id: videos.id });
  if (res.length === 0) throw new NotFoundError("Video not found");
}

export async function deleteVideo(actor: Actor, id: string) {
  assertSignedIn(actor);
  const [v] = await db.select().from(videos).where(eq(videos.id, id));
  if (!v) throw new NotFoundError("Video not found");
  if (v.ownerId !== actor.id && !hasRole(actor, "admin")) throw new ForbiddenError();
  await db.delete(videos).where(eq(videos.id, id));
  await storage().delete(v.storageKey);
  if (v.posterKey) await storage().delete(v.posterKey);
  await audit(actor.id, "video.delete", "video", id);
}

/** Owner requests an analysis. Unavailable analyzers are recorded as such — never simulated. */
export async function requestAnalysis(actor: Actor, videoId: string, analyzerId: string) {
  assertSignedIn(actor);
  const [v] = await db.select().from(videos).where(eq(videos.id, videoId));
  if (!v || v.ownerId !== actor.id) throw new NotFoundError("Video not found");
  if (v.status !== "ready") throw new ValidationError("The video is still being processed.");
  const analyzer = analyzerById(analyzerId);
  if (!analyzer) throw new ValidationError("Unknown analysis type");
  await rateLimit(`analyze:${actor.id}`, 30, 3600);
  const avail = analyzer.availability();
  if (!avail.available) {
    const [row] = await db
      .insert(videoAnalyses)
      .values({ videoId, analyzer: analyzer.id, analyzerVersion: analyzer.version, status: "unavailable", message: avail.reason, finishedAt: new Date() })
      .returning();
    return row!;
  }
  const [row] = await db.insert(videoAnalyses).values({ videoId, analyzer: analyzer.id, analyzerVersion: analyzer.version, status: "queued" }).returning();
  await enqueue("video.analyze", { analysisId: row!.id }, `video.analyze:${row!.id}`, actor.id);
  return row!;
}

export function analyzerCatalog() {
  return analyzers().map((a) => ({ id: a.id, label: a.label, version: a.version, availability: a.availability() }));
}
