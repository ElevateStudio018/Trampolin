/**
 * Runs the assistant evaluation set against the configured database and prints a report.
 * Uses the language model only if ANTHROPIC_API_KEY is set (this costs money); otherwise
 * evaluates retrieval-only mode. Usage: npm run eval:assistant
 */
import { eq } from "drizzle-orm";
import { closeDb, db } from "../src/db";
import { users } from "../src/db/schema";
import { answerQuestion } from "../src/server/assistant/answer";
import { EVAL_SET } from "../src/server/assistant/eval-set";
import { llmConfigured } from "../src/server/llm/client";
import { registerUser } from "../src/server/auth/service";

const email = "assistant-eval@system.invalid";
let [u] = await db.select({ id: users.id }).from(users).where(eq(users.email, email));
if (!u) u = await registerUser({ email, password: `eval-${Date.now()}-not-used`, handle: `eval_${Date.now().toString(36)}`, displayName: "Assistant eval" });
const actor = { id: u.id, role: "member" as const, handle: "eval", displayName: "Assistant eval" };

console.log(`Mode: ${llmConfigured() ? "language model" : "retrieval-only"} · ${EVAL_SET.length} cases\n`);
let passed = 0;
for (const c of EVAL_SET) {
  const t0 = Date.now();
  const a = await answerQuestion(actor, c.question);
  const ms = Date.now() - t0;
  const names = a.entries.map((e) => e.name);
  const failures: string[] = [];
  for (const n of c.mustRetrieve ?? []) if (!names.includes(n)) failures.push(`did not retrieve ${n}`);
  if (c.mustCiteFrom && !a.citations.some((ci) => c.mustCiteFrom!.includes(ci.entryName))) failures.push(`no citation from ${c.mustCiteFrom.join("/")}`);
  if (c.expectMode && !c.expectMode.includes(a.mode)) failures.push(`mode ${a.mode}`);
  if (c.expectSafety && a.safety !== c.expectSafety) failures.push(`safety ${a.safety}`);
  if (c.expectCaveat && !c.expectCaveat.test(a.caveats.join(" "))) failures.push("missing caveat");
  const keys = new Set(a.citations.map((x) => x.key));
  if (a.blocks.some((b) => b.citationKeys.some((k) => !keys.has(k)))) failures.push("dangling citation key");
  if (failures.length === 0) passed++;
  console.log(`${failures.length ? "FAIL" : "pass"}  ${ms.toString().padStart(5)} ms  ${a.mode.padEnd(14)} ${c.question}${failures.length ? `\n        → ${failures.join("; ")}` : ""}`);
}
console.log(`\n${passed}/${EVAL_SET.length} cases passed.`);
await db.delete(users).where(eq(users.id, u.id));
await closeDb();
process.exit(passed === EVAL_SET.length ? 0 : 1);
