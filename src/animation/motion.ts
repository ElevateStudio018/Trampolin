/**
 * Physics-based motion for schematic skill animations.
 *
 * What is simulated (the "rules"):
 * - Gravity: in the air the whole-body centre of mass (CoM) follows a ballistic parabola,
 *   g = 9.81 m/s², no air resistance. Flight time, take-off speed and height are linked.
 * - The bed is a spring (and a damper when the athlete absorbs the landing). Depression
 *   and contact time come from integrating m·ÿ = −m·g − k·y (− c·ẏ).
 * - Angular momentum about the somersault axis is conserved in the air: ω(t) = H / I(t),
 *   where I(t) is computed from a 14-segment body (de Leva masses) in its current shape.
 *   Tucking lowers I and speeds the rotation; opening slows it. H is solved so the skill
 *   completes exactly its stated rotation.
 * - Twist rate likewise follows the long-axis moment of inertia (arms in → faster).
 *
 * Simplifications (stated in the UI): the body shape over time is prescribed (it is the
 * athlete's choice, not physics), twist–somersault coupling is not simulated, and the
 * CoM stays above the bed centre (no travel). It describes what a skill is, not how to
 * learn it, and is not motion capture.
 */
import { BODY_MASS, comAboveLowest, forwardKinematics, inertiaAbout, massProperties, orientPoint, type Joints, type V3 } from "./body";

export type { Joints } from "./body";
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
  twistTiming?: "middle" | "late";
  note?: string;
};

export type Frame = {
  somersault: number;
  twist: number;
  /** Pelvis position relative to the resting bed centre (metres, y up). */
  pelvis: V3;
  /** Whole-body centre of mass, same frame. */
  com: V3;
  /** Bed depression at the centre (metres; negative = bed above rest while vibrating). */
  bedDepth: number;
  joints: Joints;
  phase: number;
  inContact: boolean;
};

export type Phase = { start: number; end: number; title: string; detail: string };

export type Physics = {
  skill: string;
  flightTime: number;
  takeoffSpeed: number;
  landingSpeed: number;
  /** Highest CoM point above the resting bed surface. */
  apexHeight: number;
  /** CoM rise from take-off to apex. */
  rise: number;
  bedDepth: number;
  contactTime: number;
  angularMomentum: number;
  peakSomersaultRate: number; // rev/s
  minInertia: number;
  maxInertia: number;
  peakTwistRate: number; // rev/s
};

export type Timeline = {
  spec: SkillSpec;
  duration: number;
  phases: Phase[];
  physics: Physics[];
  sample(t: number): Frame;
};

export const G = 9.81;
/** Effective bed stiffness for a 55 kg athlete (N/m): unloaded half-period ≈ 0.28 s. */
export const BED_K = BODY_MASS * (Math.PI / 0.28) ** 2;

const D = Math.PI / 180;
const HALF_PI = Math.PI / 2;
export const POSE_ANGLE: Record<Pose, number> = { feet: 0, seat: 0, front: HALF_PI, back: -HALF_PI };

// ---------------------------------------------------------------------------
// Postures (the prescribed part: what the athlete does with the body)
// ---------------------------------------------------------------------------

const J = (o: Partial<Joints>): Joints => ({ spine: 0, hipFlex: 0, hipAbd: 0, knee: 0, ankle: 0, shoulderFlex: 0, shoulderAbd: 0, elbow: 0, neck: 0, ...o });
const P = {
  stand: J({ shoulderFlex: 5 * D, shoulderAbd: 8 * D, elbow: 12 * D }),
  fall: J({ shoulderFlex: 40 * D, shoulderAbd: 12 * D, elbow: 15 * D, ankle: 35 * D }),
  crouch: J({ spine: 12 * D, hipFlex: 40 * D, knee: 60 * D, ankle: -10 * D, shoulderFlex: -25 * D, shoulderAbd: 6 * D, elbow: 15 * D }),
  reach: J({ shoulderFlex: 172 * D, shoulderAbd: 6 * D, elbow: 4 * D, ankle: 45 * D }),
  straight: J({ shoulderFlex: 150 * D, shoulderAbd: 10 * D, elbow: 8 * D, ankle: 70 * D }),
  twist: J({ shoulderFlex: 25 * D, shoulderAbd: 4 * D, elbow: 135 * D, ankle: 70 * D }),
  tuck: J({ spine: 35 * D, hipFlex: 128 * D, hipAbd: 8 * D, knee: 138 * D, ankle: 60 * D, shoulderFlex: 55 * D, shoulderAbd: 10 * D, elbow: 78 * D, neck: 18 * D }),
  pike: J({ spine: 32 * D, hipFlex: 118 * D, ankle: 70 * D, shoulderFlex: 95 * D, shoulderAbd: 5 * D, elbow: 5 * D, neck: 18 * D }),
  straddle: J({ spine: 25 * D, hipFlex: 100 * D, hipAbd: 45 * D, ankle: 70 * D, shoulderFlex: 95 * D, shoulderAbd: 35 * D, elbow: 5 * D, neck: 10 * D }),
  land: J({ spine: 6 * D, hipFlex: 22 * D, knee: 30 * D, shoulderFlex: 90 * D, shoulderAbd: 15 * D, elbow: 10 * D }),
  landDeep: J({ spine: 14 * D, hipFlex: 45 * D, knee: 70 * D, ankle: -12 * D, shoulderFlex: 70 * D, shoulderAbd: 15 * D, elbow: 15 * D }),
  seat: J({ spine: -5 * D, hipFlex: 90 * D, ankle: 55 * D, shoulderFlex: -25 * D, shoulderAbd: 15 * D, elbow: 5 * D }),
  back: J({ hipFlex: 45 * D, knee: 70 * D, ankle: 20 * D, shoulderFlex: 60 * D, shoulderAbd: 20 * D, elbow: 20 * D, neck: 15 * D }),
  front: J({ knee: 20 * D, ankle: 60 * D, shoulderFlex: 120 * D, shoulderAbd: 40 * D, elbow: 110 * D, neck: -15 * D }),
};
const SHAPE_POSTURE: Record<Shape, Joints> = { tuck: P.tuck, pike: P.pike, straight: P.straight, straddle: P.straddle };
const REST: Record<Pose, Joints> = { feet: P.stand, seat: P.seat, back: P.back, front: P.front };

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
const ramp = (x: number, a: number, b: number) => smooth((x - a) / (b - a));

// ---------------------------------------------------------------------------
// Validation and notation
// ---------------------------------------------------------------------------

const mod2pi = (a: number) => ((a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
export function somersaultCount(quarters: number) {
  return Math.max(1, Math.ceil(quarters / 4));
}
export function landingAngle(spec: Pick<SkillSpec, "start" | "direction" | "quarters">) {
  return POSE_ANGLE[spec.start] + spec.direction * spec.quarters * HALF_PI;
}
export function isConsistent(spec: SkillSpec): boolean {
  const diff = mod2pi(landingAngle(spec) - POSE_ANGLE[spec.end]);
  const ok = diff < 1e-6 || Math.abs(diff - 2 * Math.PI) < 1e-6;
  return ok && spec.twists.length === somersaultCount(spec.quarters) && spec.twists.every((t) => Number.isInteger(t) && t >= 0);
}

/** FIG notation: quarter rotations, half twists per somersault, then / < or o. */
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
  return { id: `fig-${s}-${direction > 0 ? "f" : "b"}`, name: `${s} ${direction > 0 ? "forward" : "backward"}`, start: "feet", end, direction, quarters, twists, shape, kind: "rotation" };
}

// ---------------------------------------------------------------------------
// Bed spring
// ---------------------------------------------------------------------------

type Track = { dt: number; y: Float64Array; v: Float64Array; duration: number };
const SIM_DT = 1 / 2000;

/** Integrates the contact point on the bed: m·ÿ = −m·g − k·y − c·ẏ while y < 0, free fall otherwise. */
function simulate(y0: number, v0: number, k: number, c: number, stop: (y: number, v: number, t: number) => boolean, maxT = 3): Track {
  const ys: number[] = [y0];
  const vs: number[] = [v0];
  let y = y0;
  let v = v0;
  let t = 0;
  while (t < maxT) {
    const a = -G + (y < 0 ? (-k * y - c * v) / BODY_MASS : 0);
    v += a * SIM_DT;
    y += v * SIM_DT;
    t += SIM_DT;
    ys.push(y);
    vs.push(v);
    if (stop(y, v, t)) break;
  }
  return { dt: SIM_DT, y: Float64Array.from(ys), v: Float64Array.from(vs), duration: t };
}
function at(track: Track, t: number) {
  const x = Math.max(0, Math.min(track.y.length - 1, t / track.dt));
  const i = Math.floor(x);
  const f = x - i;
  const j = Math.min(i + 1, track.y.length - 1);
  return { y: track.y[i]! + (track.y[j]! - track.y[i]!) * f, v: track.v[i]! + (track.v[j]! - track.v[i]!) * f };
}

// ---------------------------------------------------------------------------
// One skill
// ---------------------------------------------------------------------------

const POSE_WORD: Record<Pose, string> = { feet: "feet", seat: "seat", back: "back", front: "front" };
function fraction(quarters: number) {
  const whole = Math.floor(quarters / 4);
  const rem = ["", "¼", "½", "¾"][quarters % 4]!;
  return `${whole || (rem ? "" : "0")}${rem}`;
}
function twistWords(h: number) {
  if (h === 0) return "no twist";
  if (h === 1) return "half twist";
  if (h === 2) return "full twist";
  if (h % 2 === 0) return `${h / 2} full twists`;
  return `${(h - 1) / 2}½ twists`;
}
const cm = (m: number) => `${Math.round(m * 100)} cm`;
const mps = (v: number) => `${Math.abs(v).toFixed(1)} m/s`;

type PartOpts = { first: boolean; last: boolean; startDepth?: number; twist0?: number };
type Part = Timeline & { endDepth: number };

export function flightTimeFor(spec: SkillSpec) {
  const n = somersaultCount(spec.quarters);
  const halfTwists = spec.twists.reduce((a, b) => a + b, 0);
  if (spec.kind === "jump") return 1.3;
  if (spec.kind === "seat-twist") return 0.85;
  if (spec.quarters <= 1) return spec.start === "feet" ? 1.0 : 0.85;
  if (spec.start !== "feet") return 1.0 + 0.07 * spec.quarters;
  return 1.3 + 0.22 * n + 0.025 * halfTwists;
}

function buildPart(spec: SkillSpec, opts: PartOpts): Part {
  const n = somersaultCount(spec.quarters);
  const lying = spec.start !== "feet";
  const T = flightTimeFor(spec);
  const startAngle = POSE_ANGLE[spec.start];
  const totalRot = spec.direction * spec.quarters * HALF_PI;
  const twist0 = opts.twist0 ?? 0;
  const totalTwist = spec.twists.reduce((a, b) => a + b, 0) * Math.PI;
  const shapePosture = SHAPE_POSTURE[spec.shape];
  const k = BED_K;

  // ---- prescribed flight shape (u = 0..1 across the flight)
  const segA = 0.1;
  const segB = 0.88;
  const seg = (i: number) => [segA + ((segB - segA) * i) / n, segA + ((segB - segA) * (i + 1)) / n] as const;
  const twistWindow = (i: number) => {
    const [a, b] = seg(i);
    const len = b - a;
    return spec.twistTiming === "late" ? ([a + 0.55 * len, Math.min(0.97, b + 0.06)] as const) : ([a + 0.15 * len, a + 0.85 * len] as const);
  };
  const shapeWeight = (u: number) => {
    if (spec.kind === "jump") return ramp(u, 0.25, 0.42) * (1 - ramp(u, 0.58, 0.75));
    if (spec.kind === "seat-twist" || spec.quarters <= 1 || spec.shape === "straight") return 0;
    let w = ramp(u, 0.04, 0.16) * (1 - ramp(u, 0.8, 0.9));
    for (let i = 0; i < n; i++) {
      if (!spec.twists[i]) continue;
      const [a, b] = twistWindow(i);
      w *= 1 - 0.75 * ramp(u, a - 0.06, a) * (1 - ramp(u, b, b + 0.06));
    }
    return w;
  };
  const armsIn = (u: number) => {
    let tw = 0;
    for (let i = 0; i < n; i++) {
      if (!spec.twists[i]) continue;
      const [a, b] = twistWindow(i);
      tw = Math.max(tw, ramp(u, a - 0.05, a) * (1 - ramp(u, b, b + 0.05)));
    }
    return tw;
  };
  const landTarget = spec.end === "feet" ? P.land : REST[spec.end];
  const flightPosture = (u: number): Joints => {
    if (spec.kind === "seat-twist") {
      const up = ramp(u, 0.1, 0.4) * (1 - ramp(u, 0.6, 0.9));
      return mix(mix(P.seat, P.twist, up), P.seat, ramp(u, 0.85, 1));
    }
    const leave = lying ? REST[spec.start] : P.reach;
    const open = spec.kind === "jump" ? P.straight : spec.twists.some((t) => t > 0) ? P.twist : P.straight;
    let j = spec.kind === "jump" ? mix(P.reach, shapePosture, shapeWeight(u)) : mix(mix(leave, open, ramp(u, 0, 0.12)), shapePosture, shapeWeight(u));
    if (spec.shape === "straight" || spec.kind === "jump") j = mix(j, P.twist, armsIn(u));
    if (spec.quarters <= 1 && spec.kind === "rotation") j = mix(mix(leave, P.straight, ramp(u, 0, 0.3)), landTarget, ramp(u, 0.35, 0.95));
    return mix(j, landTarget, ramp(u, 0.86, 1));
  };

  // ---- inertia along the flight (sampled), then twist from long-axis inertia
  const N = 400;
  const props = Array.from({ length: N + 1 }, (_, i) => massProperties(forwardKinematics(flightPosture(i / N))));
  const iLong = props.map((p) => inertiaAbout(p.I, [0, 1, 0]));
  // Twist angle per sample: inside each window the rate ∝ 1 / I_long.
  const twistArr = new Float64Array(N + 1);
  {
    const wins = Array.from({ length: n }, (_, i) => ({ h: spec.twists[i] ?? 0, w: twistWindow(i) }));
    if (spec.kind === "seat-twist") wins.splice(0, wins.length, { h: spec.twists[0] ?? 1, w: [0.2, 0.8] as const });
    // Windows don't overlap, so each adds its share on top of the twist already reached.
    for (const { h, w } of wins) {
      if (!h) continue;
      const ia = Math.round(w[0] * N);
      const ib = Math.round(w[1] * N);
      let total = 0;
      for (let i = ia; i < ib; i++) total += 1 / iLong[i]!;
      let acc = 0;
      for (let i = ia + 1; i <= N; i++) {
        if (i <= ib) acc += 1 / iLong[i - 1]!;
        twistArr[i]! += h * Math.PI * Math.min(1, acc / total);
      }
    }
  }
  const twistAtU = (u: number) => {
    const x = clamp01(u) * N;
    const i = Math.floor(x);
    const j = Math.min(N, i + 1);
    return twistArr[i]! + (twistArr[j]! - twistArr[i]!) * (x - i);
  };
  // Somersault-axis inertia includes the current twist (world x expressed in the body frame).
  const iSom = props.map((p, i) => {
    const phi = twistArr[i]!;
    return inertiaAbout(p.I, [Math.cos(phi), 0, Math.sin(phi)]);
  });
  const invCum = new Float64Array(N + 1);
  for (let i = 1; i <= N; i++) invCum[i] = invCum[i - 1]! + (0.5 * (1 / iSom[i - 1]! + 1 / iSom[i]!)) / N;
  const invCumAt = (u: number) => {
    const x = clamp01(u) * N;
    const i = Math.floor(x);
    const j = Math.min(N, i + 1);
    return invCum[i]! + (invCum[j]! - invCum[i]!) * (x - i);
  };

  // ---- contact postures
  const approachPosture = (x: number) => (lying ? REST[spec.start] : mix(P.fall, P.stand, ramp(x, 0.6, 1)));
  const compressPosture = (x: number) => (lying ? REST[spec.start] : mix(P.stand, P.crouch, smooth(x)));
  const extendFrom = opts.first ? P.crouch : P.landDeep;
  const extendPosture = (x: number) => (lying ? REST[spec.start] : mix(extendFrom, P.reach, ramp(x, 0.1, 1)));
  const landPosture = (x: number) => (spec.end === "feet" ? mix(P.land, P.landDeep, smooth(x)) : REST[spec.end]);
  const settlePosture = (x: number) => (spec.end === "feet" ? mix(P.landDeep, P.stand, ramp(x, 0.15, 0.7)) : REST[spec.end]);

  const offsetFor = (j: Joints, theta: number, phi: number) => {
    const segs = forwardKinematics(j);
    const { com } = massProperties(segs);
    return comAboveLowest(segs, com, theta, phi);
  };

  // ---- solve contact + flight + angular momentum together (fixed-point iteration)
  const vIn = lying ? Math.sqrt(2 * G * 0.45) : (G * T) / 2;
  const approachT = opts.first ? 0.4 : 0;
  const comp1 = opts.first ? simulate(0, -vIn, k, 0, (_y, v) => v >= 0) : null;
  const depth0 = opts.first ? -comp1!.y[comp1!.y.length - 1]! : (opts.startDepth ?? 0.5);
  let H = 0;
  let ext: Track = simulate(-depth0, 0, k, 0, (y) => y >= 0);
  let comp2: Track = simulate(0, -(G * T) / 2, k, 0, (_y, v) => v >= 0);
  let vOut = (G * T) / 2;
  let off0 = 0;
  let offL = 0;
  for (let iter = 0; iter < 4; iter++) {
    const e = ext.duration;
    const c2 = comp2.duration;
    const I0 = iSom[0]!;
    const IL = iSom[N]!;
    const denom = e / (2 * I0) + T * invCum[N]! + c2 / (2 * IL);
    H = totalRot / denom;
    const thetaTo = startAngle + (H / I0) * (e / 2);
    const thetaTd = thetaTo + H * T * invCum[N]!;
    off0 = offsetFor(flightPosture(0), thetaTo, twist0);
    offL = offsetFor(flightPosture(1), thetaTd, twist0 + totalTwist);
    vOut = (offL - off0) / T + (G * T) / 2;
    // Extension stiffness so the bed returns the athlete at vOut from depth0 (the legs add or remove energy).
    const kOut = (BODY_MASS * vOut * vOut + 2 * BODY_MASS * G * depth0) / (depth0 * depth0);
    ext = simulate(-depth0, 0, kOut, 0, (y) => y >= 0);
    comp2 = simulate(0, vOut - G * T, k, 0, (_y, v) => v >= 0);
  }
  const vLand = vOut - G * T;
  const e = ext.duration;
  const c2 = comp2.duration;
  const endDepth = -comp2.y[comp2.y.length - 1]!;
  const settle = opts.last
    ? simulate(-endDepth, 0, k, 2 * (spec.end === "feet" ? 0.75 : 0.3) * Math.sqrt(k * BODY_MASS), (_y, _v, t) => t >= 1.3)
    : null;
  const I0 = iSom[0]!;
  const IL = iSom[N]!;

  // ---- time markers
  const tTd1 = approachT;
  const tBottom1 = tTd1 + (comp1?.duration ?? 0);
  const tTo = tBottom1 + e;
  const tTd2 = tTo + T;
  const tBottom2 = tTd2 + c2;
  const tSettle = tBottom2 + (settle?.duration ?? 0);
  const duration = opts.last ? tSettle + 0.35 : tBottom2;

  const thetaTo = startAngle + (H / I0) * (e / 2);
  const thetaTd = thetaTo + H * T * invCum[N]!;
  const thetaEnd = startAngle + totalRot;

  // ---- phases
  const phases: Phase[] = [];
  if (opts.first)
    phases.push({
      start: 0,
      end: tBottom1,
      title: "Approach",
      detail: `Comes down onto the bed at ${mps(vIn)}; the bed sinks ${cm(depth0)} and stores the energy.`,
    });
  phases.push({
    start: tBottom1,
    end: tTo,
    title: "Take-off",
    detail: `The bed springs back and leaves the athlete${lying ? ` from the ${POSE_WORD[spec.start]}` : ""} at ${mps(vOut)} upwards${spec.quarters ? ", with the rotation already started" : ""}.`,
  });
  const ft = (u: number) => tTo + u * T;
  if (spec.kind === "jump") {
    phases.push({ start: tTo, end: ft(0.3), title: "Rise", detail: "Straight body on the way up; gravity slows the rise." });
    phases.push({ start: ft(0.3), end: ft(0.72), title: `${spec.shape[0]!.toUpperCase()}${spec.shape.slice(1)} shape`, detail: `Shows the ${spec.shape} shape around the top of the jump.` });
    phases.push({ start: ft(0.72), end: tTd2, title: "Descent", detail: "Opens to a straight body while falling back to the bed." });
  } else if (spec.kind === "seat-twist") {
    phases.push({ start: tTo, end: tTd2, title: "Half twist", detail: "Rises from the seat and turns half a twist about the body's long axis." });
  } else if (spec.quarters <= 1) {
    phases.push({
      start: tTo,
      end: tTd2,
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
    for (let i = 0; i < n; i++) {
      const [a, b] = seg(i);
      const h = spec.twists[i] ?? 0;
      const ord = ["First", "Second", "Third"][i] ?? `#${i + 1}`;
      phases.push({
        start: ft(a),
        end: ft(b),
        title: `${ord} somersault${h ? ` · ${twistWords(h)}` : ""}`,
        detail: h
          ? `Twists ${twistWords(h)} about the long axis while ${spec.direction > 0 ? "rotating forward" : "rotating backward"}${n > 1 ? (i === 0 ? ` (the twist "in")` : i === n - 1 ? ` (the twist "out")` : "") : ""}; arms in make the twist faster.`
          : `${spec.shape === "straight" ? "Straight" : `${spec.shape[0]!.toUpperCase()}${spec.shape.slice(1)}`} rotation without twist${spec.shape !== "straight" ? "; the compact shape has a low moment of inertia, so it spins faster" : ""}.`,
      });
    }
  }
  if (spec.kind === "rotation" && spec.quarters > 1) phases.push({ start: ft(segB), end: tTd2, title: "Opening", detail: "Opens the body: the moment of inertia rises, so the rotation slows before landing." });
  phases.push({ start: tTd2, end: tBottom2, title: "Landing", detail: `Touches down on the ${POSE_WORD[spec.end]} at ${mps(vLand)}; the bed sinks ${cm(endDepth)}.` });
  if (opts.last) phases.push({ start: tBottom2, end: duration, title: "Settle", detail: spec.end === "feet" ? "Bending at hips and knees absorbs the rebound." : "The bed rebounds a little and settles." });

  const phaseAt = (t: number) => {
    let idx = 0;
    phases.forEach((p, i) => {
      if (t >= p.start - 1e-9) idx = i;
    });
    return idx;
  };

  // ---- bed free vibration after take-off (small, damped)
  const bedAfter = (tau: number, v: number) => -0.06 * (Math.abs(v) / 8) * Math.exp(-7 * tau) * Math.sin(2 * Math.PI * 3.2 * tau);

  function frameFrom(j: Joints, theta: number, phi: number, comY: number, bedDepth: number, t: number, contact: boolean): Frame {
    const segs = forwardKinematics(j);
    const { com } = massProperties(segs);
    const c = orientPoint(com, theta, phi);
    const pelvis: V3 = [-c[0], comY - c[1], -c[2]];
    return { somersault: theta, twist: phi, pelvis, com: [0, comY, 0], bedDepth, joints: j, phase: phaseAt(t), inContact: contact };
  }

  function sample(tRaw: number): Frame {
    const t = Math.max(0, Math.min(duration, tRaw));
    if (t < tTd1) {
      // Falling onto the bed from the previous bounce.
      const s = tTd1 - t;
      const x = t / Math.max(tTd1, 1e-6);
      const j = approachPosture(x);
      // Ballistic CoM: it reaches touchdown height exactly when the feet meet the bed.
      const comY = offsetFor(approachPosture(1), startAngle, twist0) + vIn * s - 0.5 * G * s * s;
      return frameFrom(j, startAngle, twist0, comY, 0, t, false);
    }
    if (t < tBottom1 && comp1) {
      const x = (t - tTd1) / comp1.duration;
      const j = compressPosture(x);
      const { y } = at(comp1, t - tTd1);
      return frameFrom(j, startAngle, twist0, y + offsetFor(j, startAngle, twist0), -y, t, true);
    }
    if (t < tTo) {
      const tau = t - tBottom1;
      const x = tau / e;
      const j = extendPosture(x);
      const theta = startAngle + ((H / I0) * tau * tau) / (2 * e);
      const { y } = at(ext, tau);
      return frameFrom(j, theta, twist0, y + offsetFor(j, theta, twist0), -y, t, true);
    }
    if (t < tTd2) {
      const tau = t - tTo;
      const u = tau / T;
      const j = flightPosture(u);
      const theta = thetaTo + H * T * invCumAt(u);
      const phi = twist0 + twistAtU(u);
      const comY = off0 + vOut * tau - 0.5 * G * tau * tau;
      return frameFrom(j, theta, phi, comY, bedAfter(tau, vOut), t, false);
    }
    if (t < tBottom2) {
      const tau = t - tTd2;
      const x = tau / c2;
      const j = landPosture(x);
      const wL = H / IL;
      const theta = thetaTd + wL * (tau - (tau * tau) / (2 * c2));
      const { y } = at(comp2, tau);
      const phi = twist0 + totalTwist;
      return frameFrom(j, theta, phi, y + offsetFor(j, theta, phi), -y, t, true);
    }
    const phi = twist0 + totalTwist;
    if (settle && t < tSettle) {
      const tau = t - tBottom2;
      const j = settlePosture(tau / settle.duration);
      const { y } = at(settle, tau);
      return frameFrom(j, thetaEnd, phi, y + offsetFor(j, thetaEnd, phi), -Math.min(0, y) + (y > 0 ? bedAfter(tau, 1) : 0), t, y <= 0);
    }
    const j = opts.last ? REST[spec.end] : landPosture(1);
    // At rest the bed carries the body's weight: static sag m·g/k.
    const y = opts.last ? -(BODY_MASS * G) / k : -endDepth;
    return frameFrom(j, thetaEnd, phi, y + offsetFor(j, thetaEnd, phi), -y, t, true);
  }

  // ---- physics summary
  let peakRate = 0;
  if (H !== 0) for (const I of iSom) peakRate = Math.max(peakRate, Math.abs(H / I) / (2 * Math.PI));
  let peakTwist = 0;
  for (let i = 1; i <= N; i++) peakTwist = Math.max(peakTwist, Math.abs(twistArr[i]! - twistArr[i - 1]!) / (T / N) / (2 * Math.PI));
  const rise = (vOut * vOut) / (2 * G);
  const physics: Physics = {
    skill: spec.name,
    flightTime: T,
    takeoffSpeed: vOut,
    landingSpeed: Math.abs(vLand),
    apexHeight: off0 + rise,
    rise,
    bedDepth: depth0,
    contactTime: (comp1?.duration ?? 0) + e,
    angularMomentum: Math.abs(H),
    peakSomersaultRate: peakRate,
    minInertia: Math.min(...iSom),
    maxInertia: Math.max(...iSom),
    peakTwistRate: peakTwist,
  };

  return { spec, duration, phases, physics: [physics], sample, endDepth };
}

/** Builds the physics timeline for one skill. Times are in seconds at 1× speed. */
export function buildTimeline(spec: SkillSpec): Timeline {
  return buildPart(spec, { first: true, last: true });
}

/**
 * Chains skills into one continuous routine: the landing of one skill is the take-off
 * of the next (the bed depression carries over), so each must start where the previous landed.
 */
export function buildSequence(specs: SkillSpec[]): Timeline | { error: string } {
  if (specs.length === 0) return { error: "Add at least one skill." };
  for (let i = 1; i < specs.length; i++) {
    if (specs[i]!.start !== specs[i - 1]!.end)
      return { error: `${specs[i]!.name} starts from the ${specs[i]!.start}, but ${specs[i - 1]!.name} lands on the ${specs[i - 1]!.end}.` };
  }
  const parts: Part[] = [];
  let twist = 0;
  for (let i = 0; i < specs.length; i++) {
    const s = specs[i]!;
    parts.push(buildPart(s, { first: i === 0, last: i === specs.length - 1, startDepth: parts[i - 1]?.endDepth, twist0: twist }));
    twist += s.twists.reduce((a, b) => a + b, 0) * Math.PI;
  }
  const offsets = parts.map((_, i) => parts.slice(0, i).reduce((a, p) => a + p.duration, 0));
  const duration = parts.reduce((a, p) => a + p.duration, 0);
  const phases = parts.flatMap((p, i) => p.phases.map((ph) => ({ ...ph, start: ph.start + offsets[i]!, end: ph.end + offsets[i]!, title: `${p.spec.name}: ${ph.title}` })));
  const spec: SkillSpec = { ...specs[0]!, id: specs.map((s) => s.id).join("+"), name: specs.map((s) => s.name).join(" → "), end: specs[specs.length - 1]!.end };
  return {
    spec,
    duration,
    phases,
    physics: parts.map((p) => p.physics[0]!),
    sample(t: number) {
      let i = parts.length - 1;
      while (i > 0 && t < offsets[i]!) i--;
      const f = parts[i]!.sample(t - offsets[i]!);
      const phaseOffset = parts.slice(0, i).reduce((a, p) => a + p.phases.length, 0);
      return { ...f, phase: f.phase + phaseOffset };
    },
  };
}
