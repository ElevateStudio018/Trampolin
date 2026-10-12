import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { jobs } from "@/db/schema";

export type JobRow = typeof jobs.$inferSelect;
export type LogLine = { at: string; level: "info" | "warn" | "error"; message: string };

/**
 * Enqueues a job unless an identical one (same dedupe key) is already queued or running.
 * Returns the active job either way, so repeated clicks / scheduler ticks are idempotent.
 */
export async function enqueue(kind: string, payload: Record<string, unknown>, dedupeKey: string, createdBy: string | null = null, runAfter?: Date) {
  const inserted = await db
    .insert(jobs)
    .values({ kind, payload, dedupeKey, createdBy, runAfter: runAfter ?? new Date() })
    .onConflictDoNothing()
    .returning();
  if (inserted[0]) return { job: inserted[0], created: true };
  const [existing] = await db
    .select()
    .from(jobs)
    .where(and(eq(jobs.dedupeKey, dedupeKey), inArray(jobs.status, ["queued", "running"])));
  return { job: existing!, created: false };
}

/** Atomically claims the next runnable job. Safe with multiple workers (SKIP LOCKED). */
export async function claimNext(kinds: string[]): Promise<JobRow | null> {
  // Jobs stuck in "running" for 15 minutes (crashed worker) are returned to the queue.
  await db.execute(sql`update jobs set status = 'queued', locked_at = null where status = 'running' and locked_at < now() - interval '15 minutes'`);
  const res = await db.execute<{ id: string }>(sql`
    update jobs set status = 'running', locked_at = now(), attempts = attempts + 1
    where id = (
      select id from jobs
      where status = 'queued' and run_after <= now() and kind = any(${sql`array[${sql.join(kinds.map((k) => sql`${k}`), sql`, `)}]::text[]`})
      order by run_after asc, created_at asc
      for update skip locked limit 1
    )
    returning id`);
  const id = res.rows[0]?.id;
  if (!id) return null;
  const [job] = await db.select().from(jobs).where(eq(jobs.id, id));
  return job ?? null;
}

export function line(level: LogLine["level"], message: string): LogLine {
  return { at: new Date().toISOString(), level, message };
}

export async function appendLog(jobId: string, entries: LogLine[]) {
  if (entries.length === 0) return;
  await db.execute(sql`update jobs set log = log || ${JSON.stringify(entries)}::jsonb where id = ${jobId}`);
}

export async function finishJob(jobId: string, status: "succeeded" | "failed" | "blocked", result: unknown, error: string | null = null) {
  await db
    .update(jobs)
    .set({ status, result: result as object, error, finishedAt: new Date(), lockedAt: null })
    .where(eq(jobs.id, jobId));
}

/** Failure with retry: requeues with exponential backoff until maxAttempts is reached. */
export async function failOrRetry(job: JobRow, error: string) {
  if (job.attempts < job.maxAttempts) {
    const delaySeconds = 30 * 2 ** (job.attempts - 1);
    await db
      .update(jobs)
      .set({ status: "queued", lockedAt: null, error, runAfter: new Date(Date.now() + delaySeconds * 1000) })
      .where(eq(jobs.id, job.id));
    await appendLog(job.id, [line("warn", `Attempt ${job.attempts} failed: ${error}. Retrying in ${delaySeconds}s.`)]);
  } else {
    await finishJob(job.id, "failed", null, error);
    await appendLog(job.id, [line("error", `Giving up after ${job.attempts} attempts: ${error}`)]);
  }
}

export async function listJobs(kindPrefix: string, limit = 50) {
  return db
    .select()
    .from(jobs)
    .where(sql`${jobs.kind} like ${kindPrefix + "%"}`)
    .orderBy(desc(jobs.createdAt))
    .limit(limit);
}

export async function getJob(id: string) {
  const [j] = await db.select().from(jobs).where(eq(jobs.id, id));
  return j ?? null;
}
