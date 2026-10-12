"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import type { ActionState } from "@/lib/action-state";
import { assertRole } from "@/server/actor";
import { runAction, str } from "@/server/action";
import { getActor } from "@/server/auth/current";
import { resolveReport, setSuspended, setUserRole } from "@/server/community/service";
import { drain } from "@/server/jobs/runner";
import { createEntry, setEntryState, setRelation, updateEntry, type EntryInput } from "@/server/kb/entries";
import { addClaim, removeClaim, upsertSource } from "@/server/kb/sources";
import { reviewDraft } from "@/server/research/drafts";
import { enqueueGapScan, requestResearch } from "@/server/research/pipeline";

const lines = (s: string) =>
  s
    .split(/[\n,]/)
    .map((x) => x.trim())
    .filter(Boolean);

function entryInput(fd: FormData): EntryInput {
  return {
    canonicalName: str(fd, "canonicalName"),
    summary: str(fd, "summary"),
    body: str(fd, "body"),
    kind: str(fd, "kind") as "skill",
    categorySlug: str(fd, "categorySlug") || null,
    figNotation: str(fd, "figNotation") || null,
    quarterRotations: str(fd, "quarterRotations") as unknown as number,
    halfTwists: str(fd, "halfTwists") as unknown as number,
    position: (str(fd, "position") || null) as "tuck" | null,
    evidenceStatus: str(fd, "evidenceStatus") as "ai_draft",
    tags: lines(str(fd, "tags")).map((t) => t.toLowerCase()),
    aliases: lines(str(fd, "aliases")),
  };
}

export async function createEntryAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(fd, async () => {
    const e = await createEntry(entryInput(fd), await getActor());
    return { ok: true, redirectTo: `/studio/entries/${e.id}` };
  });
}

export async function updateEntryAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(fd, async () => {
    const updated = await updateEntry(str(fd, "id"), entryInput(fd), Number(str(fd, "contentVersion")), str(fd, "changeSummary"), await getActor());
    revalidatePath("/tricks", "layout");
    return { ok: true, message: "Saved as a new revision.", values: { contentVersion: String(updated.contentVersion) } };
  });
}

export async function setStateAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(fd, async () => {
    await setEntryState(str(fd, "id"), str(fd, "state") as "published", await getActor());
    revalidatePath("/tricks", "layout");
  });
}

export async function addClaimAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(fd, async () => {
    const actor = await getActor();
    assertRole(actor, "reviewer");
    let sourceId = str(fd, "sourceId");
    if (!sourceId && str(fd, "sourceUrl")) {
      const s = await upsertSource({
        url: str(fd, "sourceUrl"),
        title: str(fd, "sourceTitle") || str(fd, "sourceUrl"),
        publisher: str(fd, "sourcePublisher"),
        reliability: (str(fd, "sourceReliability") || "unknown") as "unknown",
        retrievalMethod: str(fd, "retrievalMethod") || "manual reviewer entry",
      });
      sourceId = s.id;
    }
    await addClaim(
      str(fd, "entryId"),
      {
        statement: str(fd, "statement"),
        status: str(fd, "status") as "limited",
        citations: sourceId ? [{ sourceId, stance: (str(fd, "stance") || "supports") as "supports", excerpt: str(fd, "excerpt") }] : [],
      },
      actor,
      undefined,
      { recordRevision: true },
    );
    return { ok: true, message: "Claim added." };
  });
}

export async function removeClaimAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(fd, async () => removeClaim(str(fd, "claimId"), await getActor()));
}

export async function addRelationAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(fd, async () => {
    await setRelation(str(fd, "fromId"), str(fd, "toId"), str(fd, "kind") as "related", str(fd, "note"), await getActor());
    return { ok: true, message: "Link saved." };
  });
}

export async function reviewAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(fd, async () => {
    const res = await reviewDraft(await getActor(), str(fd, "draftId"), {
      decision: str(fd, "decision") as "approved",
      note: str(fd, "note"),
      claimIndexes: fd.getAll("claim").map((v) => Number(v)),
      evidenceStatus: (str(fd, "evidenceStatus") || undefined) as "limited_evidence" | undefined,
      publish: str(fd, "publish") === "on",
      mergeIntoEntryId: str(fd, "mergeInto") || null,
    });
    revalidatePath("/tricks", "layout");
    return { ok: true, message: res.appliedEntryId ? "Approved and applied to the Trick Book." : "Decision recorded." };
  });
}

function kick() {
  after(() => drain(5 * 60_000, ["research.gap_scan", "research.entry"]).catch((e) => console.error("[research]", e)));
}

export async function gapScanAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(fd, async () => {
    const actor = await getActor();
    assertRole(actor, "reviewer");
    const res = await enqueueGapScan(actor.id, "manual");
    kick();
    return { ok: true, message: res.created ? "Gap scan queued." : "A gap scan is already queued or running." };
  });
}

export async function researchAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(fd, async () => {
    const actor = await getActor();
    const pastedText = str(fd, "pastedText");
    const res = await requestResearch(actor, {
      entryId: str(fd, "entryId") || null,
      topic: str(fd, "topic"),
      urls: lines(str(fd, "urls")),
      pasted: pastedText ? [{ url: str(fd, "pastedUrl"), title: str(fd, "pastedTitle"), text: pastedText }] : [],
    });
    kick();
    return { ok: true, message: res.created ? "Research job queued." : "An identical job is already queued or running." };
  });
}

export async function drainAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(fd, async () => {
    const actor = await getActor();
    assertRole(actor, "reviewer");
    const n = await drain(50_000);
    return { ok: true, message: `Processed ${n} job(s).` };
  });
}

export async function resolveReportAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(fd, async () => resolveReport(await getActor(), str(fd, "reportId"), str(fd, "action") as "hide", str(fd, "note")));
}

export async function setRoleAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(fd, async () => setUserRole(await getActor(), str(fd, "userId"), str(fd, "role") as "member"));
}

export async function suspendAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(fd, async () => setSuspended(await getActor(), str(fd, "userId"), str(fd, "suspend") === "1"));
}
