import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";
import { env } from "@/lib/env";

export type Db = NodePgDatabase<typeof schema>;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
export type DbOrTx = Db | Tx;

const globalForDb = globalThis as unknown as { __trampolinPool?: Pool; __trampolinDb?: Db };

function create(): Db {
  const pool = new Pool({ connectionString: env().DATABASE_URL, max: 10 });
  globalForDb.__trampolinPool = pool;
  return drizzle(pool, { schema });
}

/** Shared database handle (reused across hot reloads in development). */
export const db: Db = globalForDb.__trampolinDb ?? (globalForDb.__trampolinDb = create());

export async function closeDb() {
  await globalForDb.__trampolinPool?.end();
  globalForDb.__trampolinPool = undefined;
  globalForDb.__trampolinDb = undefined;
}

export { schema };
