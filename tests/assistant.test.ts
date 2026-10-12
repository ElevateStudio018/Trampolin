import { describe, expect, it, vi, beforeEach } from "vitest";
import { EVAL_SET } from "@/server/assistant/eval-set";
import { retrieve } from "@/server/assistant/retrieval";
import { classifyQuestion } from "@/server/assistant/safety";
import { makeUser } from "./helpers";

// The model client is replaced so tests never call an external API.
const llm = vi.hoisted(() => ({ configured: false, response: null as unknown }));
vi.mock("@/server/llm/client", async (orig) => {
  const real = await orig<typeof import("@/server/llm/client")>();
  return {
    ...real,
    llmConfigured: () => llm.configured,
    generateStructured: vi.fn(async () => {
      if (llm.response instanceof Error) throw llm.response;
      return llm.response;
    }),
  };
});

const { answerQuestion } = await import("@/server/assistant/answer");
const { LlmUnavailableError } = await import("@/server/llm/client");

beforeEach(() => {
  llm.configured = false;
  llm.response = null;
});

describe("safety classification", () => {
  it.each([
    ["What is a barani?", "ok"],
    ["What's the difference between a cody and a ball out?", "ok"],
    ["How do I do a back flip?", "instructions"],
    ["Give me drills for a rudy", "instructions"],
    ["Can I safely try a double back?", "readiness"],
    ["Is it safe for me to try a kaboom", "readiness"],
  ])("%s -> %s", (q, expected) => {
    expect(classifyQuestion(q)).toBe(expected);
  });
});

describe("retrieval", () => {
  it("matches names and aliases inside questions", async () => {
    expect((await retrieve("what is a rudy"))[0]?.name).toBe("Rudolph");
    expect((await retrieve("explain the BBO"))[0]?.name).toBe("Barani ball out");
  });
  it("never returns unpublished entries", async () => {
    const r = await retrieve("back somersault");
    expect(r.some((e) => e.name === "Back somersault")).toBe(false);
  });
  it("returns nothing for off-topic questions", async () => {
    expect(await retrieve("best pizza topping")).toEqual([]);
  });
});

describe("evaluation set (retrieval-only mode)", () => {
  it.each(EVAL_SET.map((c) => [c.question, c] as const))("%s", async (_q, c) => {
    const user = await makeUser();
    const a = await answerQuestion(user, c.question);
    const retrievedNames = a.entries.map((e) => e.name);
    for (const n of c.mustRetrieve ?? []) expect(retrievedNames).toContain(n);
    if (c.mustCiteFrom) expect(a.citations.some((ci) => c.mustCiteFrom!.includes(ci.entryName))).toBe(true);
    if (c.expectMode) expect(c.expectMode).toContain(a.mode);
    if (c.expectSafety) expect(a.safety).toBe(c.expectSafety);
    if (c.expectSafety && c.expectSafety !== "ok") expect(a.safetyNotice).toBeTruthy();
    if (c.expectCaveat) expect(a.caveats.join(" ")).toMatch(c.expectCaveat);
    // Every citation key used in a block resolves to a returned citation with a real source URL.
    const keys = new Set(a.citations.map((x) => x.key));
    for (const b of a.blocks) for (const k of b.citationKeys) expect(keys.has(k)).toBe(true);
    for (const ci of a.citations) for (const s of ci.sources) expect(s.url).toMatch(/^https:\/\//);
  });
});

describe("model output validation", () => {
  it("drops paragraphs that cite nothing valid and strips fabricated keys", async () => {
    llm.configured = true;
    llm.response = {
      insufficient_evidence: false,
      paragraphs: [
        { text: "A barani is a front somersault with a half twist. [C1]", citations: ["C1", "C99"] },
        { text: "It was invented in 1850 by a circus performer. [C42]", citations: ["C42"] },
      ],
    };
    const a = await answerQuestion(await makeUser(), "What is a barani?");
    expect(a.mode).toBe("llm");
    expect(a.blocks).toHaveLength(1);
    expect(a.blocks[0]!.citationKeys).toEqual(["C1"]);
    expect(a.blocks.map((b) => b.text).join(" ")).not.toMatch(/1850/);
    expect(a.caveats.join(" ")).toMatch(/removed/);
  });

  it("falls back to retrieval-only when the model fails", async () => {
    llm.configured = true;
    llm.response = new LlmUnavailableError("The daily language-model budget has been used up.", "budget_exceeded");
    const a = await answerQuestion(await makeUser(), "What is a kaboom?");
    expect(a.mode).toBe("retrieval_only");
    expect(a.degradedReason).toMatch(/budget/);
    expect(a.citations.length).toBeGreaterThan(0);
  });

  it("does not call the model when nothing relevant is retrieved", async () => {
    llm.configured = true;
    llm.response = { insufficient_evidence: false, paragraphs: [{ text: "Made up", citations: [] }] };
    const a = await answerQuestion(await makeUser(), "Who won the 1987 chess world championship?");
    expect(a.mode).toBe("no_match");
    expect(a.citations).toEqual([]);
  });

  it("requires sign-in and validates question length", async () => {
    await expect(answerQuestion(null, "What is a barani?")).rejects.toThrow(/sign in/i);
    await expect(answerQuestion(await makeUser(), "x".repeat(600))).rejects.toThrow(/500/);
  });
});
