"use client";

import { ActionButton, ActionForm, Field, FormMessage, Input, Select, SubmitButton, Textarea } from "@/components/forms";
import { analyzeAction, deleteVideoAction, updateVideoAction } from "../actions";

type V = { id: string; title: string; description: string; visibility: string; entryId: string | null; trainingConsent: boolean };

export function EditVideoForm({ video, entries }: { video: V; entries: { id: string; name: string }[] }) {
  return (
    <ActionForm action={updateVideoAction} className="flex flex-col gap-3">
      {(s) => (
        <>
          <FormMessage state={s} />
          <input type="hidden" name="id" value={video.id} />
          <Field label="Title" name="title" error={s.fieldErrors?.title}>
            <Input name="title" defaultValue={video.title} required maxLength={120} />
          </Field>
          <Field label="Description" name="description">
            <Textarea name="description" defaultValue={video.description} maxLength={2000} rows={2} />
          </Field>
          <Field label="Skill shown" name="entryId">
            <Select name="entryId" defaultValue={video.entryId ?? ""}>
              <option value="">Not specified</option>
              {entries.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Who can watch" name="visibility">
            <Select name="visibility" defaultValue={video.visibility}>
              <option value="private">Only me</option>
              <option value="members">Signed-in members</option>
              <option value="public">Anyone with the link</option>
            </Select>
          </Field>
          <label className="flex items-start gap-2 text-sm text-ink-2">
            <input type="checkbox" name="trainingConsent" defaultChecked={video.trainingConsent} className="mt-1" />
            Allow use for evaluating or training a future skill-recognition model
          </label>
          <div className="flex flex-wrap gap-2">
            <SubmitButton size="sm" pendingLabel="Saving…">Save changes</SubmitButton>
          </div>
        </>
      )}
    </ActionForm>
  );
}

export function DeleteVideoButton({ id }: { id: string }) {
  return (
    <ActionButton action={deleteVideoAction} fields={{ id }} variant="danger" confirm="Delete this video and its file permanently?">
      Delete video
    </ActionButton>
  );
}

export function AnalyzeButton({ id, analyzer, label, disabled }: { id: string; analyzer: string; label: string; disabled?: boolean }) {
  return (
    <ActionButton action={analyzeAction} fields={{ id, analyzer }} variant="secondary" pendingLabel="Requesting…" className={disabled ? "opacity-60" : undefined}>
      {label}
    </ActionButton>
  );
}
