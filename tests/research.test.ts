import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { entries, jobs, researchDrafts } from "@/db/schema";
import { ConflictError, ForbiddenError, ValidationError } from "@/lib/errors";
import { runOne } from "@/server/jobs/runner";
import { getEntryBySlug, searchEntries } from "@/server/kb/entries";
import { detectConflicts, excerptExtract, findAliases, somersaultCount, twistCount } from "@/server/research/extract";
import { FetchBlockedError, assertFetchable, htmlToText, parseRobots } from "@/server/research/fetcher";
import { getDraft, listDrafts, reviewDraft, submitSuggestion } from "@/server/research/drafts";
import { findGaps, requestResearch } from "@/server/research/pipeline";
import { setSearchProviderForTests } from "@/server/research/search-providers";
import { makeUser } from "./helpers";

afterEach(() => setSearchProviderForTests(undefined));

const DOC_A = `Trampoline glossary. A back somersault is a full backward rotation from feet to feet, also known as a back salto. It is one of the first somersaults learned on the trampoline. Unrelated sentence about the club cafe opening hours and parking.`;
const DOC_B = `Skills list. A back somersault is a full backward rotation from feet to feet, also known as the back salto. It may be performed tucked, piked or straight. Our coaches run sessions on Tuesdays.`;

describe("extraction", () => {
  it("extracts verbatim sentences that mention the topic and merges near-duplicates", () => {
    const out = excerptExtract({
      topic: "Back somersault",
      aliases: [],
      documents: [
        { sourceId: "s1", url: "https://a.example/x", title: "A", text: DOC_A },
        { sourceId: "s2", url: "https://b.example/y", title: "B", text: DOC_B },
      ],
    });
    expect(out.claims.length).toBeGreaterThan(0);
    for (const c of out.claims) {
      for (const r of c.sourceRefs) expect([DOC_A, DOC_B].some((d) => d.includes(r.excerpt))).toBe(true);
      expect(c.statement.toLowerCase()).toContain("back somersault");
    }
    expect(out.claims.some((c) => c.sourceRefs.length === 2)).toBe(true);
    expect(out.claims.some((c) => /cafe|Tuesdays/.test(c.statement))).toBe(false);
    expect(out.extractor).toBe("excerpt-v1");
  });

  it("finds aliases written next to the topic", () => {
    expect(findAliases("A Rudolph (or Rudy) is a front somersault.", "Rudolph")).toContain("Rudy");
    expect(findAliases(DOC_A, "back somersault")).toContain("back salto");
  });

  it("parses twist counts and flags numeric conflicts between sources", () => {
    expect(twistCount("a single front somersault with one and a half twists")).toBe(1.5);
    expect(twistCount("with 2½ twists")).toBe(2.5);
    expect(twistCount("with three twists")).toBe(3);
    expect(twistCount("with a half twist")).toBe(0.5);
    const conflict = detectConflicts([
      { statement: "The Miller has three twists.", sourceRefs: [{ sourceId: "a", excerpt: "", stance: "supports" }] },
      { statement: "The Miller has 2½ twists.", sourceRefs: [{ sourceId: "b", excerpt: "", stance: "supports" }] },
    ]);
    expect(conflict.conflicting).toBe(true);
    expect(detectConflicts([{ statement: "It has one twist.", sourceRefs: [] }]).conflicting).toBe(false);
  });

  it("parses somersault counts and flags rotation conflicts", () => {
    expect(somersaultCount("A cody is a one and one quarter back somersault from front landing")).toBe(1.25);
    expect(somersaultCount("a barani is a front somersault with a half twist")).toBe(1);
    expect(somersaultCount("a double back somersault with three full twists")).toBe(2);
    expect(somersaultCount("Three quarter straight back somersault that lands in front drop position")).toBe(0.75);
    expect(somersaultCount("any triple somersault combined with a component of twist")).toBe(3);
    expect(somersaultCount("1¼ front somersault landing on the feet")).toBe(1.25);
    expect(somersaultCount("It lands on the feet.")).toBeNull();
    const c = detectConflicts([
      { statement: "A kaboom is a three quarter back somersault from the back.", sourceRefs: [{ sourceId: "a", excerpt: "", stance: "supports" }] },
      { statement: "A kaboom is a one and a quarter back somersault from the back.", sourceRefs: [{ sourceId: "b", excerpt: "", stance: "supports" }] },
    ]);
    expect(c.conflicting).toBe(true);
    expect(c.questions[0]).toMatch(/somersaults/);
    expect(detectConflicts([
      { statement: "A barani is a front somersault with a half twist.", sourceRefs: [] },
      { statement: "The barani: a single forward somersault with a half twist.", sourceRefs: [] },
    ]).conflicting).toBe(false);
  });
});

describe("fetch safety", () => {
  it("refuses non-https, credentials and private addresses", async () => {
    await expect(assertFetchable("http://example.com")).rejects.toBeInstanceOf(FetchBlockedError);
    await expect(assertFetchable("https://user:pw@example.com")).rejects.toBeInstanceOf(FetchBlockedError);
    await expect(assertFetchable("https://localhost/")).rejects.toBeInstanceOf(FetchBlockedError);
    await expect(assertFetchable("https://127.0.0.1/")).rejects.toBeInstanceOf(FetchBlockedError);
    await expect(assertFetchable("https://10.0.0.5/")).rejects.toBeInstanceOf(FetchBlockedError);
  });

  it("honours robots.txt", () => {
    const robots = "User-agent: *\nDisallow: /private\nAllow: /private/glossary\n";
    expect(parseRobots(robots, "/glossary")).toBe(true);
    expect(parseRobots(robots, "/private/x")).toBe(false);
    expect(parseRobots(robots, "/private/glossary")).toBe(true);
    expect(parseRobots("User-agent: *\nDisallow: /\n", "/anything")).toBe(false);
    expect(parseRobots("User-agent: OtherBot\nDisallow: /\n", "/anything")).toBe(true);
  });

  it("strips markup, scripts and decodes entities", () => {
    const t = htmlToText("<html><head><title>T &amp; T</title><script>evil()</script></head><body><p>One &frac12; twist</p><p>Two</p></body></html>");
    expect(t.title).toBe("T & T");
    expect(t.text).toContain("One ½ twist");
    expect(t.text).not.toContain("evil");
  });
});

describe("research pipeline", () => {
  it("identifies gaps such as unsourced drafts", async () => {
    const gaps = await findGaps(50);
    const back = gaps.find((g) => g.name === "Back somersault");
    expect(back?.reasons).toContain("No supporting sources");
  });

  it("only reviewers can request research; duplicate requests share one job", async () => {
    const member = await makeUser();
    const reviewer = await makeUser("reviewer");
    await expect(requestResearch(member, { topic: "Anything" })).rejects.toBeInstanceOf(ForbiddenError);
    const input = { topic: "Duplicate check topic", pasted: [{ url: "https://dup.example/a", title: "Dup", text: "Duplicate check topic is a test sentence about a somersault rotation." }] };
    const a = await requestResearch(reviewer, input);
    const b = await requestResearch(reviewer, input);
    expect(a.created).toBe(true);
    expect(b.created).toBe(false);
    expect(b.job.id).toBe(a.job.id);
    await db.delete(jobs).where(eq(jobs.id, a.job.id));
  });

  it("blocks honestly when there is no search provider and no source", async () => {
    setSearchProviderForTests(null);
    const reviewer = await makeUser("reviewer");
    const { job } = await requestResearch(reviewer, { topic: "Nothing to go on" });
    while (await runOne(["research.entry"])) {}
    const [done] = await db.select().from(jobs).where(eq(jobs.id, job.id));
    expect(done!.status).toBe("blocked");
    expect(done!.error).toMatch(/search provider/);
  });

  it("creates a cited draft, never publishes it, and applies only approved supported claims", async () => {
    const reviewer = await makeUser("reviewer");
    const back = (await searchEntries({ q: "back somersault", includeDrafts: true }, reviewer)).items.find((i) => i.canonicalName === "Back somersault")!;
    const { job } = await requestResearch(reviewer, {
      entryId: back.id,
      pasted: [
        { url: "https://a.example/glossary", title: "Glossary A", text: DOC_A },
        { url: "https://b.example/skills", title: "Skills B", text: DOC_B },
      ],
    });
    while (await runOne(["research.entry"])) {}
    const [done] = await db.select().from(jobs).where(eq(jobs.id, job.id));
    expect(done!.status).toBe("succeeded");
    const draftId = (done!.result as { draftId: string }).draftId;
    const draft = await getDraft(reviewer, draftId);
    expect(draft!.status).toBe("pending_review");
    expect(draft!.entryId).toBe(back.id);
    // Nothing changed in the knowledge base yet.
    expect((await getEntryBySlug("back-somersault", reviewer))!.claims).toHaveLength(0);
    expect((await getEntryBySlug("back-somersault", null))).toBeNull();

    // Re-running the same research does not store a second identical draft.
    const again = await requestResearch(reviewer, { entryId: back.id, pasted: [{ url: "https://a.example/glossary", title: "Glossary A", text: DOC_A }, { url: "https://b.example/skills", title: "Skills B", text: DOC_B }] });
    while (await runOne(["research.entry"])) {}
    const [done2] = await db.select().from(jobs).where(eq(jobs.id, again.job.id));
    expect((done2!.result as { created: boolean }).created).toBe(false);

    // Members cannot review; approval needs a supported claim selected.
    const member = await makeUser();
    await expect(reviewDraft(member, draftId, { decision: "approved", claimIndexes: [0] })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(reviewDraft(reviewer, draftId, { decision: "approved", claimIndexes: [] })).rejects.toBeInstanceOf(ValidationError);

    await reviewDraft(reviewer, draftId, { decision: "approved", claimIndexes: [0], evidenceStatus: "limited_evidence" });
    const after = await getEntryBySlug("back-somersault", reviewer);
    expect(after!.claims).toHaveLength(1);
    expect(after!.claims[0]!.citations.length).toBeGreaterThan(0);
    expect(after!.state).toBe("draft");
    await expect(reviewDraft(reviewer, draftId, { decision: "rejected", note: "again" })).rejects.toBeInstanceOf(ConflictError);
  });

  it("marks drafts with contradictory twist counts as conflicting", async () => {
    const reviewer = await makeUser("reviewer");
    const { job } = await requestResearch(reviewer, {
      topic: "Testflip",
      pasted: [
        { url: "https://c.example/1", title: "C1", text: "A Testflip is a front somersault with one and a half twists performed on the trampoline." },
        { url: "https://d.example/2", title: "D2", text: "A Testflip is a front somersault with two and a half twists performed on the trampoline." },
      ],
    });
    while (await runOne(["research.entry"])) {}
    const [done] = await db.select().from(jobs).where(eq(jobs.id, job.id));
    const draft = await getDraft(reviewer, (done!.result as { draftId: string }).draftId);
    expect(draft!.status).toBe("conflicting_information");
    expect(draft!.payload.unresolvedQuestions.join(" ")).toMatch(/disagree/);
    // New topic, not published anywhere.
    expect(await db.select().from(entries).where(eq(entries.normalizedName, "testflip"))).toHaveLength(0);
  });

  it("community suggestions enter the queue and flag possible duplicates", async () => {
    const member = await makeUser();
    const reviewer = await makeUser("reviewer");
    const d1 = await submitSuggestion(member, { topic: "Rudolf", statement: "Another spelling of the Rudolph skill name.", sourceUrl: "https://e.example/glossary" });
    expect(d1.possibleDuplicateOf).not.toBeNull();
    expect(d1.status).toBe("pending_review");
    const d2 = await submitSuggestion(member, { topic: "Unsourced idea", statement: "A claim submitted with no source at all." });
    expect(d2.status).toBe("needs_more_sources");
    const open = await listDrafts(reviewer, "open");
    expect(open.map((d) => d.id)).toEqual(expect.arrayContaining([d1.id, d2.id]));
    await expect(reviewDraft(reviewer, d2.id, { decision: "approved", claimIndexes: [0] })).rejects.toBeInstanceOf(ValidationError);
    await reviewDraft(reviewer, d2.id, { decision: "rejected", note: "No source" });
    const [row] = await db.select().from(researchDrafts).where(eq(researchDrafts.id, d2.id));
    expect(row!.status).toBe("rejected");
  });
});

describe("gap scan", () => {
  it("queues research jobs only when a search provider can serve them", async () => {
    const { runGapScan } = await import("@/server/research/pipeline");
    const { enqueue } = await import("@/server/jobs/queue");
    setSearchProviderForTests(null);
    const { job } = await enqueue("research.gap_scan", {}, `test-gap-${Date.now()}`);
    await runGapScan(job);
    const [done] = await db.select().from(jobs).where(eq(jobs.id, job.id));
    expect(done!.status).toBe("succeeded");
    expect((done!.result as { enqueued: number }).enqueued).toBe(0);

    setSearchProviderForTests({ name: "fake", search: async () => [] });
    const { job: job2 } = await enqueue("research.gap_scan", {}, `test-gap2-${Date.now()}`);
    await runGapScan(job2);
    const [done2] = await db.select().from(jobs).where(eq(jobs.id, job2.id));
    expect((done2!.result as { enqueued: number }).enqueued).toBeGreaterThan(0);
  });
});
