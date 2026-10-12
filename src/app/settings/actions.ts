"use server";

import { redirect } from "next/navigation";
import type { ActionState } from "@/lib/action-state";
import { runAction, str } from "@/server/action";
import { endSession, getActor } from "@/server/auth/current";
import { deleteAccount, updateProfile } from "@/server/me/profile";
import { rateLimit } from "@/server/ratelimit";

export async function updateProfileAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(fd, async () => {
    await updateProfile(await getActor(), {
      displayName: str(fd, "displayName"),
      bio: str(fd, "bio"),
      homeClub: str(fd, "homeClub"),
      profileVisibility: str(fd, "profileVisibility") as "members",
      collectionVisibility: str(fd, "collectionVisibility") as "private",
    });
    return { ok: true, message: "Settings saved." };
  });
}

export async function deleteAccountAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const res = await runAction(fd, async () => {
    const actor = await getActor();
    if (actor) await rateLimit(`delete-account:${actor.id}`, 5, 3600);
    if (str(fd, "confirm") !== "DELETE") return { ok: false, message: "Type DELETE to confirm.", fieldErrors: { confirm: ["Type DELETE"] } };
    await deleteAccount(actor, str(fd, "password"));
    await endSession().catch(() => undefined);
  });
  if (res.ok) redirect("/?deleted=1");
  return res;
}
