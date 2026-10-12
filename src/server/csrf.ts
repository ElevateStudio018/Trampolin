import { env } from "@/lib/env";

/**
 * Same-origin check for state-changing route handlers (server actions get this from Next).
 * Accepts the configured APP_ORIGIN or the request's own host.
 */
export function isSameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return false;
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  try {
    const o = new URL(origin);
    return o.origin === new URL(env().APP_ORIGIN).origin || o.host === host;
  } catch {
    return false;
  }
}
