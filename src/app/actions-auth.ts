"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { ActionState } from "@/lib/action-state";
import { authenticate, registerUser } from "@/server/auth/service";
import { endSession, startSession } from "@/server/auth/current";
import { rateLimit } from "@/server/ratelimit";
import { runAction, str } from "@/server/action";

async function clientKey() {
  const h = await headers();
  return (h.get("x-forwarded-for")?.split(",")[0] ?? h.get("x-real-ip") ?? "local").trim();
}

/** Only allow same-site relative redirects after sign-in. */
function safeNext(next: string) {
  return next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : "/";
}

export async function signInAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const result = await runAction(formData, async () => {
    const email = str(formData, "email");
    await rateLimit(`signin:${await clientKey()}`, 20, 600);
    await rateLimit(`signin-email:${email.toLowerCase()}`, 8, 600);
    const user = await authenticate(email, str(formData, "password"));
    if (!user) return { ok: false, message: "Email or password is incorrect.", values: { email } };
    await startSession(user.id);
  });
  if (result.ok) redirect(safeNext(str(formData, "next")));
  return result;
}

export async function signUpAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const result = await runAction(formData, async () => {
    await rateLimit(`signup:${await clientKey()}`, 5, 3600);
    const user = await registerUser({
      email: str(formData, "email"),
      password: str(formData, "password"),
      handle: str(formData, "handle"),
      displayName: str(formData, "displayName"),
    });
    await startSession(user.id);
  });
  if (result.ok) redirect("/collection?welcome=1");
  return result;
}

export async function signOutAction() {
  await endSession();
  redirect("/");
}
