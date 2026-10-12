import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { sql } from "drizzle-orm";
import type { z } from "zod";
import { db } from "@/db";
import { llmUsage } from "@/db/schema";
import { env } from "@/lib/env";

/**
 * Server-only gateway to the language model. All model calls go through here so that
 * the API key never leaves the server, usage is logged per call, and a global daily
 * token budget is enforced before any request is sent.
 */

export type LlmFeature = "assistant" | "research";

export class LlmUnavailableError extends Error {
  constructor(
    message: string,
    readonly reason: "not_configured" | "budget_exceeded" | "timeout" | "rate_limited" | "refused" | "api_error",
  ) {
    super(message);
    this.name = "LlmUnavailableError";
  }
}

export function llmConfigured(): boolean {
  return Boolean(env().ANTHROPIC_API_KEY);
}

let client: Anthropic | undefined;
function getClient() {
  if (!client) client = new Anthropic({ apiKey: env().ANTHROPIC_API_KEY, timeout: 45_000, maxRetries: 2 });
  return client;
}

export async function tokensUsedToday(): Promise<number> {
  const res = await db.execute<{ n: number }>(
    sql`select coalesce(sum(input_tokens + output_tokens), 0)::int as n from llm_usage where created_at >= date_trunc('day', now())`,
  );
  return Number(res.rows[0]?.n ?? 0);
}

export async function usageSummary(days = 7) {
  const res = await db.execute<{ day: string; feature: string; calls: number; input_tokens: number; output_tokens: number; errors: number; avg_latency_ms: number }>(sql`
    select to_char(date_trunc('day', created_at), 'YYYY-MM-DD') as day, feature,
      count(*)::int as calls, sum(input_tokens)::int as input_tokens, sum(output_tokens)::int as output_tokens,
      count(*) filter (where outcome <> 'ok')::int as errors, avg(latency_ms)::int as avg_latency_ms
    from llm_usage where created_at >= now() - make_interval(days => ${days})
    group by 1, 2 order by 1 desc, 2`);
  return res.rows;
}

/**
 * Calls the model with a structured-output schema. Returns the parsed object; throws
 * LlmUnavailableError for every non-success outcome so callers can degrade gracefully.
 */
export async function generateStructured<T extends z.ZodType>(opts: {
  feature: LlmFeature;
  userId: string | null;
  system: string;
  prompt: string;
  schema: T;
  maxTokens?: number;
}): Promise<z.infer<T>> {
  if (!llmConfigured()) throw new LlmUnavailableError("No language model is configured (ANTHROPIC_API_KEY is not set).", "not_configured");
  const budget = env().LLM_DAILY_TOKEN_BUDGET;
  if ((await tokensUsedToday()) >= budget) {
    await record(opts, 0, 0, 0, "budget_exceeded");
    throw new LlmUnavailableError("The daily language-model budget has been used up. Try again tomorrow.", "budget_exceeded");
  }

  const model = env().ANTHROPIC_MODEL;
  const started = Date.now();
  try {
    const response = await getClient().messages.parse({
      model,
      max_tokens: opts.maxTokens ?? 4000,
      system: opts.system,
      output_config: { effort: "low", format: zodOutputFormat(opts.schema) },
      messages: [{ role: "user", content: opts.prompt }],
    });
    const latency = Date.now() - started;
    await record(opts, response.usage.input_tokens, response.usage.output_tokens, latency, response.stop_reason === "refusal" ? "refused" : "ok");
    if (response.stop_reason === "refusal") throw new LlmUnavailableError("The model declined this request.", "refused");
    if (response.parsed_output == null) throw new LlmUnavailableError("The model returned output that did not match the expected format.", "api_error");
    return response.parsed_output as z.infer<T>;
  } catch (err) {
    if (err instanceof LlmUnavailableError) throw err;
    const latency = Date.now() - started;
    if (err instanceof Anthropic.APIConnectionTimeoutError) {
      await record(opts, 0, 0, latency, "timeout");
      throw new LlmUnavailableError("The language model timed out.", "timeout");
    }
    if (err instanceof Anthropic.RateLimitError) {
      await record(opts, 0, 0, latency, "rate_limited");
      throw new LlmUnavailableError("The language model is rate-limited right now.", "rate_limited");
    }
    await record(opts, 0, 0, latency, "error");
    const status = err instanceof Anthropic.APIError ? ` (HTTP ${err.status})` : "";
    console.error("[llm] request failed", status, err instanceof Error ? err.message : err);
    throw new LlmUnavailableError(`The language model request failed${status}.`, "api_error");
  }
}

async function record(opts: { feature: LlmFeature; userId: string | null }, input: number, output: number, latencyMs: number, outcome: string) {
  await db.insert(llmUsage).values({
    feature: opts.feature,
    userId: opts.userId,
    model: env().ANTHROPIC_MODEL,
    inputTokens: input,
    outputTokens: output,
    latencyMs,
    outcome,
  });
}
