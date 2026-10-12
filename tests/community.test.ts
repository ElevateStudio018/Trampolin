import { describe, expect, it } from "vitest";
import { ForbiddenError, NotFoundError } from "@/lib/errors";
import { addComment, createPost, fileReport, getPost, listFeed, listReports, resolveReport, toggleLike } from "@/server/community/service";
import { exportMyData } from "@/server/me/profile";
import { makeUser } from "./helpers";

describe("community posts", () => {
  it("members-only posts are hidden from visitors", async () => {
    const author = await makeUser();
    const reader = await makeUser();
    const members = await createPost(author, { body: "Members-only update", visibility: "members" });
    const pub = await createPost(author, { body: "Public update", visibility: "public" });
    const anonIds = (await listFeed(null, { limit: 50 })).items.map((p) => p.id);
    expect(anonIds).toContain(pub.id);
    expect(anonIds).not.toContain(members.id);
    expect((await listFeed(reader, { limit: 50 })).items.map((p) => p.id)).toContain(members.id);
    expect(await getPost(null, members.id)).toBeNull();
    await expect(addComment(null, members.id, "hi")).rejects.toThrow();
  });

  it("likes toggle and count correctly", async () => {
    const author = await makeUser();
    const reader = await makeUser();
    const p = await createPost(author, { body: "Like me" });
    expect(await toggleLike(reader, p.id)).toBe(true);
    expect((await getPost(reader, p.id))!.likes).toBe(1);
    expect(await toggleLike(reader, p.id)).toBe(false);
    expect((await getPost(reader, p.id))!.likes).toBe(0);
  });
});

describe("reports and moderation", () => {
  it("deduplicates reports, lets only admins resolve them, and hides content", async () => {
    const author = await makeUser();
    const reporter = await makeUser();
    const admin = await makeUser("admin");
    const p = await createPost(author, { body: "Spammy post", visibility: "members" });
    await fileReport(reporter, { targetType: "post", targetId: p.id, reason: "spam" });
    await fileReport(reporter, { targetType: "post", targetId: p.id, reason: "spam" });
    const open = (await listReports(admin, "open")).filter((r) => r.report.targetId === p.id);
    expect(open).toHaveLength(1);
    await expect(listReports(reporter)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(resolveReport(reporter, open[0]!.report.id, "hide", "")).rejects.toBeInstanceOf(ForbiddenError);

    await resolveReport(admin, open[0]!.report.id, "hide", "spam");
    expect(await getPost(reporter, p.id)).toBeNull();
    expect((await getPost(author, p.id))?.hidden).toBe(true);
    expect((await listReports(admin, "open")).some((r) => r.report.targetId === p.id)).toBe(false);
    await expect(addComment(reporter, p.id, "can't comment on hidden")).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("data export", () => {
  it("includes the user's data but no storage paths or password hash", async () => {
    const u = await makeUser();
    await createPost(u, { body: "Exported post" });
    const data = await exportMyData(u);
    const json = JSON.stringify(data);
    expect(data.posts).toHaveLength(1);
    expect(json).not.toMatch(/password|storageKey|scrypt\$/);
  });
});

describe("bookmarks and admin user management", () => {
  it("bookmarks toggle and list only visible posts", async () => {
    const { toggleBookmark, listBookmarks } = await import("@/server/community/service");
    const author = await makeUser();
    const reader = await makeUser();
    const p = await createPost(author, { body: "Bookmark me" });
    expect(await toggleBookmark(reader, p.id)).toBe(true);
    expect((await listBookmarks(reader)).map((x) => x.id)).toContain(p.id);
    expect(await toggleBookmark(reader, p.id)).toBe(false);
    expect(await listBookmarks(reader)).toHaveLength(0);
  });

  it("only admins change roles or suspend, never themselves", async () => {
    const { setUserRole, setSuspended } = await import("@/server/community/service");
    const { authenticate } = await import("@/server/auth/service");
    const admin = await makeUser("admin");
    const reviewer = await makeUser("reviewer");
    const target = await makeUser();
    await expect(setUserRole(reviewer, target.id, "admin")).rejects.toBeInstanceOf(ForbiddenError);
    await expect(setUserRole(admin, admin.id, "member")).rejects.toThrow(/own role/);
    // Handles contain underscores; search must treat them literally.
    const { listUsers } = await import("@/server/community/service");
    expect((await listUsers(admin, target.handle)).map((u) => u.id)).toEqual([target.id]);
    expect(await listUsers(admin, "%")).toEqual([]);
    await setUserRole(admin, target.id, "reviewer");
    await setSuspended(admin, target.id, true);
    expect(await authenticate(target.email, target.password)).toBeNull();
    await setSuspended(admin, target.id, false);
    expect(await authenticate(target.email, target.password)).toEqual({ id: target.id });
  });
});
