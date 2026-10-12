"use client";

import { ActionButton, ActionForm, Field, FormMessage, Input, Select, SubmitButton, Textarea } from "@/components/forms";
import { drainAction, gapScanAction, researchAction } from "../actions";

export function GapScanButton() {
  return (
    <ActionButton action={gapScanAction} fields={{}} variant="secondary" size="md" pendingLabel="Queuing…">
      Run gap scan
    </ActionButton>
  );
}

export function DrainButton() {
  return (
    <ActionButton action={drainAction} fields={{}} variant="ghost" size="md" pendingLabel="Processing…">
      Process queue now
    </ActionButton>
  );
}

export function ResearchForm({ entries, searchEnabled }: { entries: { id: string; name: string }[]; searchEnabled: boolean }) {
  return (
    <ActionForm action={researchAction} resetOnSuccess className="flex flex-col gap-3">
      {(s) => (
        <>
          <FormMessage state={s} />
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Existing entry" name="entryId">
              <Select name="entryId" defaultValue="">
                <option value="">— New topic —</option>
                {entries.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="…or new topic" name="topic" error={s.fieldErrors?.topic}>
              <Input name="topic" maxLength={80} placeholder="e.g. Back somersault" />
            </Field>
          </div>
          <Field
            label="Source URLs (one per line, up to 5)"
            name="urls"
            hint={searchEnabled ? "Optional — the agent also searches the web." : "Web search is not configured, so give at least one URL or paste text below."}
          >
            <Textarea name="urls" rows={3} placeholder="https://…" />
          </Field>
          <details className="rounded-[var(--radius-control)] border border-line p-3">
            <summary className="cursor-pointer text-sm font-medium">Paste text from a page the server can&apos;t fetch</summary>
            <div className="mt-3 flex flex-col gap-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Page URL" name="pastedUrl">
                  <Input name="pastedUrl" type="url" />
                </Field>
                <Field label="Page title" name="pastedTitle">
                  <Input name="pastedTitle" maxLength={300} />
                </Field>
              </div>
              <Field label="Text" name="pastedText" hint="Copied verbatim. Respect the site's terms; paste only the relevant passage.">
                <Textarea name="pastedText" rows={5} maxLength={20000} />
              </Field>
            </div>
          </details>
          <div>
            <SubmitButton pendingLabel="Queuing…">Start research</SubmitButton>
          </div>
        </>
      )}
    </ActionForm>
  );
}
