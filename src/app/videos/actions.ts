"use server";

import { after } from "next/server";
import type { ActionState } from "@/lib/action-state";
import { runAction, str } from "@/server/action";
import { getActor } from "@/server/auth/current";
import { drain } from "@/server/jobs/runner";
import { deleteVideo, requestAnalysis, updateVideo } from "@/server/video/service";

export async function updateVideoAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(fd, async () => {
    await updateVideo(await getActor(), str(fd, "id"), {
      title: str(fd, "title"),
      description: str(fd, "description"),
      visibility: str(fd, "visibility") as "private",
      entryId: str(fd, "entryId") || null,
      trainingConsent: str(fd, "trainingConsent") === "on",
    });
    return { ok: true, message: "Saved." };
  });
}

export async function deleteVideoAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(fd, async () => {
    await deleteVideo(await getActor(), str(fd, "id"));
    return { ok: true, redirectTo: "/videos" };
  });
}

export async function analyzeAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(fd, async () => {
    const a = await requestAnalysis(await getActor(), str(fd, "id"), str(fd, "analyzer"));
    if (a.status === "queued") after(() => drain(120_000, ["video.analyze"]).catch((e) => console.error("[analyze]", e)));
  });
}
