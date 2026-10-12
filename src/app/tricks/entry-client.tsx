"use client";

import { ActionButton, ActionForm, Field, FormMessage, Input, Select, SubmitButton, Textarea } from "@/components/forms";
import { COLLECTION_META } from "@/components/ui";
import { addEntryNoteAction, setCollectionAction, suggestAction } from "./actions";

export function CollectionControls({ entryId, status }: { entryId: string; status: string | null }) {
  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Collection status">
      {(["saved", "working_on", "landed"] as const).map((s) => (
        <ActionButton
          key={s}
          action={setCollectionAction}
          fields={{ entryId, status: s }}
          variant={status === s ? "primary" : "secondary"}
          ariaPressed={status === s}
        >
          {status === s ? "✓ " : ""}
          {COLLECTION_META[s]!.label}
        </ActionButton>
      ))}
      {status && (
        <ActionButton action={setCollectionAction} fields={{ entryId, status: "remove" }} variant="ghost">
          Remove
        </ActionButton>
      )}
    </div>
  );
}

export function NoteForm({ entryId, videos }: { entryId: string; videos: { id: string; title: string }[] }) {
  const today = new Date().toISOString().slice(0, 10);
  return (
    <ActionForm action={addEntryNoteAction} resetOnSuccess className="flex flex-col gap-3">
      {(s) => (
        <>
          <FormMessage state={s} />
          <input type="hidden" name="entryId" value={entryId} />
          <div className="grid gap-3 sm:grid-cols-[1fr_10rem_9rem]">
            <Field label="Title" name="title" error={s.fieldErrors?.title}>
              <Input name="title" required maxLength={120} placeholder="e.g. First time on the big trampoline" />
            </Field>
            <Field label="Type" name="kind">
              <Select name="kind" defaultValue="note">
                <option value="note">Note</option>
                <option value="session">Training session</option>
                <option value="milestone">Milestone</option>
              </Select>
            </Field>
            <Field label="Date" name="occurredOn" error={s.fieldErrors?.occurredOn}>
              <Input name="occurredOn" type="date" defaultValue={today} max={today} required />
            </Field>
          </div>
          <Field label="Notes" name="body" hint="Only you can see this.">
            <Textarea name="body" maxLength={5000} rows={3} />
          </Field>
          {videos.length > 0 && (
            <Field label="Attach one of your videos (optional)" name="videoId">
              <Select name="videoId" defaultValue="">
                <option value="">No video</option>
                {videos.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.title}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          <div>
            <SubmitButton size="sm" pendingLabel="Saving…">Save note</SubmitButton>
          </div>
        </>
      )}
    </ActionForm>
  );
}

export function SuggestForm({ entryId, topic }: { entryId?: string; topic?: string }) {
  return (
    <ActionForm action={suggestAction} resetOnSuccess className="flex flex-col gap-3">
      {(s) => (
        <>
          <FormMessage state={s} />
          {entryId && <input type="hidden" name="entryId" value={entryId} />}
          {!entryId && (
            <Field label="Skill or term" name="topic" error={s.fieldErrors?.topic}>
              <Input name="topic" required defaultValue={s.values?.topic ?? topic} maxLength={80} />
            </Field>
          )}
          {entryId && <input type="hidden" name="topic" value={topic} />}
          <Field label="What should be added or corrected?" name="statement" error={s.fieldErrors?.statement} hint="One factual statement, e.g. a definition or an alternative name.">
            <Textarea name="statement" required maxLength={800} rows={3} defaultValue={s.values?.statement} />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Source URL" name="sourceUrl" error={s.fieldErrors?.sourceUrl} hint="Strongly recommended. Unsourced suggestions wait for a reviewer to find one.">
              <Input name="sourceUrl" type="url" placeholder="https://" defaultValue={s.values?.sourceUrl} />
            </Field>
            <Field label="Source title" name="sourceTitle">
              <Input name="sourceTitle" maxLength={300} defaultValue={s.values?.sourceTitle} />
            </Field>
          </div>
          <Field label="Other names (comma-separated)" name="aliases">
            <Input name="aliases" maxLength={300} defaultValue={s.values?.aliases} />
          </Field>
          <div>
            <SubmitButton size="sm" variant="secondary" pendingLabel="Sending…">Send for review</SubmitButton>
          </div>
        </>
      )}
    </ActionForm>
  );
}
