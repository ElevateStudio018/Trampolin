"use client";

import { ActionForm, FormMessage, SubmitButton, Textarea } from "@/components/forms";
import { commentAction } from "../actions";

export function CommentForm({ postId }: { postId: string }) {
  return (
    <ActionForm action={commentAction} resetOnSuccess className="flex flex-col gap-2">
      {(s) => (
        <>
          <FormMessage state={s} />
          <input type="hidden" name="postId" value={postId} />
          <label htmlFor="body" className="text-sm font-medium">
            Add a comment
          </label>
          <Textarea name="body" required maxLength={1000} rows={2} />
          <div>
            <SubmitButton size="sm" pendingLabel="Posting…">Comment</SubmitButton>
          </div>
        </>
      )}
    </ActionForm>
  );
}
