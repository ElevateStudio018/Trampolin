"use server";

import type { ActionState } from "@/lib/action-state";
import { runAction, str } from "@/server/action";
import { getActor } from "@/server/auth/current";
import { addComment, createPost, deleteComment, deletePost, fileReport, toggleBookmark, toggleLike } from "@/server/community/service";

export async function createPostAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(fd, async () => {
    await createPost(await getActor(), {
      body: str(fd, "body"),
      entryId: str(fd, "entryId") || null,
      videoId: str(fd, "videoId") || null,
      visibility: (str(fd, "visibility") || "members") as "members",
    });
    return { ok: true, message: "Posted." };
  });
}

export async function likeAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(fd, async () => void (await toggleLike(await getActor(), str(fd, "postId"))));
}

export async function bookmarkAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(fd, async () => void (await toggleBookmark(await getActor(), str(fd, "postId"))));
}

export async function commentAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(fd, async () => {
    await addComment(await getActor(), str(fd, "postId"), str(fd, "body"));
  });
}

export async function deletePostAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(fd, async () => {
    await deletePost(await getActor(), str(fd, "postId"));
    return { ok: true, redirectTo: "/community" };
  });
}

export async function deleteCommentAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(fd, async () => deleteComment(await getActor(), str(fd, "commentId")));
}

export async function reportAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(fd, async () => {
    await fileReport(await getActor(), {
      targetType: str(fd, "targetType") as "post",
      targetId: str(fd, "targetId"),
      reason: str(fd, "reason") as "spam",
      details: str(fd, "details"),
    });
    return { ok: true, message: "Thanks. A moderator will review this." };
  });
}
