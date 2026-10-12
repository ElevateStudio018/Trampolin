"use client";

import { ActionForm, Field, FormMessage, Input, Select, SubmitButton, Textarea } from "@/components/forms";
import { addEntryNoteAction } from "../tricks/actions";

export function GeneralNoteForm() {
  const today = new Date().toISOString().slice(0, 10);
  return (
    <ActionForm action={addEntryNoteAction} resetOnSuccess className="flex flex-col gap-3">
      {(s) => (
        <>
          <FormMessage state={s} />
          <Field label="Title" name="title" error={s.fieldErrors?.title}>
            <Input name="title" required maxLength={120} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Type" name="kind">
              <Select name="kind" defaultValue="session">
                <option value="session">Training session</option>
                <option value="note">Note</option>
                <option value="milestone">Milestone</option>
              </Select>
            </Field>
            <Field label="Date" name="occurredOn" error={s.fieldErrors?.occurredOn}>
              <Input name="occurredOn" type="date" defaultValue={today} max={today} required />
            </Field>
          </div>
          <Field label="Notes" name="body">
            <Textarea name="body" rows={4} maxLength={5000} />
          </Field>
          <SubmitButton pendingLabel="Saving…">Save</SubmitButton>
        </>
      )}
    </ActionForm>
  );
}
