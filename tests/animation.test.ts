import { describe, expect, it } from "vitest";
import { ALL_SPECS, COMBOS, SKILL_SPECS } from "@/animation/catalog";
import { buildSequence, buildTimeline, isConsistent, parseFig, POSE_ANGLE, type SkillSpec } from "@/animation/motion";
import { seedEntries } from "@/db/seed-data";
import { slugify } from "@/lib/text";

const norm = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

describe("skill catalog", () => {
  it.each(Object.values(ALL_SPECS).map((s) => [s.id, s] as const))("%s lands where it should", (_id, spec) => {
    expect(isConsistent(spec)).toBe(true);
    const tl = buildTimeline(spec);
    const end = tl.sample(tl.duration);
    expect(norm(end.somersault - POSE_ANGLE[spec.end])).toBeCloseTo(0, 6);
    expect(end.twist).toBeCloseTo(spec.twists.reduce((a, b) => a + b, 0) * Math.PI, 6);
    const start = tl.sample(0);
    expect(norm(start.somersault - POSE_ANGLE[spec.start])).toBeCloseTo(0, 6);
  });

  it("matches the rotation and twist counts stored on the Trick Book entries", () => {
    for (const e of seedEntries) {
      const spec = SKILL_SPECS[slugify(e.name)];
      if (!spec) continue;
      if (e.quarterRotations !== undefined && spec.kind !== "jump") expect(spec.quarters, e.name).toBe(e.quarterRotations);
      if (e.halfTwists !== undefined) expect(spec.twists.reduce((a, b) => a + b, 0), e.name).toBe(e.halfTwists);
    }
  });

  it("keys every spec by an existing entry slug", () => {
    const slugs = new Set(seedEntries.map((e) => slugify(e.name)));
    for (const key of Object.keys(SKILL_SPECS)) expect(slugs.has(key), key).toBe(true);
  });

  it("has only valid combinations", () => {
    for (const c of COMBOS) {
      const tl = buildSequence(c.skills.map((s) => ALL_SPECS[s]!));
      expect("error" in tl ? tl.error : "ok", c.name).toBe("ok");
    }
  });
});

describe("timeline physics", () => {
  it("rotates faster in the tucked part than in the open take-off", () => {
    const tl = buildTimeline(ALL_SPECS["back-somersault"]!);
    const p = tl.phases.find((ph) => ph.title.includes("somersault"))!;
    const rate = (t: number) => Math.abs(tl.sample(t + 0.01).somersault - tl.sample(t).somersault) / 0.01;
    const mid = (p.start + p.end) / 2;
    expect(rate(mid)).toBeGreaterThan(1.5 * rate(tl.phases[0]!.end + 0.01));
  });

  it("puts twists in the right somersault (full in, double full out)", () => {
    const tl = buildTimeline(SKILL_SPECS.miller!);
    const first = tl.phases.find((p) => p.title.startsWith("First"))!;
    const atEndOfFirst = tl.sample(first.end).twist;
    expect(atEndOfFirst / Math.PI).toBeCloseTo(2, 1);
    expect(tl.phases.some((p) => p.title.includes("Second somersault · 2 full twists"))).toBe(true);
  });

  it("keeps the athlete above the bed and peaks mid-flight", () => {
    const tl = buildTimeline(SKILL_SPECS["full-in-full-out"]!);
    let peak = 0;
    for (let t = 0; t <= tl.duration; t += 0.01) {
      const f = tl.sample(t);
      expect(f.height).toBeGreaterThan(-0.6);
      peak = Math.max(peak, f.height);
    }
    expect(peak).toBeGreaterThan(2.5);
  });

  it("describes phases without performance instructions", () => {
    for (const spec of Object.values(ALL_SPECS)) {
      for (const p of buildTimeline(spec).phases) expect(`${p.title} ${p.detail}`).not.toMatch(/\b(should|must|try to|make sure|you)\b/i);
    }
  });
});

describe("FIG notation and sequences", () => {
  it("parses notation", () => {
    const fifo = parseFig("822<", -1) as SkillSpec;
    expect(fifo).toMatchObject({ quarters: 8, twists: [2, 2], shape: "pike", end: "feet" });
    expect(parseFig("41/", 1)).toMatchObject({ quarters: 4, twists: [1], shape: "straight" });
    expect(parseFig("800ο", -1)).toMatchObject({ twists: [0, 0], shape: "tuck" });
    expect(parseFig("3", -1)).toMatchObject({ end: "front" });
    expect(parseFig("82/", 1)).toHaveProperty("error");
    expect(parseFig("abc", 1)).toHaveProperty("error");
  });

  it("refuses combinations whose landings and take-offs don't connect", () => {
    const bad = buildSequence([SKILL_SPECS["back-landing"]!, SKILL_SPECS.cody!]);
    expect("error" in bad && bad.error).toMatch(/starts from the front/);
    const good = buildSequence([SKILL_SPECS["back-landing"]!, SKILL_SPECS["ball-out"]!]);
    expect("error" in good).toBe(false);
  });
});
