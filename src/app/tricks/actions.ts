"use server";

import { revalidatePath } from "next/cache";
import type { ActionState } from "@/lib/action-state";
import { runAction, str } from "@/server/action";
import { getActor } from "@/server/auth/current";
import { addProgressLog, removeFromCollection, setCollectionStatus, type CollectionStatus } from "@/server/me/collection";
import { submitSuggestion } from "@/server/research/drafts";

export async function setCollectionAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(fd, async () => {
    const actor = await getActor();
    const entryId = str(fd, "entryId");
    const status = str(fd, "status");
    if (status === "remove") await removeFromCollection(actor, entryId);
    else await setCollectionStatus(actor, entryId, status as CollectionStatus);
    revalidatePath("/collection");
  });
}

export async function addEntryNoteAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(fd, async () => {
    const actor = await getActor();
    await addProgressLog(actor, {
      entryId: str(fd, "entryId") || null,
      kind: (str(fd, "kind") || "note") as "note",
      title: str(fd, "title"),
      body: str(fd, "body"),
      occurredOn: str(fd, "occurredOn"),
      videoId: str(fd, "videoId") || null,
    });
    return { ok: true, message: "Saved to your private history." };
  });
}

export async function suggestAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(fd, async () => {
    const actor = await getActor();
    await submitSuggestion(actor, {
      topic: str(fd, "topic"),
      entryId: str(fd, "entryId") || null,
      statement: str(fd, "statement"),
      sourceUrl: str(fd, "sourceUrl"),
      sourceTitle: str(fd, "sourceTitle"),
      aliases: str(fd, "aliases"),
    });
    return { ok: true, message: "Thanks — your suggestion is in the review queue. Reviewers check the source before anything is published." };
  });
}
