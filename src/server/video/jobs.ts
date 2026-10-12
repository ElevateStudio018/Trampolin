import { eq } from "drizzle-orm";
import { db } from "@/db";
import { videoAnalyses, videos } from "@/db/schema";
import { appendLog, finishJob, line, type JobRow } from "@/server/jobs/queue";
import { storage } from "@/server/storage";
import { analyzerById, ffprobe } from "./analyzers";

/** Validates the stored file with ffprobe and records technical metadata. */
export async function runVideoProbe(job: JobRow) {
  const { videoId } = job.payload as { videoId: string };
  const [v] = await db.select().from(videos).where(eq(videos.id, videoId));
  if (!v) return finishJob(job.id, "succeeded", { skipped: "video deleted" });
  try {
    const p = await ffprobe(storage().pathFor(v.storageKey));
    await db
      .update(videos)
      .set({ status: "ready", statusMessage: "", durationMs: p.durationMs, width: p.width, height: p.height, frameRate: p.frameRate, codec: p.codec })
      .where(eq(videos.id, videoId));
    await appendLog(job.id, [line("info", `Probed: ${p.width}x${p.height}, ${p.durationMs} ms, ${p.codec}`)]);
    await finishJob(job.id, "succeeded", p);
  } catch (err) {
    // A file ffprobe cannot read is not retryable: mark the video failed with a clear message.
    const message = err instanceof Error ? err.message : String(err);
    await db.update(videos).set({ status: "failed", statusMessage: `We couldn't read this video file. ${message}` }).where(eq(videos.id, videoId));
    await appendLog(job.id, [line("error", message)]);
    await finishJob(job.id, "failed", null, message);
  }
}

export async function runVideoAnalysis(job: JobRow) {
  const { analysisId } = job.payload as { analysisId: string };
  const [a] = await db.select().from(videoAnalyses).where(eq(videoAnalyses.id, analysisId));
  if (!a) return finishJob(job.id, "succeeded", { skipped: "analysis deleted" });
  const [v] = await db.select().from(videos).where(eq(videos.id, a.videoId));
  const analyzer = analyzerById(a.analyzer);
  if (!v || !analyzer) {
    await db.update(videoAnalyses).set({ status: "failed", message: "Video or analyzer no longer exists", finishedAt: new Date() }).where(eq(videoAnalyses.id, analysisId));
    return finishJob(job.id, "failed", null, "missing video or analyzer");
  }
  const avail = analyzer.availability();
  if (!avail.available) {
    await db.update(videoAnalyses).set({ status: "unavailable", message: avail.reason, finishedAt: new Date() }).where(eq(videoAnalyses.id, analysisId));
    return finishJob(job.id, "blocked", null, avail.reason);
  }
  await db.update(videoAnalyses).set({ status: "running" }).where(eq(videoAnalyses.id, analysisId));
  try {
    const result = await analyzer.analyze({ videoId: v.id, filePath: storage().pathFor(v.storageKey), mimeType: v.mimeType });
    await db.update(videoAnalyses).set({ status: "succeeded", result, finishedAt: new Date() }).where(eq(videoAnalyses.id, analysisId));
    await finishJob(job.id, "succeeded", { analysisId });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db.update(videoAnalyses).set({ status: "failed", message, finishedAt: new Date() }).where(eq(videoAnalyses.id, analysisId));
    await finishJob(job.id, "failed", null, message);
  }
}
