import { z } from "zod";

const optional = z
  .string()
  .optional()
  .transform((v) => (v && v.trim() !== "" ? v.trim() : undefined));

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().default("postgres://trampolin:trampolin@localhost:5432/trampolin_dev"),
  APP_ORIGIN: z.string().default("http://localhost:3000"),
  STORAGE_DIR: z.string().default("./storage"),
  VIDEO_MAX_BYTES: z.coerce.number().int().positive().default(200 * 1024 * 1024),
  ANTHROPIC_API_KEY: optional,
  ANTHROPIC_MODEL: z.string().default("claude-opus-5-5"),
  LLM_DAILY_TOKEN_BUDGET: z.coerce.number().int().nonnegative().default(200_000),
  SEARCH_PROVIDER: optional,
  SEARCH_API_KEY: optional,
  RESEARCH_ALLOWED_DOMAINS: optional,
  VIDEO_MODEL_ENDPOINT: optional,
  VIDEO_MODEL_API_KEY: optional,
});

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

/** Parsed server environment. Never import this from client components. */
export function env(): Env {
  if (!cached) cached = schema.parse(process.env);
  return cached;
}

/** For tests: drop the cache so changed process.env values are re-read. */
export function resetEnvCache() {
  cached = undefined;
}
