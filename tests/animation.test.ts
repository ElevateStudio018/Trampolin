import { describe, expect, it } from "vitest";
import { ALL_SPECS, COMBOS, EXTRA_SPECS, SKILL_SPECS } from "@/animation/catalog";
import { forwardKinematics, inertiaAbout, massProperties, orientPoint } from "@/animation/body";
import { buildSequence, buildTimeline, G, isConsistent, parseFig, POSE_ANGLE, type Frame, type SkillSpec } from "@/animation/motion";
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

  it("gives the extra studio skills FIG notation that matches their data", () => {
    for (const spec of Object.values(EXTRA_SPECS)) {
      expect(spec.note, spec.id).toMatch(/Not a Trick Book entry/);
      if (spec.kind !== "rotation" || spec.quarters < 4) continue;
      expect(spec.fig, spec.id).toBeTruthy();
      const parsed = parseFig(spec.fig!, spec.direction) as SkillSpec;
      expect(parsed, spec.id).toMatchObject({ quarters: spec.quarters, twists: spec.twists, shape: spec.shape, end: spec.end });
    }
  });

  it("holds the tuck through a double: the body stays compact between the somersaults", () => {
    for (const id of ["double-back-tuck", "triple-back", "full-in-full-out"]) {
      const tl = buildTimeline(ALL_SPECS[id]!);
      const somersaults = tl.phases.filter((p) => /somersault/.test(p.title) && !/Take-off|Landing/.test(p.title));
      for (let i = 1; i < somersaults.length; i++) {
        const t = somersaults[i]!.start;
        const f = tl.sample(t);
        expect(f.joints.knee, `${id} between somersaults ${i} and ${i + 1}`).toBeGreaterThan(1.6);
      }
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

  it("keeps the athlete on or above the (sunken) bed and peaks mid-flight", () => {
    for (const spec of Object.values(ALL_SPECS)) {
      const tl = buildTimeline(spec);
      let peak = 0;
      const takeoff = tl.phases.find((p) => p.title === "Take-off")!.end;
      for (let t = 0; t <= tl.duration; t += 0.01) {
        const f = tl.sample(t);
        const segs = forwardKinematics(f.joints);
        let low = Infinity;
        for (const s of segs) for (const p of [s.a, s.b]) low = Math.min(low, f.pelvis[1] + orientPoint(p, f.somersault, f.twist)[1] - s.r);
        expect(low, `${spec.id} at ${t.toFixed(2)} s`).toBeGreaterThan(-Math.max(0, f.bedDepth) - 0.05);
        if (t > takeoff) peak = Math.max(peak, f.com[1]);
      }
      expect(peak, spec.id).toBeCloseTo(tl.physics[0]!.apexHeight, 1);
    }
    expect(buildTimeline(SKILL_SPECS["full-in-full-out"]!).physics[0]!.apexHeight).toBeGreaterThan(4);
  });

  const flightSamples = (tl: ReturnType<typeof buildTimeline>, h: number) => {
    const out: { t: number; prev: Frame; f: Frame; next: Frame }[] = [];
    const takeoff = tl.phases.find((p) => p.title === "Take-off")!.end;
    for (let t = takeoff + h; t < tl.duration - h; t += 0.02) {
      const prev = tl.sample(t - h);
      const f = tl.sample(t);
      const next = tl.sample(t + h);
      if (!prev.inContact && !f.inContact && !next.inContact) out.push({ t, prev, f, next });
    }
    return out;
  };

  it("moves the centre of mass ballistically in the air (constant −g)", () => {
    for (const id of ["tuck-jump", "barani", "full-in-full-out", "ball-out", "crash-dive"]) {
      const tl = buildTimeline(ALL_SPECS[id]!);
      const h = 0.005;
      const s = flightSamples(tl, h);
      expect(s.length, id).toBeGreaterThan(20);
      for (const { prev, f, next } of s) expect((next.com[1] - 2 * f.com[1] + prev.com[1]) / (h * h), id).toBeCloseTo(-G, 1);
      // Take-off speed and rise belong together: v0² = 2·g·rise.
      const p = tl.physics[0]!;
      expect(p.takeoffSpeed ** 2).toBeCloseTo(2 * G * p.rise, 6);
    }
  });

  it("conserves angular momentum in the air: I·ω stays constant while the shape changes", () => {
    for (const id of ["full-in-full-out", "ball-out", "back-somersault", "miller"]) {
      const tl = buildTimeline(ALL_SPECS[id]!);
      const H = tl.physics[0]!.angularMomentum;
      const h = 0.002;
      let minI = Infinity;
      let maxI = 0;
      for (const { prev, f, next } of flightSamples(tl, h)) {
        const omega = (next.somersault - prev.somersault) / (2 * h);
        const I = inertiaAbout(massProperties(forwardKinematics(f.joints)).I, [Math.cos(f.twist), 0, Math.sin(f.twist)]);
        minI = Math.min(minI, I);
        maxI = Math.max(maxI, I);
        expect(Math.abs(I * omega) / H, id).toBeCloseTo(1, 1);
      }
      if (ALL_SPECS[id]!.shape === "tuck") expect(maxI / minI, id).toBeGreaterThan(2.5);
    }
  });

  it("chains combinations continuously, with the bed and body above ground", () => {
    for (const c of COMBOS) {
      const tl = buildSequence(c.skills.map((id) => ALL_SPECS[id]!));
      if ("error" in tl) throw new Error(tl.error);
      let prev = tl.sample(0);
      for (let t = 0.004; t <= tl.duration; t += 0.004) {
        const f = tl.sample(t);
        // No teleporting between skills: 4 ms can't move the pelvis more than ~6 cm at these speeds.
        expect(Math.hypot(f.pelvis[0] - prev.pelvis[0], f.pelvis[1] - prev.pelvis[1], f.pelvis[2] - prev.pelvis[2]), `${c.id} at ${t.toFixed(3)} s`).toBeLessThan(0.06);
        expect(Math.abs(norm(f.somersault - prev.somersault)), `${c.id} at ${t.toFixed(3)} s`).toBeLessThan(0.15);
        let low = Infinity;
        for (const s of forwardKinematics(f.joints)) for (const p of [s.a, s.b]) low = Math.min(low, f.pelvis[1] + orientPoint(p, f.somersault, f.twist)[1] - s.r);
        expect(low, `${c.id} at ${t.toFixed(3)} s`).toBeGreaterThan(-Math.max(0, f.bedDepth) - 0.05);
        prev = f;
      }
    }
  });

  it("gives plausible bed depressions and flight times", () => {
    for (const spec of Object.values(ALL_SPECS)) {
      for (const p of buildTimeline(spec).physics) {
        expect(p.bedDepth, spec.id).toBeGreaterThan(0.25);
        expect(p.bedDepth, spec.id).toBeLessThan(1.0);
        expect(p.flightTime, spec.id).toBeGreaterThan(0.7);
        expect(p.flightTime, spec.id).toBeLessThan(2.1);
        expect(p.contactTime, spec.id).toBeLessThan(0.6);
      }
    }
    // A bigger skill needs more flight time, so a harder push from a deeper bed.
    const single = buildTimeline(SKILL_SPECS["barani"]!).physics[0]!;
    const double = buildTimeline(SKILL_SPECS["full-in-full-out"]!).physics[0]!;
    expect(double.flightTime).toBeGreaterThan(single.flightTime);
    expect(double.bedDepth).toBeGreaterThan(single.bedDepth);
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
    expect(parseFig("12001o", 1)).toMatchObject({ quarters: 12, twists: [0, 0, 1], shape: "tuck", end: "feet" });
    expect(parseFig("12000<", -1)).toMatchObject({ quarters: 12, twists: [0, 0, 0], shape: "pike" });
    expect(parseFig("46/", -1)).toMatchObject({ quarters: 4, twists: [6] });
    expect(parseFig("8000", -1)).toMatchObject({ quarters: 8, twists: [0, 0], shape: "tuck" });
    expect(parseFig("abc", 1)).toHaveProperty("error");
  });

  it("refuses combinations whose landings and take-offs don't connect", () => {
    const bad = buildSequence([SKILL_SPECS["back-landing"]!, SKILL_SPECS.cody!]);
    expect("error" in bad && bad.error).toMatch(/starts from the front/);
    const good = buildSequence([SKILL_SPECS["back-landing"]!, SKILL_SPECS["ball-out"]!]);
    expect("error" in good).toBe(false);
  });
});
