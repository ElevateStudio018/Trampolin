/**
 * Background worker: processes research and video jobs and schedules a daily gap scan.
 * Run with `npm run worker`. Safe to run several instances (jobs are claimed with SKIP LOCKED).
 */
import { closeDb } from "../src/db";
import { drain } from "../src/server/jobs/runner";
import { enqueueGapScan } from "../src/server/research/pipeline";

let stopping = false;
for (const sig of ["SIGINT", "SIGTERM"] as const) process.on(sig, () => (stopping = true));

console.log("[worker] started");
let lastSchedule = 0;
while (!stopping) {
  try {
    if (Date.now() - lastSchedule > 60 * 60 * 1000) {
      const res = await enqueueGapScan(null, "scheduled");
      if (res.created) console.log("[worker] scheduled daily gap scan");
      lastSchedule = Date.now();
    }
    const n = await drain(30_000);
    if (n > 0) console.log(`[worker] processed ${n} job(s)`);
  } catch (err) {
    console.error("[worker] loop error", err);
  }
  await new Promise((r) => setTimeout(r, 2000));
}
await closeDb();
console.log("[worker] stopped");
