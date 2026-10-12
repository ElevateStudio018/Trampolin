"use client";

import { ActionForm, Field, FormMessage, Select, SubmitButton, Textarea } from "@/components/forms";
import { reviewAction } from "../../actions";

export function ReviewForm({ draftId, claims, duplicate, isNew }: { draftId: string; claims: { statement: string; supported: boolean; flag?: string }[]; duplicate: { id: string; name: string } | null; isNew: boolean }) {
  return (
    <ActionForm action={reviewAction} className="flex flex-col gap-4">
      {(s) => (
        <>
          <FormMessage state={s} />
          <input type="hidden" name="draftId" value={draftId} />
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-semibold">Claims to import on approval</legend>
            {claims.map((c, i) => (
              <label key={i} className={`flex items-start gap-2 text-sm ${c.supported ? "" : "opacity-60"}`}>
                <input type="checkbox" name="claim" value={i} defaultChecked={c.supported && !c.flag} disabled={!c.supported} className="mt-1" />
                <span>
                  {c.statement}
                  {!c.supported && <span className="ml-1 text-xs text-danger">(no supporting source — cannot be imported)</span>}
                  {c.flag === "conflict" && <span className="ml-1 text-xs text-warn">(involved in a conflict)</span>}
                </span>
              </label>
            ))}
          </fieldset>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Evidence status after approval" name="evidenceStatus" hint="“Verified” only if you checked a primary source in full.">
              <Select name="evidenceStatus" defaultValue="limited_evidence">
                <option value="limited_evidence">Limited evidence</option>
                <option value="verified">Verified</option>
                <option value="conflicting">Conflicting sources</option>
                <option value="community">Community</option>
              </Select>
            </Field>
            {duplicate && isNew && (
              <Field label="Possible duplicate" name="mergeInto" hint="Merging adds the claims and aliases to the existing entry.">
                <Select name="mergeInto" defaultValue={duplicate.id}>
                  <option value={duplicate.id}>Merge into “{duplicate.name}”</option>
                  <option value="">Create a new entry (explain “not a duplicate” in the note)</option>
                </Select>
              </Field>
            )}
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="publish" /> Publish the entry after applying (only if it meets publishing rules)
          </label>
          <Field label="Reviewer note" name="note" error={s.fieldErrors?.note} hint="Required for rejections and conflicts. Saved with the decision.">
            <Textarea name="note" rows={2} maxLength={2000} />
          </Field>
          <div className="flex flex-wrap gap-2">
            <SubmitButton name="decision" value="approved" pendingLabel="Applying…">
              Approve selected
            </SubmitButton>
            <SubmitButton name="decision" value="needs_more_sources" variant="secondary">
              Needs more sources
            </SubmitButton>
            <SubmitButton name="decision" value="conflicting_information" variant="secondary">
              Mark conflicting
            </SubmitButton>
            <SubmitButton name="decision" value="rejected" variant="danger">
              Reject
            </SubmitButton>
          </div>
        </>
      )}
    </ActionForm>
  );
}
