"use server";

import type { ActionState } from "@/lib/action-state";
import { runAction, str } from "@/server/action";
import { getActor } from "@/server/auth/current";
import { deleteProgressLog } from "@/server/me/collection";

export async function deleteLogAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(fd, async () => {
    await deleteProgressLog(await getActor(), str(fd, "id"));
  });
}
