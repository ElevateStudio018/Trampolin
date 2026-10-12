"use server";

import type { ActionState } from "@/lib/action-state";
import { runAction, str } from "@/server/action";
import { answerQuestion, clearAssistantHistory } from "@/server/assistant/answer";
import { getActor } from "@/server/auth/current";

export async function askAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(fd, async () => {
    const res = await answerQuestion(await getActor(), str(fd, "question"));
    return { ok: true, redirectTo: `/assistant?a=${res.id}` };
  });
}

export async function clearHistoryAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(fd, async () => {
    await clearAssistantHistory(await getActor());
    return { ok: true, redirectTo: "/assistant" };
  });
}
