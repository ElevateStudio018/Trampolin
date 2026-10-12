import { sql } from "drizzle-orm";
import { db } from "@/db";
import { RateLimitError } from "@/lib/errors";

/**
 * Fixed-window rate limiter backed by Postgres so it holds across server instances.
 * Throws RateLimitError when `limit` is exceeded within `windowSeconds`.
 */
export async function rateLimit(key: string, limit: number, windowSeconds: number): Promise<void> {
  const now = Date.now();
  const windowStart = new Date(Math.floor(now / (windowSeconds * 1000)) * windowSeconds * 1000);
  const result = await db.execute<{ count: number }>(sql`
    insert into rate_limits (key, window_start, count) values (${key}, ${windowStart.toISOString()}, 1)
    on conflict (key, window_start) do update set count = rate_limits.count + 1
    returning count`);
  const count = Number(result.rows[0]?.count ?? 0);
  if (count > limit) {
    const retryAfter = Math.ceil((windowStart.getTime() + windowSeconds * 1000 - now) / 1000);
    throw new RateLimitError(Math.max(1, retryAfter));
  }
  // Opportunistic cleanup of old windows (cheap, indexed by primary key prefix scan is not needed).
  if (Math.random() < 0.01) {
    await db.execute(sql`delete from rate_limits where window_start < now() - interval '1 day'`);
  }
}
