import "server-only";
import { cookies } from "next/headers";
import { cache } from "react";
import { redirect } from "next/navigation";
import { env } from "@/lib/env";
import { type Actor, type Role, hasRole } from "@/server/actor";
import { actorFromToken, createSession, revokeSession } from "./service";

export const SESSION_COOKIE = "tb_session";

/** Current actor for this request (memoised per request). */
export const getActor = cache(async (): Promise<Actor> => {
  const store = await cookies();
  return actorFromToken(store.get(SESSION_COOKIE)?.value);
});

export async function requireActor(nextPath = "/"): Promise<NonNullable<Actor>> {
  const actor = await getActor();
  if (!actor) redirect(`/login?next=${encodeURIComponent(nextPath)}`);
  return actor;
}

export async function requirePageRole(role: Role, nextPath = "/"): Promise<NonNullable<Actor>> {
  const actor = await requireActor(nextPath);
  if (!hasRole(actor, role)) redirect("/forbidden");
  return actor;
}

export async function startSession(userId: string) {
  const { token, expiresAt } = await createSession(userId);
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: env().APP_ORIGIN.startsWith("https://"),
    path: "/",
    expires: expiresAt,
  });
}

export async function endSession() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) await revokeSession(token);
  store.delete(SESSION_COOKIE);
}
