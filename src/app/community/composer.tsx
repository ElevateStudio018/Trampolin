"use client";

import { ActionForm, FormMessage, Select, SubmitButton, Textarea } from "@/components/forms";
import { createPostAction } from "./actions";

export function Composer({ videos, entries }: { videos: { id: string; title: string }[]; entries: { id: string; name: string }[] }) {
  return (
    <ActionForm action={createPostAction} resetOnSuccess className="flex flex-col gap-3">
      {(s) => (
        <>
          <FormMessage state={s} />
          <label htmlFor="body" className="sr-only">
            Post
          </label>
          <Textarea name="body" required maxLength={2000} rows={3} placeholder="Share a milestone, a question or a clip…" invalid={!!s.fieldErrors?.body} />
          <div className="grid gap-2 sm:grid-cols-3">
            <Select name="entryId" aria-label="Link a skill" defaultValue="">
              <option value="">No skill linked</option>
              {entries.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </Select>
            <Select name="videoId" aria-label="Attach a video" defaultValue="">
              <option value="">No video</option>
              {videos.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.title}
                </option>
              ))}
            </Select>
            <Select name="visibility" aria-label="Visibility" defaultValue="members">
              <option value="members">Members only</option>
              <option value="public">Public</option>
            </Select>
          </div>
          {s.fieldErrors?.videoId && <p className="text-xs text-danger">{s.fieldErrors.videoId.join(" ")}</p>}
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-muted">Only videos you&apos;ve shared with members or the public can be attached.</p>
            <SubmitButton size="sm" pendingLabel="Posting…">Post</SubmitButton>
          </div>
        </>
      )}
    </ActionForm>
  );
}
