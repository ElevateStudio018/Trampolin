import type { SkillSpec } from "./motion";

/**
 * Motion specs for Trick Book entries, keyed by entry slug. Rotation, twist, start and
 * landing come from the entries' cited claims; where the sources don't give a body
 * shape, the spec says which shape is shown so the animation doesn't imply more.
 */
const S = (s: Omit<SkillSpec, "id" | "kind"> & { id: string; kind?: SkillSpec["kind"] }): SkillSpec => ({ kind: "rotation", ...s });

export const SKILL_SPECS: Record<string, SkillSpec> = {
  "tuck-jump": S({ id: "tuck-jump", name: "Tuck jump", kind: "jump", start: "feet", end: "feet", direction: 1, quarters: 0, twists: [0], shape: "tuck" }),
  "pike-jump": S({ id: "pike-jump", name: "Pike jump", kind: "jump", start: "feet", end: "feet", direction: 1, quarters: 0, twists: [0], shape: "pike" }),
  "straddle-jump": S({ id: "straddle-jump", name: "Straddle jump", kind: "jump", start: "feet", end: "feet", direction: 1, quarters: 0, twists: [0], shape: "straddle" }),
  "seat-landing": S({ id: "seat-landing", name: "Seat landing", start: "feet", end: "seat", direction: -1, quarters: 0, twists: [0], shape: "straight" }),
  "front-landing": S({ id: "front-landing", name: "Front landing", start: "feet", end: "front", direction: 1, quarters: 1, twists: [0], shape: "straight" }),
  "back-landing": S({ id: "back-landing", name: "Back landing", start: "feet", end: "back", direction: -1, quarters: 1, twists: [0], shape: "straight" }),
  "swivel-hips": S({ id: "swivel-hips", name: "Swivel hips", kind: "seat-twist", start: "seat", end: "seat", direction: 1, quarters: 0, twists: [1], shape: "straight" }),
  barani: S({ id: "barani", name: "Barani", start: "feet", end: "feet", direction: 1, quarters: 4, twists: [1], shape: "straight", note: "Shown straight (41/). The sources allow the barani in any position." }),
  rudolph: S({ id: "rudolph", name: "Rudolph", start: "feet", end: "feet", direction: 1, quarters: 4, twists: [3], shape: "straight" }),
  randolph: S({ id: "randolph", name: "Randolph", start: "feet", end: "feet", direction: 1, quarters: 4, twists: [5], shape: "straight", note: "Body shape is not specified by the cited sources; shown straight." }),
  adolph: S({ id: "adolph", name: "Adolph", start: "feet", end: "feet", direction: 1, quarters: 4, twists: [7], shape: "straight", note: "Shows the common definition (3½ twists). One cited glossary uses the name differently." }),
  "ball-out": S({ id: "ball-out", name: "Ball out", start: "back", end: "feet", direction: 1, quarters: 5, twists: [0, 0], shape: "tuck", note: "Body shape is not specified by the cited sources; shown tucked." }),
  "barani-ball-out": S({ id: "barani-ball-out", name: "Barani ball out", start: "back", end: "feet", direction: 1, quarters: 5, twists: [0, 1], shape: "tuck", twistTiming: "late", note: "Late half twist, as in the cited glossary. Shape shown tucked." }),
  cody: S({ id: "cody", name: "Cody", start: "front", end: "feet", direction: -1, quarters: 5, twists: [0, 0], shape: "tuck", note: "Body shape is not specified by the cited sources; shown tucked." }),
  "lazy-back": S({ id: "lazy-back", name: "Lazy back", start: "feet", end: "front", direction: -1, quarters: 3, twists: [0], shape: "straight" }),
  "crash-dive": S({ id: "crash-dive", name: "Crash dive", start: "feet", end: "back", direction: 1, quarters: 3, twists: [0], shape: "pike", note: "Body shape is not specified by the cited sources; shown piked." }),
  kaboom: S({ id: "kaboom", name: "Kaboom", start: "back", end: "feet", direction: -1, quarters: 3, twists: [0], shape: "straight", note: "The heel rebound that drives the rotation is not modelled." }),
  porpoise: S({ id: "porpoise", name: "Porpoise", start: "back", end: "back", direction: 1, quarters: 4, twists: [0], shape: "tuck", note: "Body shape is not specified by the cited sources; shown tucked." }),
  "half-out": S({ id: "half-out", name: "Half out", start: "feet", end: "feet", direction: 1, quarters: 8, twists: [0, 1], shape: "tuck", note: "Half twist in the second somersault (barani out). Shape shown tucked." }),
  "full-in-full-out": S({ id: "full-in-full-out", name: "Full in full out", start: "feet", end: "feet", direction: -1, quarters: 8, twists: [2, 2], shape: "tuck", note: "A full twist in each somersault. Shape shown tucked; the cited source doesn't fix it." }),
  miller: S({ id: "miller", name: "Miller", start: "feet", end: "feet", direction: -1, quarters: 8, twists: [2, 4], shape: "straight", note: "Shown as full in – double full out, the usual modern form per the cited glossary. Shape shown straight." }),
};

/** Linking moves used only in combinations (not Trick Book entries). */
export const LINKS: Record<string, SkillSpec> = {
  "to-feet-from-back": S({ id: "to-feet-from-back", name: "To feet (from back)", start: "back", end: "feet", direction: 1, quarters: 1, twists: [0], shape: "straight" }),
  "to-feet-from-front": S({ id: "to-feet-from-front", name: "To feet (from front)", start: "front", end: "feet", direction: -1, quarters: 1, twists: [0], shape: "straight" }),
  "to-feet-from-seat": S({ id: "to-feet-from-seat", name: "To feet (from seat)", start: "seat", end: "feet", direction: 1, quarters: 0, twists: [0], shape: "straight" }),
  "back-somersault": S({ id: "back-somersault", name: "Back somersault (tucked)", start: "feet", end: "feet", direction: -1, quarters: 4, twists: [0], shape: "tuck" }),
  "front-somersault": S({ id: "front-somersault", name: "Front somersault (tucked)", start: "feet", end: "feet", direction: 1, quarters: 4, twists: [0], shape: "tuck" }),
};

export const ALL_SPECS: Record<string, SkillSpec> = { ...SKILL_SPECS, ...LINKS };

export function specForSlug(slug: string): SkillSpec | null {
  return SKILL_SPECS[slug] ?? null;
}

/** Ready-made combinations; each skill starts where the previous one landed. */
export const COMBOS: { id: string; name: string; skills: string[] }[] = [
  { id: "seat-swivel", name: "Seat landing · swivel hips · to feet", skills: ["seat-landing", "swivel-hips", "to-feet-from-seat"] },
  { id: "back-ballout", name: "Back landing · ball out", skills: ["back-landing", "ball-out"] },
  { id: "crash-bbo", name: "Crash dive · barani ball out", skills: ["crash-dive", "barani-ball-out"] },
  { id: "lazy-cody", name: "Lazy back · cody", skills: ["lazy-back", "cody"] },
  { id: "twisters", name: "Barani · rudolph · full in full out", skills: ["barani", "rudolph", "full-in-full-out"] },
  { id: "jumps", name: "Tuck · pike · straddle jump", skills: ["tuck-jump", "pike-jump", "straddle-jump"] },
];
