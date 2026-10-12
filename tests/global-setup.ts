import { execFileSync } from "node:child_process";

export const TEST_DB = process.env.TEST_DATABASE_URL ?? "postgres://trampolin:trampolin@localhost:5432/trampolin_test";

/** Resets the test database once per run: drop schema, migrate, seed. */
export default function setup() {
  const env: NodeJS.ProcessEnv = { ...process.env, DATABASE_URL: TEST_DB, NODE_ENV: "test" };
  execFileSync("npx", ["tsx", "scripts/reset-db.ts"], { env, stdio: "inherit" });
  execFileSync("npx", ["tsx", "scripts/seed.ts"], { env, stdio: "inherit" });
}
