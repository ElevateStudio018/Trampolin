/**
 * Classifies questions that ask for performance instructions or personal readiness /
 * safety judgements. The assistant may define and compare skills, but must not coach
 * dangerous movements or tell someone they can safely attempt one.
 */
export type SafetyClass = "ok" | "instructions" | "readiness";

const READINESS = [
  /\b(am i|are we) (ready|able|good enough)\b/i,
  /\b(can|could|should|shall) (i|we|my (kid|son|daughter|child)) (safely |still )?(try|attempt|do|learn|throw|land|go for)\b/i,
  /\bis it (safe|dangerous|ok|okay)\b.*\b(for me|to (try|do|attempt|learn))\b/i,
  /\b(safe|safely) (to|for me to) (try|attempt|do|throw)\b/i,
  /\bwill i (get hurt|be ok|land it)\b/i,
  /\bwithout (a )?(coach|spotter|mat)\b/i,
];

const INSTRUCTIONS = [
  /\bhow (do|can|should|would) (i|you|we|one) (do|perform|learn|throw|land|execute|get|master|teach myself)\b/i,
  /\bhow to (do|perform|learn|throw|land|execute|master)\b/i,
  /\b(teach|show) me\b/i,
  /\bstep[- ]by[- ]step\b/i,
  /\b(tips|drills|technique|progressions?) (for|to)\b/i,
  /\bwalk me through\b/i,
];

export function classifyQuestion(question: string): SafetyClass {
  if (READINESS.some((r) => r.test(question))) return "readiness";
  if (INSTRUCTIONS.some((r) => r.test(question))) return "instructions";
  return "ok";
}

export const SAFETY_NOTICE: Record<Exclude<SafetyClass, "ok">, string> = {
  instructions:
    "I can explain what a skill is and how it relates to others, but I don't give step-by-step instructions for performing trampoline skills. Somersaulting and twisting skills carry a real risk of serious injury; learn them with a qualified coach, appropriate matting and spotting.",
  readiness:
    "I can't judge whether you can safely attempt a skill — that depends on your training, your equipment and supervision that I can't see. A qualified coach who has watched you jump is the right person to decide.",
};
