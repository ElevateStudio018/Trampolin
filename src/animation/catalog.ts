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

const X = "Not a Trick Book entry yet: name and FIG notation (where there is one) as commonly used, not checked against cited sources.";
const E = (fig: string | undefined, s: Omit<SkillSpec, "kind" | "fig" | "note"> & { kind?: SkillSpec["kind"]; note?: string }): SkillSpec => ({ kind: "rotation", ...(fig ? { fig } : {}), ...s, note: s.note ? `${s.note} ${X}` : X });

/**
 * More skills for the animation studio. They are not Trick Book entries, so they carry no
 * citations; the rotation and twist data are what the FIG notation states.
 */
export const EXTRA_SPECS: Record<string, SkillSpec> = {
  "half-twist-jump": E(undefined, { id: "half-twist-jump", name: "Half twist jump", kind: "jump", start: "feet", end: "feet", direction: 1, quarters: 0, twists: [1], shape: "straight" }),
  "full-twist-jump": E(undefined, { id: "full-twist-jump", name: "Full twist jump", kind: "jump", start: "feet", end: "feet", direction: 1, quarters: 0, twists: [2], shape: "straight" }),
  "half-twist-to-seat": E(undefined, { id: "half-twist-to-seat", name: "Half twist to seat", start: "feet", end: "seat", direction: -1, quarters: 0, twists: [1], shape: "straight" }),
  "half-twist-to-feet": E(undefined, { id: "half-twist-to-feet", name: "Half twist to feet (from seat)", start: "seat", end: "feet", direction: 1, quarters: 0, twists: [1], shape: "straight" }),
  "back-pike": E("40<", { id: "back-pike", name: "Back somersault (piked)", start: "feet", end: "feet", direction: -1, quarters: 4, twists: [0], shape: "pike" }),
  "back-straight": E("40/", { id: "back-straight", name: "Back somersault (straight)", start: "feet", end: "feet", direction: -1, quarters: 4, twists: [0], shape: "straight" }),
  "front-pike": E("40<", { id: "front-pike", name: "Front somersault (piked)", start: "feet", end: "feet", direction: 1, quarters: 4, twists: [0], shape: "pike" }),
  "barani-tuck": E("41o", { id: "barani-tuck", name: "Barani (tucked)", start: "feet", end: "feet", direction: 1, quarters: 4, twists: [1], shape: "tuck" }),
  "barani-pike": E("41<", { id: "barani-pike", name: "Barani (piked)", start: "feet", end: "feet", direction: 1, quarters: 4, twists: [1], shape: "pike" }),
  "back-full": E("42/", { id: "back-full", name: "Full (back somersault with full twist)", start: "feet", end: "feet", direction: -1, quarters: 4, twists: [2], shape: "straight" }),
  "double-full": E("44/", { id: "double-full", name: "Double full", start: "feet", end: "feet", direction: -1, quarters: 4, twists: [4], shape: "straight" }),
  "triple-full": E("46/", { id: "triple-full", name: "Triple full", start: "feet", end: "feet", direction: -1, quarters: 4, twists: [6], shape: "straight" }),
  "double-back-tuck": E("800o", { id: "double-back-tuck", name: "Double back (tucked)", start: "feet", end: "feet", direction: -1, quarters: 8, twists: [0, 0], shape: "tuck" }),
  "double-back-pike": E("800<", { id: "double-back-pike", name: "Double back (piked)", start: "feet", end: "feet", direction: -1, quarters: 8, twists: [0, 0], shape: "pike" }),
  "double-back-straight": E("800/", { id: "double-back-straight", name: "Double back (straight)", start: "feet", end: "feet", direction: -1, quarters: 8, twists: [0, 0], shape: "straight" }),
  "double-front-tuck": E("800o", { id: "double-front-tuck", name: "Double front (tucked)", start: "feet", end: "feet", direction: 1, quarters: 8, twists: [0, 0], shape: "tuck" }),
  "half-out-pike": E("801<", { id: "half-out-pike", name: "Half out (piked)", start: "feet", end: "feet", direction: 1, quarters: 8, twists: [0, 1], shape: "pike" }),
  "rudy-out": E("803o", { id: "rudy-out", name: "Rudy out (tucked)", start: "feet", end: "feet", direction: 1, quarters: 8, twists: [0, 3], shape: "tuck" }),
  "rudy-out-pike": E("803<", { id: "rudy-out-pike", name: "Rudy out (piked)", start: "feet", end: "feet", direction: 1, quarters: 8, twists: [0, 3], shape: "pike" }),
  "randy-out": E("805o", { id: "randy-out", name: "Randy out", start: "feet", end: "feet", direction: 1, quarters: 8, twists: [0, 5], shape: "tuck" }),
  "half-in-half-out": E("811o", { id: "half-in-half-out", name: "Half in half out (tucked)", start: "feet", end: "feet", direction: 1, quarters: 8, twists: [1, 1], shape: "tuck" }),
  "half-in-half-out-pike": E("811<", { id: "half-in-half-out-pike", name: "Half in half out (piked)", start: "feet", end: "feet", direction: 1, quarters: 8, twists: [1, 1], shape: "pike" }),
  "half-in-rudy-out": E("813<", { id: "half-in-rudy-out", name: "Half in rudy out (piked)", start: "feet", end: "feet", direction: 1, quarters: 8, twists: [1, 3], shape: "pike" }),
  "full-in-back-out": E("820o", { id: "full-in-back-out", name: "Full in back out (tucked)", start: "feet", end: "feet", direction: -1, quarters: 8, twists: [2, 0], shape: "tuck" }),
  "full-in-back-out-pike": E("820<", { id: "full-in-back-out-pike", name: "Full in back out (piked)", start: "feet", end: "feet", direction: -1, quarters: 8, twists: [2, 0], shape: "pike" }),
  "back-in-full-out": E("802o", { id: "back-in-full-out", name: "Back in full out (tucked)", start: "feet", end: "feet", direction: -1, quarters: 8, twists: [0, 2], shape: "tuck" }),
  "full-in-full-out-pike": E("822<", { id: "full-in-full-out-pike", name: "Full in full out (piked)", start: "feet", end: "feet", direction: -1, quarters: 8, twists: [2, 2], shape: "pike" }),
  "full-full-straight": E("822/", { id: "full-full-straight", name: "Full in full out (straight)", start: "feet", end: "feet", direction: -1, quarters: 8, twists: [2, 2], shape: "straight" }),
  "triple-back": E("12000o", { id: "triple-back", name: "Triple back (tucked)", start: "feet", end: "feet", direction: -1, quarters: 12, twists: [0, 0, 0], shape: "tuck" }),
  "triffis-half-out": E("12001o", { id: "triffis-half-out", name: "Triffis half out (tucked)", start: "feet", end: "feet", direction: 1, quarters: 12, twists: [0, 0, 1], shape: "tuck" }),
  "triffis-half-out-pike": E("12001<", { id: "triffis-half-out-pike", name: "Triffis half out (piked)", start: "feet", end: "feet", direction: 1, quarters: 12, twists: [0, 0, 1], shape: "pike" }),
  "triffis-rudy-out": E("12003o", { id: "triffis-rudy-out", name: "Triffis rudy out", start: "feet", end: "feet", direction: 1, quarters: 12, twists: [0, 0, 3], shape: "tuck" }),
  "triffis-half-in-half-out": E("12101o", { id: "triffis-half-in-half-out", name: "Triffis half in half out", start: "feet", end: "feet", direction: 1, quarters: 12, twists: [1, 0, 1], shape: "tuck" }),
};

export const ALL_SPECS: Record<string, SkillSpec> = { ...SKILL_SPECS, ...EXTRA_SPECS, ...LINKS };

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
  { id: "doubles", name: "Double back · half in half out · full in back out", skills: ["double-back-tuck", "half-in-half-out", "full-in-back-out"] },
  { id: "twist-ladder", name: "Back full · double full · triple full", skills: ["back-full", "double-full", "triple-full"] },
  { id: "final-routine", name: "Rudy out · full in full out · triffis half out", skills: ["rudy-out", "full-in-full-out", "triffis-half-out"] },
];
