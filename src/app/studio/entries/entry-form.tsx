"use client";

import { ActionButton, ActionForm, Field, FormMessage, Input, Select, SubmitButton, Textarea } from "@/components/forms";
import { EVIDENCE_META } from "@/components/ui";
import { addClaimAction, addRelationAction, createEntryAction, removeClaimAction, setStateAction, updateEntryAction } from "../actions";

export type EntryFormValues = {
  id?: string;
  revision?: number;
  canonicalName: string;
  summary: string;
  body: string;
  kind: string;
  categorySlug: string;
  figNotation: string;
  quarterRotations: string;
  halfTwists: string;
  position: string;
  evidenceStatus: string;
  tags: string;
  aliases: string;
};

export function EntryForm({ initial, categories }: { initial: EntryFormValues; categories: { slug: string; name: string }[] }) {
  const editing = Boolean(initial.id);
  return (
    <ActionForm action={editing ? updateEntryAction : createEntryAction} className="flex flex-col gap-4">
      {(s) => {
        const v = (k: keyof EntryFormValues) => s.values?.[k] ?? String(initial[k] ?? "");
        const err = (k: string) => s.fieldErrors?.[k];
        return (
          <>
            <FormMessage state={s} />
            {editing && (
              <>
                <input type="hidden" name="id" value={initial.id} />
                <input type="hidden" name="revision" value={initial.revision} />
              </>
            )}
            <div className="grid gap-4 sm:grid-cols-[1fr_10rem]">
              <Field label="Canonical name" name="canonicalName" error={err("canonicalName")}>
                <Input name="canonicalName" defaultValue={v("canonicalName")} required maxLength={80} />
              </Field>
              <Field label="Kind" name="kind">
                <Select name="kind" defaultValue={v("kind")}>
                  <option value="skill">Skill</option>
                  <option value="term">Term</option>
                  <option value="rule">Rule</option>
                </Select>
              </Field>
            </div>
            <Field label="Aliases & spelling variants" name="aliases" hint="Comma or newline separated. Each alias may belong to only one entry." error={err("aliases")}>
              <Textarea name="aliases" defaultValue={v("aliases")} rows={2} />
            </Field>
            <Field label="Summary" name="summary" hint="One or two sentences, consistent with the sourced claims." error={err("summary")}>
              <Textarea name="summary" defaultValue={v("summary")} rows={2} maxLength={600} required />
            </Field>
            <Field label="Body (optional)" name="body" hint="Context and distinctions. Don't add facts that no claim supports." error={err("body")}>
              <Textarea name="body" defaultValue={v("body")} rows={4} maxLength={10000} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Category" name="categorySlug" error={err("categorySlug")}>
                <Select name="categorySlug" defaultValue={v("categorySlug")}>
                  <option value="">None</option>
                  {categories.map((c) => (
                    <option key={c.slug} value={c.slug}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Evidence status" name="evidenceStatus" error={err("evidenceStatus")}>
                <Select name="evidenceStatus" defaultValue={v("evidenceStatus")}>
                  {Object.entries(EVIDENCE_META).map(([k, m]) => (
                    <option key={k} value={k}>
                      {m.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="FIG notation" name="figNotation" error={err("figNotation")}>
                <Input name="figNotation" defaultValue={v("figNotation")} maxLength={20} className="font-mono" />
              </Field>
              <Field label="Quarter rotations" name="quarterRotations" error={err("quarterRotations")}>
                <Input name="quarterRotations" type="number" min={0} max={20} defaultValue={v("quarterRotations")} />
              </Field>
              <Field label="Half twists" name="halfTwists" error={err("halfTwists")}>
                <Input name="halfTwists" type="number" min={0} max={20} defaultValue={v("halfTwists")} />
              </Field>
              <Field label="Position" name="position">
                <Select name="position" defaultValue={v("position")}>
                  <option value="">Not specified</option>
                  {["tuck", "pike", "straight", "straddle", "any", "none"].map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <Field label="Tags" name="tags" hint="Comma separated, lowercase." error={err("tags")}>
              <Input name="tags" defaultValue={v("tags")} />
            </Field>
            {editing && (
              <Field label="Change summary" name="changeSummary" error={err("changeSummary")} hint="Recorded in the revision history.">
                <Input name="changeSummary" required maxLength={200} />
              </Field>
            )}
            <div>
              <SubmitButton pendingLabel="Saving…">{editing ? "Save revision" : "Create draft entry"}</SubmitButton>
            </div>
          </>
        );
      }}
    </ActionForm>
  );
}

export function StateButtons({ id, state }: { id: string; state: string }) {
  return (
    <div className="flex flex-wrap gap-2">
      {state !== "published" && (
        <ActionButton action={setStateAction} fields={{ id, state: "published" }} variant="primary" size="md">
          Publish
        </ActionButton>
      )}
      {state === "published" && (
        <ActionButton action={setStateAction} fields={{ id, state: "draft" }} variant="secondary" size="md">
          Unpublish
        </ActionButton>
      )}
      {state !== "archived" && (
        <ActionButton action={setStateAction} fields={{ id, state: "archived" }} variant="danger" size="md" confirm="Archive this entry? It disappears from the Trick Book.">
          Archive
        </ActionButton>
      )}
    </div>
  );
}

export function RemoveClaimButton({ claimId }: { claimId: string }) {
  return (
    <ActionButton action={removeClaimAction} fields={{ claimId }} variant="ghost" confirm="Remove this claim?">
      Remove
    </ActionButton>
  );
}

export function AddClaimForm({ entryId, sources }: { entryId: string; sources: { id: string; title: string; publisher: string }[] }) {
  return (
    <ActionForm action={addClaimAction} resetOnSuccess className="flex flex-col gap-3">
      {(s) => (
        <>
          <FormMessage state={s} />
          <input type="hidden" name="entryId" value={entryId} />
          <Field label="Statement" name="statement" error={s.fieldErrors?.statement}>
            <Textarea name="statement" rows={2} required maxLength={800} />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Claim status" name="status">
              <Select name="status" defaultValue="limited">
                <option value="supported">Supported (primary source)</option>
                <option value="limited">Limited support</option>
                <option value="disputed">Disputed</option>
                <option value="unsupported">Unsupported</option>
              </Select>
            </Field>
            <Field label="Stance of the source" name="stance">
              <Select name="stance" defaultValue="supports">
                <option value="supports">Supports</option>
                <option value="contradicts">Contradicts</option>
                <option value="context">Context only</option>
              </Select>
            </Field>
          </div>
          <Field label="Existing source" name="sourceId">
            <Select name="sourceId" defaultValue="">
              <option value="">— or add a new source below —</option>
              {sources.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.publisher ? `${x.publisher}: ` : ""}
                  {x.title}
                </option>
              ))}
            </Select>
          </Field>
          <details className="rounded-[var(--radius-control)] border border-line p-3">
            <summary className="cursor-pointer text-sm font-medium">New source</summary>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <Field label="URL" name="sourceUrl" error={s.fieldErrors?.url}>
                <Input name="sourceUrl" type="url" />
              </Field>
              <Field label="Title" name="sourceTitle">
                <Input name="sourceTitle" maxLength={300} />
              </Field>
              <Field label="Publisher" name="sourcePublisher">
                <Input name="sourcePublisher" maxLength={200} />
              </Field>
              <Field label="Reliability" name="sourceReliability">
                <Select name="sourceReliability" defaultValue="secondary">
                  <option value="primary">Primary (governing body, original rules)</option>
                  <option value="secondary">Secondary</option>
                  <option value="community">Community / club</option>
                  <option value="unknown">Unknown</option>
                </Select>
              </Field>
              <Field label="How you read it" name="retrievalMethod" className="sm:col-span-2">
                <Input name="retrievalMethod" defaultValue="full page read by reviewer" maxLength={120} />
              </Field>
            </div>
          </details>
          <Field label="Excerpt" name="excerpt" hint="Quote the passage that supports the statement.">
            <Textarea name="excerpt" rows={2} maxLength={1500} />
          </Field>
          <div>
            <SubmitButton size="sm" pendingLabel="Adding…">Add claim</SubmitButton>
          </div>
        </>
      )}
    </ActionForm>
  );
}

export function RelationForm({ fromId, entries }: { fromId: string; entries: { id: string; name: string }[] }) {
  return (
    <ActionForm action={addRelationAction} resetOnSuccess className="flex flex-col gap-3">
      {(s) => (
        <>
          <FormMessage state={s} />
          <input type="hidden" name="fromId" value={fromId} />
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Entry" name="toId">
              <Select name="toId" required>
                {entries.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Relationship" name="kind">
              <Select name="kind" defaultValue="related">
                <option value="related">Related</option>
                <option value="variant_of">Variant of</option>
                <option value="distinct_from">Not to be confused with</option>
                <option value="component_of">Part of</option>
              </Select>
            </Field>
          </div>
          <Field label="Note" name="note">
            <Input name="note" maxLength={300} />
          </Field>
          <div>
            <SubmitButton size="sm" variant="secondary">Save link</SubmitButton>
          </div>
        </>
      )}
    </ActionForm>
  );
}
