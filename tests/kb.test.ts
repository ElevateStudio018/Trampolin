import { describe, expect, it } from "vitest";
import { ConflictError, ForbiddenError, UnauthorizedError, ValidationError } from "@/lib/errors";
import { createEntry, findPossibleDuplicates, getEntryBySlug, searchEntries, setEntryState, updateEntry } from "@/server/kb/entries";
import { addClaim, upsertSource } from "@/server/kb/sources";
import { makeUser } from "./helpers";

describe("search", () => {
  it("finds entries by name, alias and misspelling", async () => {
    expect((await searchEntries({ q: "barani" }, null)).items[0]?.canonicalName).toBe("Barani");
    expect((await searchEntries({ q: "rudy" }, null)).items[0]?.canonicalName).toBe("Rudolph");
    expect((await searchEntries({ q: "rudi" }, null)).items[0]?.canonicalName).toBe("Rudolph");
    expect((await searchEntries({ q: "baranni" }, null)).items[0]?.canonicalName).toBe("Barani");
    expect((await searchEntries({ q: "BBO" }, null)).items[0]?.canonicalName).toBe("Barani ball out");
  });

  it("returns an empty result for nonsense", async () => {
    const r = await searchEntries({ q: "qwxzzy" }, null);
    expect(r.total).toBe(0);
    expect(r.items).toEqual([]);
  });

  it("filters by category and evidence status", async () => {
    const r = await searchEntries({ category: "competition" }, null);
    expect(r.total).toBeGreaterThan(0);
    expect(r.items.every((i) => i.categorySlug === "competition")).toBe(true);
    const c = await searchEntries({ evidence: "conflicting" }, null);
    expect(c.items.map((i) => i.canonicalName).sort()).toEqual(["Adolph", "Corkscrew"]);
  });

  it("hides drafts from visitors and members but not reviewers", async () => {
    const member = await makeUser();
    const reviewer = await makeUser("reviewer");
    expect((await searchEntries({ q: "back somersault" }, null)).items.some((i) => i.canonicalName === "Back somersault")).toBe(false);
    expect((await searchEntries({ q: "back somersault", includeDrafts: true }, member)).items.some((i) => i.canonicalName === "Back somersault")).toBe(false);
    expect((await searchEntries({ q: "back somersault", includeDrafts: true }, reviewer)).items.some((i) => i.canonicalName === "Back somersault")).toBe(true);
    expect(await getEntryBySlug("back-somersault", null)).toBeNull();
    expect(await getEntryBySlug("back-somersault", reviewer)).not.toBeNull();
  });

  it("paginates", async () => {
    const p1 = await searchEntries({ pageSize: 5, page: 1, sort: "name" }, null);
    const p2 = await searchEntries({ pageSize: 5, page: 2, sort: "name" }, null);
    expect(p1.items).toHaveLength(5);
    expect(p1.items[0]!.id).not.toBe(p2.items[0]!.id);
    expect(p1.pageCount).toBeGreaterThan(1);
  });
});

describe("entry detail", () => {
  it("includes claims with traceable sources", async () => {
    const e = await getEntryBySlug("barani", null);
    expect(e).not.toBeNull();
    expect(e!.claims.length).toBeGreaterThan(0);
    for (const c of e!.claims) for (const s of c.citations) expect(s.url).toMatch(/^https:\/\//);
    expect(e!.aliases.map((a) => a.alias)).toContain("Front half");
  });
});

describe("duplicate detection", () => {
  it("detects exact alias matches and near-duplicates", async () => {
    const exact = await findPossibleDuplicates(["Rudy"]);
    expect(exact[0]).toMatchObject({ name: "Rudolph", match: "exact" });
    const similar = await findPossibleDuplicates(["Rudolf"]);
    expect(similar[0]?.name).toBe("Rudolph");
    expect(await findPossibleDuplicates(["Completely new skill name"])).toEqual([]);
  });

  it("refuses to create an entry whose name is another entry's alias", async () => {
    const reviewer = await makeUser("reviewer");
    await expect(createEntry({ canonicalName: "Rudy", summary: "A duplicate of an existing skill." }, reviewer)).rejects.toBeInstanceOf(ConflictError);
    await expect(createEntry({ canonicalName: "Brand new skill", summary: "Something new entirely.", aliases: ["BBO"] }, reviewer)).rejects.toBeInstanceOf(ConflictError);
  });
});

describe("editing permissions and publishing rules", () => {
  it("members and visitors cannot create entries", async () => {
    const member = await makeUser();
    await expect(createEntry({ canonicalName: "Test skill A", summary: "Some summary text." }, member)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(createEntry({ canonicalName: "Test skill A", summary: "Some summary text." }, null)).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("enforces publish rules, revisions and optimistic concurrency", async () => {
    const reviewer = await makeUser("reviewer");
    const e = await createEntry({ canonicalName: "Test publish skill", summary: "Draft summary for testing.", evidenceStatus: "ai_draft" }, reviewer);
    expect(e.state).toBe("draft");
    await expect(setEntryState(e.id, "published", reviewer)).rejects.toThrow(/AI drafts cannot be published/);

    const updated = await updateEntry(e.id, { canonicalName: "Test publish skill", summary: "Reviewed summary for testing.", evidenceStatus: "limited_evidence" }, 1, "Reviewed", reviewer);
    expect(updated.revision).toBe(2);
    await expect(updateEntry(e.id, { canonicalName: "Test publish skill", summary: "Stale edit for testing." }, 1, "Stale", reviewer)).rejects.toBeInstanceOf(ConflictError);

    await expect(setEntryState(e.id, "published", reviewer)).rejects.toThrow(/at least one claim/);
    // State changes and claims bump the history revision but not the content version.
    expect((await getEntryBySlug(e.slug, reviewer))!.contentVersion).toBe(2);
    await expect(addClaim(e.id, { statement: "An uncited claim marked limited.", status: "limited", citations: [] }, reviewer)).rejects.toBeInstanceOf(ValidationError);

    const src = await upsertSource({ url: "https://example.org/glossary", title: "Example glossary" });
    const again = await upsertSource({ url: "https://www.example.org/glossary/#top", title: "Duplicate" });
    expect(again.id).toBe(src.id);
    await addClaim(e.id, { statement: "A cited claim about the test skill.", status: "limited", citations: [{ sourceId: src.id, excerpt: "quote", stance: "supports" }] }, reviewer);
    await setEntryState(e.id, "published", reviewer);
    const pub = await getEntryBySlug(e.slug, null);
    expect(pub?.state).toBe("published");
    expect(pub!.revisions.length).toBeGreaterThanOrEqual(3);
  });
});
