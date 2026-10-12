import { describe, expect, it } from "vitest";
import { ForbiddenError, NotFoundError, UnauthorizedError, ValidationError } from "@/lib/errors";
import { searchEntries } from "@/server/kb/entries";
import { addProgressLog, collectionStatusFor, deleteProgressLog, listCollection, listProgressLogs, removeFromCollection, setCollectionStatus } from "@/server/me/collection";
import { getPublicProfile, updateProfile } from "@/server/me/profile";
import { makeUser } from "./helpers";

async function entryId(q: string) {
  return (await searchEntries({ q }, null)).items[0]!.id;
}

describe("personal collection", () => {
  it("persists saves and status changes idempotently", async () => {
    const u = await makeUser();
    const barani = await entryId("barani");
    await setCollectionStatus(u, barani, "saved");
    await setCollectionStatus(u, barani, "saved");
    await setCollectionStatus(u, barani, "working_on");
    expect(await collectionStatusFor(u, barani)).toBe("working_on");
    const items = await listCollection(u, u.id);
    expect(items).toHaveLength(1);
    expect(items[0]!.status).toBe("working_on");
    expect(await listCollection(u, u.id, { status: "landed" })).toHaveLength(0);
    expect(await listCollection(u, u.id, { q: "bar" })).toHaveLength(1);
    await removeFromCollection(u, barani);
    expect(await listCollection(u, u.id)).toHaveLength(0);
  });

  it("requires sign-in and only accepts published entries", async () => {
    await expect(setCollectionStatus(null, await entryId("barani"), "saved")).rejects.toBeInstanceOf(UnauthorizedError);
    const u = await makeUser();
    await expect(setCollectionStatus(u, "00000000-0000-0000-0000-000000000000", "saved")).rejects.toBeInstanceOf(NotFoundError);
  });

  it("keeps a private collection private and honours visibility settings", async () => {
    const owner = await makeUser();
    const other = await makeUser();
    await setCollectionStatus(owner, await entryId("cody"), "landed");
    await expect(listCollection(other, owner.id)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(listCollection(null, owner.id)).rejects.toBeInstanceOf(ForbiddenError);

    await updateProfile(owner, { displayName: "Owner", profileVisibility: "public", collectionVisibility: "members" });
    expect(await listCollection(other, owner.id)).toHaveLength(1);
    await expect(listCollection(null, owner.id)).rejects.toBeInstanceOf(ForbiddenError);
    expect((await getPublicProfile(owner.handle, null))?.collection).toBeNull();
    expect((await getPublicProfile(owner.handle, other))?.collection).toHaveLength(1);

    await updateProfile(owner, { displayName: "Owner", profileVisibility: "private", collectionVisibility: "private" });
    expect(await getPublicProfile(owner.handle, other)).toBeNull();
    expect(await getPublicProfile(owner.handle, owner)).not.toBeNull();
  });
});

describe("progress logs", () => {
  it("are visible only to their owner", async () => {
    const owner = await makeUser();
    const other = await makeUser();
    const log = await addProgressLog(owner, { title: "First seat landing", occurredOn: "2026-10-01", entryId: await entryId("seat landing"), kind: "milestone" });
    expect(await listProgressLogs(owner)).toHaveLength(1);
    expect(await listProgressLogs(other)).toHaveLength(0);
    await expect(deleteProgressLog(other, log.id)).rejects.toBeInstanceOf(NotFoundError);
    expect(await listProgressLogs(owner)).toHaveLength(1);
    await deleteProgressLog(owner, log.id);
    expect(await listProgressLogs(owner)).toHaveLength(0);
  });

  it("validates dates and rejects future dates", async () => {
    const u = await makeUser();
    await expect(addProgressLog(u, { title: "x", occurredOn: "2999-01-01" })).rejects.toBeInstanceOf(ValidationError);
    await expect(addProgressLog(u, { title: "", occurredOn: "2026-01-01" })).rejects.toBeInstanceOf(ValidationError);
  });
});
