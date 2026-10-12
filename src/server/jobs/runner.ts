import { runEntryResearch, runGapScan } from "@/server/research/pipeline";
import { runVideoAnalysis, runVideoProbe } from "@/server/video/jobs";
import { claimNext, failOrRetry, type JobRow } from "./queue";

const handlers: Record<string, (job: JobRow) => Promise<unknown>> = {
  "research.gap_scan": runGapScan,
  "research.entry": runEntryResearch,
  "video.probe": runVideoProbe,
  "video.analyze": runVideoAnalysis,
};

export const JOB_KINDS = Object.keys(handlers);

/** Runs one job if available. Returns false when the queue is empty. */
export async function runOne(kinds: string[] = JOB_KINDS): Promise<boolean> {
  const job = await claimNext(kinds);
  if (!job) return false;
  const handler = handlers[job.kind];
  try {
    if (!handler) throw new Error(`No handler for job kind ${job.kind}`);
    await handler(job);
  } catch (err) {
    await failOrRetry(job, err instanceof Error ? err.message : String(err));
  }
  return true;
}

/** Drains the queue for at most `budgetMs`. Used by the worker and by admin "run now". */
export async function drain(budgetMs: number, kinds?: string[]): Promise<number> {
  const deadline = Date.now() + budgetMs;
  let n = 0;
  while (Date.now() < deadline && (await runOne(kinds))) n++;
  return n;
}
