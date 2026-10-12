/**
 * Kinematic model for schematic skill animations.
 *
 * A skill is described by where it starts and lands, the direction and amount of
 * somersault rotation, the half twists in each somersault and the body shape. From that
 * the timeline computes, for any instant, the somersault angle, twist angle, height,
 * bed depression and joint angles. Rotation speed is tied to the body shape (a tucked
 * body rotates faster than an open one), which is what makes the motion read correctly.
 *
 * This is a description of what a skill is, not motion capture and not technique
 * instruction. It has no three.js dependency so it can be unit-tested.
 */

export type Pose = "feet" | "back" | "front" | "seat";
export type Shape = "tuck" | "pike" | "straight" | "straddle";

export type SkillSpec = {
  id: string;
  name: string;
  start: Pose;
  end: Pose;
  /** +1 forward (front) rotation, -1 backward. */
  direction: 1 | -1;
  /** Quarter somersault rotations (4 = one somersault). */
  quarters: number;
  /** Half twists in each somersault, first to last (e.g. full in full out = [2, 2]). */
  twists: number[];
  shape: Shape;
  kind: "jump" | "rotation" | "seat-twist";
  /** Twist timing inside its somersault: "late" puts it at the end (e.g. barani ball out). */
  twistTiming?: "middle" | "late";
  /** Shown under the animation, e.g. when the sources don't specify the body shape. */
  note?: string;
};

export type Joints = {
  spine: number; // trunk flexion (forward bend), radians
  hipFlex: number;
  hipAbd: number;
  knee: number;
  shoulderFlex: number;
  shoulderAbd: number;
  elbow: number;
  neck: number;
};

export type Frame = {
  /** Somersault angle about the lateral axis; 0 = upright, +π/2 = face down, -π/2 = face up. */
  somersault: number;
  /** Twist angle about the body's long axis. */
  twist: number;
  /** Height of the pelvis above the resting bed surface, metres. */
  height: number;
  /** Bed depression at the centre, metres (≥ 0). */
  bedDepth: number;
  joints: Joints;
  phase: number;
};

export type Phase = { start: number; end: number; title: string; detail: string };

export type Timeline = {
  spec: SkillSpec;
  duration: number;
  phases: Phase[];
  sample(t: number): Frame;
};

const D = Math.PI / 180;
const HALF_PI = Math.PI / 2;

export const POSE_ANGLE: Record<Pose, number> = { feet: 0, seat: 0, front: HALF_PI, back: -HALF_PI };
const POSE_HEIGHT: Record<Pose, number> = { feet: 0.95, seat: 0.13, front: 0.13, back: 0.13 };
const G = 9.81;

// ---------------------------------------------------------------------------
// Postures
// ---------------------------------------------------------------------------

const P = {
  stand: { spine: 0, hipFlex: 0, hipAbd: 0, knee: 0, shoulderFlex: 5 * D, shoulderAbd: 8 * D, elbow: 10 * D, neck: 0 },
  crouch: { spine: 10 * D, hipFlex: 35 * D, hipAbd: 0, knee: 55 * D, shoulderFlex: -20 * D, shoulderAbd: 5 * D, elbow: 15 * D, neck: 0 },
  reach: { spine: 0, hipFlex: 0, hipAbd: 0, knee: 0, shoulderFlex: 170 * D, shoulderAbd: 5 * D, elbow: 5 * D, neck: 0 },
  straight: { spine: 0, hipFlex: 0, hipAbd: 0, knee: 0, shoulderFlex: 150 * D, shoulderAbd: 10 * D, elbow: 10 * D, neck: 0 },
  twist: { spine: 0, hipFlex: 0, hipAbd: 0, knee: 0, shoulderFlex: 25 * D, shoulderAbd: 5 * D, elbow: 130 * D, neck: 0 },
  tuck: { spine: 35 * D, hipFlex: 125 * D, hipAbd: 8 * D, knee: 135 * D, shoulderFlex: 55 * D, shoulderAbd: 10 * D, elbow: 75 * D, neck: 15 * D },
  pike: { spine: 30 * D, hipFlex: 115 * D, hipAbd: 0, knee: 0, shoulderFlex: 95 * D, shoulderAbd: 5 * D, elbow: 5 * D, neck: 15 * D },
  straddle: { spine: 25 * D, hipFlex: 100 * D, hipAbd: 45 * D, knee: 0, shoulderFlex: 95 * D, shoulderAbd: 35 * D, elbow: 5 * D, neck: 10 * D },
  land: { spine: 5 * D, hipFlex: 25 * D, hipAbd: 0, knee: 35 * D, shoulderFlex: 90 * D, shoulderAbd: 15 * D, elbow: 10 * D, neck: 0 },
  seat: { spine: -5 * D, hipFlex: 90 * D, hipAbd: 0, knee: 0, shoulderFlex: -25 * D, shoulderAbd: 15 * D, elbow: 5 * D, neck: 0 },
  back: { spine: 0, hipFlex: 45 * D, hipAbd: 0, knee: 70 * D, shoulderFlex: 60 * D, shoulderAbd: 20 * D, elbow: 20 * D, neck: 15 * D },
  front: { spine: 0, hipFlex: 0, hipAbd: 0, knee: 20 * D, shoulderFlex: 120 * D, shoulderAbd: 40 * D, elbow: 110 * D, neck: -15 * D },
} satisfies Record<string, Joints>;

const SHAPE_POSTURE: Record<Shape, Joints> = { tuck: P.tuck, pike: P.pike, straight: P.straight, straddle: P.straddle };
const REST_POSTURE: Record<Pose, Joints> = { feet: P.stand, seat: P.seat, back: P.back, front: P.front };

function mix(a: Joints, b: Joints, w: number): Joints {
  const k = Math.max(0, Math.min(1, w));
  const out = {} as Joints;
  for (const key of Object.keys(a) as (keyof Joints)[]) out[key] = a[key] + (b[key] - a[key]) * k;
  return out;
}

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const smooth = (x: number) => {
  const t = clamp01(x);
  return t * t * (3 - 2 * t);
};
/** 0→1 ramp between a and b, smoothed. */
const ramp = (x: number, a: number, b: number) => smooth((x - a) / (b - a));

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

const mod2pi = (a: number) => ((a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);

/** The pose a skill lands in, given where it starts and how it rotates (seat/feet are both "upright"). */
export function landingAngle(spec: Pick<SkillSpec, "start" | "direction" | "quarters">) {
  return POSE_ANGLE[spec.start] + spec.direction * spec.quarters * HALF_PI;
}

export function isConsistent(spec: SkillSpec): boolean {
  const diff = mod2pi(landingAngle(spec) - POSE_ANGLE[spec.end]);
  const ok = diff < 1e-6 || Math.abs(diff - 2 * Math.PI) < 1e-6;
  return ok && spec.twists.length === somersaultCount(spec.quarters) && spec.twists.every((t) => Number.isInteger(t) && t >= 0);
}

export function somersaultCount(quarters: number) {
  return Math.max(1, Math.ceil(quarters / 4));
}

// ---------------------------------------------------------------------------
// FIG notation
// ---------------------------------------------------------------------------

/**
 * Parses FIG numeric notation: one digit for quarter rotations, one digit per somersault
 * for half twists, then an optional position symbol (/ straight, < pike, o tuck).
 * Examples: "41/" barani straight, "800o" tucked double, "822<" piked full in full out.
 */
export function parseFig(raw: string, direction: 1 | -1): SkillSpec | { error: string } {
  const s = raw.trim().replace(/ο/g, "o").replace(/\s+/g, "");
  const m = /^([1-9])(\d*)([o0<\/]?)$/i.exec(s);
  if (!m) return { error: "Use FIG notation such as 41/, 800o or 822<: quarter rotations, then half twists per somersault, then / < or o." };
  const quarters = Number(m[1]);
  const n = somersaultCount(quarters);
  const digits = m[2]!.split("").map(Number);
  const twists = digits.length === 0 ? Array(n).fill(0) : digits;
  if (twists.length !== n) return { error: `${quarters} quarter rotations make ${n} somersault${n > 1 ? "s" : ""}, so give ${n} twist digit${n > 1 ? "s" : ""}.` };
  const sym = m[3]!.toLowerCase();
  const shape: Shape = sym === "/" ? "straight" : sym === "<" ? "pike" : sym === "o" || sym === "0" ? "tuck" : twists.some((t) => t > 0) ? "straight" : "tuck";
  const endAngle = mod2pi(direction * quarters * HALF_PI);
  const end: Pose = endAngle < 0.01 ? "feet" : Math.abs(endAngle - HALF_PI) < 0.01 ? "front" : "back";
  return {
    id: `fig-${s}-${direction > 0 ? "f" : "b"}`,
    name: `${s} ${direction > 0 ? "forward" : "backward"}`,
    start: "feet",
    end,
    direction,
    quarters,
    twists,
    shape,
    kind: "rotation",
  };
}

// ---------------------------------------------------------------------------
// Timeline
// ---------------------------------------------------------------------------

const POSE_WORD: Record<Pose, string> = { feet: "feet", seat: "seat", back: "back", front: "front" };

function fraction(quarters: number) {
  const whole = Math.floor(quarters / 4);
  const rem = ["", "¼", "½", "¾"][quarters % 4]!;
  return `${whole || (rem ? "" : "0")}${rem}`;
}

function twistWords(halfTwists: number) {
  if (halfTwists === 0) return "no twist";
  if (halfTwists === 1) return "half twist";
  if (halfTwists === 2) return "full twist";
  if (halfTwists % 2 === 0) return `${halfTwists / 2} full twists`;
  return `${(halfTwists - 1) / 2}½ twists`;
}

/** Builds the timeline for one skill. Times are in seconds at 1× speed. */
export function buildTimeline(spec: SkillSpec): Timeline {
  const lying = spec.start !== "feet";
  const n = somersaultCount(spec.quarters);
  const contact = lying ? 0.38 : 0.42;
  const flight =
    spec.kind === "jump" ? 1.2 : spec.kind === "seat-twist" ? 0.9 : spec.quarters <= 1 ? 0.85 : lying ? 0.95 + 0.12 * spec.quarters : 1.15 + 0.22 * n + 0.04 * spec.twists.reduce((a, b) => a + b, 0);
  const landing = 0.4;
  const hold = 0.45;
  const t0 = contact;
  const t1 = t0 + flight;
  const t2 = t1 + landing;
  const duration = t2 + hold;
  const apex = (G * flight * flight) / 8;
  const startH = POSE_HEIGHT[spec.start];
  const endH = POSE_HEIGHT[spec.end];
  const startAngle = POSE_ANGLE[spec.start];
  const totalRot = spec.direction * spec.quarters * HALF_PI;
  const totalTwist = spec.twists.reduce((a, b) => a + b, 0) * Math.PI;
  const shapePosture = SHAPE_POSTURE[spec.shape];

  // Flight-time windows (u ∈ [0,1] across flight) for each somersault segment.
  const segA = 0.1;
  const segB = 0.88;
  const seg = (k: number) => [segA + ((segB - segA) * k) / n, segA + ((segB - segA) * (k + 1)) / n] as const;
  const twistWindow = (k: number) => {
    const [a, b] = seg(k);
    const len = b - a;
    return spec.twistTiming === "late" ? ([a + 0.55 * len, b + 0.06] as const) : ([a + 0.15 * len, a + 0.85 * len] as const);
  };

  /** How "closed" the shape is at flight progress u (0 = open, 1 = full shape). */
  function shapeWeight(u: number) {
    if (spec.kind === "jump") return ramp(u, 0.25, 0.42) * (1 - ramp(u, 0.58, 0.75));
    if (spec.kind === "seat-twist" || spec.quarters <= 1) return 0;
    if (spec.shape === "straight") return 0;
    let w = ramp(u, 0.04, 0.16) * (1 - ramp(u, 0.8, 0.9));
    for (let k = 0; k < n; k++) {
      if (!spec.twists[k]) continue;
      const [a, b] = twistWindow(k);
      // Open (at least partly) to twist, then close again.
      const open = ramp(u, a - 0.06, a) * (1 - ramp(u, b, b + 0.06));
      w *= 1 - 0.75 * open;
    }
    return w;
  }

  // Rotation profile: angular velocity ∝ 1 + 1.8·shape (a closed body spins faster).
  const N = 600;
  const cum = new Float64Array(N + 1);
  for (let i = 1; i <= N; i++) {
    const u = (i - 0.5) / N;
    const openSlow = 0.35 + 0.65 * ramp(u, 0.0, 0.12) * (1 - ramp(u, 0.9, 1.0) * 0.6);
    cum[i] = cum[i - 1]! + openSlow * (1 + 1.8 * shapeWeight(u));
  }
  const rotProgress = (u: number) => {
    const x = clamp01(u) * N;
    const i = Math.floor(x);
    const f = x - i;
    const a = cum[Math.min(i, N)]!;
    const b = cum[Math.min(i + 1, N)]!;
    return (a + (b - a) * f) / cum[N]!;
  };

  function twistAt(u: number) {
    if (spec.kind === "seat-twist") return totalTwist * smooth((u - 0.2) / 0.6);
    let half = 0;
    for (let k = 0; k < n; k++) {
      const h = spec.twists[k] ?? 0;
      if (!h) continue;
      const [a, b] = twistWindow(k);
      half += h * smooth((u - a) / (b - a));
    }
    return half * Math.PI;
  }

  function flightPosture(u: number): Joints {
    if (spec.kind === "seat-twist") {
      const up = ramp(u, 0, 0.3) * (1 - ramp(u, 0.7, 1));
      return mix(mix(P.seat, P.twist, up), P.seat, ramp(u, 0.85, 1));
    }
    const leave = lying ? REST_POSTURE[spec.start] : P.reach;
    const open = spec.kind === "jump" ? P.straight : spec.twists.some((t) => t > 0) ? P.twist : P.straight;
    let j = mix(leave, open, ramp(u, 0.0, 0.12));
    if (spec.kind === "jump") j = mix(P.reach, shapePosture, shapeWeight(u));
    else j = mix(j, shapePosture, shapeWeight(u));
    // Arms in while twisting (straight shapes).
    let tw = 0;
    for (let k = 0; k < n; k++) {
      if (!spec.twists[k]) continue;
      const [a, b] = twistWindow(k);
      tw = Math.max(tw, ramp(u, a - 0.05, a) * (1 - ramp(u, b, b + 0.05)));
    }
    if (spec.shape === "straight" || spec.kind === "jump") j = mix(j, P.twist, tw);
    // Prepare the landing shape.
    const target = spec.end === "feet" ? P.land : REST_POSTURE[spec.end];
    return mix(j, target, ramp(u, 0.86, 1));
  }

  // Phases for the UI (seconds).
  const phases: Phase[] = [];
  phases.push({
    start: 0,
    end: t0,
    title: "Take-off",
    detail: `Leaves the bed from ${POSE_WORD[spec.start]}${spec.start === "feet" ? ", arms rising" : ""}.`,
  });
  const ft = (u: number) => t0 + u * flight;
  if (spec.kind === "jump") {
    phases.push({ start: t0, end: ft(0.3), title: "Rise", detail: "Straight body on the way up; no rotation." });
    phases.push({ start: ft(0.3), end: ft(0.72), title: `${spec.shape[0]!.toUpperCase()}${spec.shape.slice(1)} shape`, detail: `Shows the ${spec.shape} shape at the top of the jump.` });
    phases.push({ start: ft(0.72), end: t1, title: "Descent", detail: "Opens to a straight body before landing." });
  } else if (spec.kind === "seat-twist") {
    phases.push({ start: t0, end: t1, title: "Half twist", detail: "Rises from the seat and turns half a twist about the body's long axis." });
  } else if (spec.quarters <= 1) {
    phases.push({
      start: t0,
      end: t1,
      title: spec.quarters === 0 ? "Drop" : `¼ ${spec.direction > 0 ? "forward" : "backward"} rotation`,
      detail: spec.quarters === 0 ? `Moves from ${POSE_WORD[spec.start]} towards a ${POSE_WORD[spec.end]} landing.` : `Turns a quarter somersault to land on the ${POSE_WORD[spec.end]}.`,
    });
  } else if (spec.quarters % 4 !== 0 || n === 1) {
    const h = spec.twists.reduce((a, b) => a + b, 0);
    phases.push({
      start: ft(seg(0)[0]),
      end: ft(seg(n - 1)[1]),
      title: `${fraction(spec.quarters)} ${spec.direction > 0 ? "forward" : "backward"} somersault`,
      detail: `${spec.shape === "straight" ? "Straight body" : `${spec.shape[0]!.toUpperCase()}${spec.shape.slice(1)} shape`}${h ? `, with a ${twistWords(h)}${spec.twistTiming === "late" ? " late in the rotation" : ""}` : ", no twist"}.`,
    });
  } else {
    for (let k = 0; k < n; k++) {
      const [a, b] = seg(k);
      const h = spec.twists[k] ?? 0;
      const ord = ["First", "Second", "Third"][k] ?? `#${k + 1}`;
      phases.push({
        start: ft(a),
        end: ft(b),
        title: `${ord} somersault${h ? ` · ${twistWords(h)}` : ""}`,
        detail: h
          ? `Twists ${twistWords(h)} about the long axis while ${spec.direction > 0 ? "rotating forward" : "rotating backward"}${n > 1 ? (k === 0 ? ` (the twist "in")` : k === n - 1 ? ` (the twist "out")` : "") : ""}.`
          : `${spec.shape === "straight" ? "Straight" : `${spec.shape[0]!.toUpperCase()}${spec.shape.slice(1)}`} rotation without twist${spec.shape !== "straight" ? "; the closed shape makes it spin faster" : ""}.`,
      });
    }
  }
  if (spec.kind === "rotation" && spec.quarters > 1) phases.push({ start: ft(segB), end: t1, title: "Opening", detail: "Opens the body, which slows the rotation before landing." });
  phases.push({ start: t1, end: t2, title: "Landing", detail: `Lands on the ${POSE_WORD[spec.end]}.` });

  function phaseAt(t: number) {
    let idx = 0;
    phases.forEach((p, i) => {
      if (t >= p.start - 1e-9) idx = i;
    });
    return idx;
  }

  function sample(tRaw: number): Frame {
    const t = Math.max(0, Math.min(duration, tRaw));
    const phase = phaseAt(t);
    if (t < t0) {
      // Take-off contact: sink into the bed, then drive up.
      const x = t / t0;
      const sink = Math.sin(Math.PI * x);
      const depth = (lying ? 0.32 : 0.55) * sink;
      const rest = REST_POSTURE[spec.start];
      const joints = spec.start === "feet" ? mix(mix(P.stand, P.crouch, Math.sin(Math.PI * Math.min(1, x * 1.15))), P.reach, ramp(x, 0.55, 1)) : rest;
      return { somersault: startAngle, twist: 0, height: startH - depth, bedDepth: depth, joints, phase };
    }
    if (t <= t1) {
      const u = (t - t0) / flight;
      const height = startH + (endH - startH) * u + 4 * apex * u * (1 - u);
      const somersault = startAngle + totalRot * rotProgress(u);
      return { somersault, twist: twistAt(u), height, bedDepth: 0, joints: flightPosture(u), phase };
    }
    if (t <= t2) {
      const x = (t - t1) / landing;
      const sink = Math.sin(Math.PI * x) * (1 - 0.35 * x);
      const depth = (spec.end === "feet" ? 0.5 : 0.3) * sink;
      const target = spec.end === "feet" ? P.land : REST_POSTURE[spec.end];
      const joints = spec.end === "feet" ? mix(target, P.stand, ramp(x, 0.5, 1)) : target;
      return { somersault: startAngle + totalRot, twist: totalTwist, height: endH - depth, bedDepth: depth, joints, phase };
    }
    return { somersault: startAngle + totalRot, twist: totalTwist, height: endH, bedDepth: 0, joints: REST_POSTURE[spec.end], phase };
  }

  return { spec, duration, phases, sample };
}

/** Chains several skills into one timeline (a mini routine). Each must start where the previous landed. */
export function buildSequence(specs: SkillSpec[]): Timeline | { error: string } {
  if (specs.length === 0) return { error: "Add at least one skill." };
  for (let i = 1; i < specs.length; i++) {
    if (specs[i]!.start !== specs[i - 1]!.end)
      return { error: `${specs[i]!.name} starts from the ${specs[i]!.start}, but ${specs[i - 1]!.name} lands on the ${specs[i - 1]!.end}.` };
  }
  const parts = specs.map(buildTimeline);
  // Drop the hold at the end of every part except the last.
  const HOLD = 0.45;
  const lengths = parts.map((p, i) => (i === parts.length - 1 ? p.duration : p.duration - HOLD));
  const offsets = lengths.map((_, i) => lengths.slice(0, i).reduce((a, b) => a + b, 0));
  const duration = lengths.reduce((a, b) => a + b, 0);
  let twistCarry = 0;
  const carries = parts.map((p) => {
    const c = twistCarry;
    twistCarry += p.spec.twists.reduce((a, b) => a + b, 0) * Math.PI;
    return c;
  });
  const phases = parts.flatMap((p, i) => p.phases.map((ph) => ({ ...ph, start: ph.start + offsets[i]!, end: ph.end + offsets[i]!, title: `${p.spec.name}: ${ph.title}` })));
  const spec: SkillSpec = { ...specs[0]!, id: specs.map((s) => s.id).join("+"), name: specs.map((s) => s.name).join(" → "), end: specs[specs.length - 1]!.end };
  return {
    spec,
    duration,
    phases,
    sample(t: number) {
      let i = parts.length - 1;
      while (i > 0 && t < offsets[i]!) i--;
      const f = parts[i]!.sample(t - offsets[i]!);
      const phaseOffset = parts.slice(0, i).reduce((a, p) => a + p.phases.length, 0);
      return { ...f, twist: f.twist + carries[i]!, phase: f.phase + phaseOffset };
    },
  };
}
