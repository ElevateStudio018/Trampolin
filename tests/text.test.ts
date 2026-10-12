import { describe, expect, it } from "vitest";
import { normalizeName, normalizeUrl, slugify, trigramSimilarity } from "@/lib/text";

describe("text normalisation", () => {
  it("normalises case, accents, hyphens and fractions", () => {
    expect(normalizeName("Full-in ½-out")).toBe("full in 1/2 out");
    expect(normalizeName("  Rudolph  ")).toBe("rudolph");
    expect(normalizeName("Barani—ball out")).toBe("barani ball out");
    expect(normalizeName("Saltó")).toBe("salto");
    expect(normalizeName("Landing (formerly “drop”)")).toBe("landing formerly drop");
  });
  it("makes URL-safe slugs", () => {
    expect(slugify("Full in full out")).toBe("full-in-full-out");
    expect(slugify("¾ back")).toBe("3-4-back");
  });
  it("normalises URLs for de-duplication", () => {
    expect(normalizeUrl("http://www.Example.com/a/?utm_source=x&b=2#frag")).toBe("https://example.com/a?b=2");
    expect(normalizeUrl("https://example.com/a/")).toBe(normalizeUrl("https://EXAMPLE.com/a"));
  });
  it("scores similar names higher than unrelated ones", () => {
    expect(trigramSimilarity("Rudolph", "Rudolf")).toBeGreaterThanOrEqual(0.4);
    expect(trigramSimilarity("Rudolph", "Kaboom")).toBeLessThan(0.1);
  });
});
