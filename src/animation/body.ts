/**
 * Segmental body model for the animation physics.
 *
 * Segment mass fractions follow the widely used anthropometric table of de Leva (1996)
 * (adjustments to Zatsiorsky–Seluyanov). Lengths are for an athlete of about 1.65 m and
 * 55 kg. Segments are treated as solid cylinders when computing the inertia tensor.
 * Joint conventions match player.ts exactly (Euler XYZ with y = 0: v' = Rx·Rz·v).
 */

export type V3 = [number, number, number];

export type Joints = {
  spine: number; // trunk flexion (forward bend)
  hipFlex: number;
  hipAbd: number;
  knee: number;
  ankle: number; // plantarflexion (pointed toes)
  shoulderFlex: number;
  shoulderAbd: number;
  elbow: number;
  neck: number;
};

export const BODY_MASS = 55; // kg

/** Skeleton dimensions (metres), shared with the renderer. */
export const DIM = {
  spineY: 0.02,
  trunk: 0.5,
  shoulderX: 0.175,
  shoulderDrop: 0.05,
  hipX: 0.09,
  hipY: -0.04,
  upperArm: 0.29,
  forearm: 0.25,
  hand: 0.18,
  thigh: 0.42,
  shank: 0.42,
  head: 0.26,
  footBack: -0.05,
  footFront: 0.19,
  footDrop: 0.06,
} as const;

/** de Leva (1996) mass fractions. Paired segments are per side. */
const MASS = { head: 0.0694, trunk: 0.4346, upperArm: 0.0271, forearm: 0.0162, hand: 0.0061, thigh: 0.1416, shank: 0.0433, foot: 0.0137 };
const RADIUS = { head: 0.1, trunk: 0.125, upperArm: 0.045, forearm: 0.038, hand: 0.03, thigh: 0.072, shank: 0.05, foot: 0.035 };
/** Centre of mass as a fraction of segment length from the proximal joint (de Leva). */
const COM_FRAC = { head: 0.5, trunk: 0.44, upperArm: 0.43, forearm: 0.46, hand: 0.5, thigh: 0.41, shank: 0.44, foot: 0.44 };

export type Segment = { name: keyof typeof MASS; a: V3; b: V3; com: V3; m: number; r: number };

const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scale = (a: V3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const lerp3 = (a: V3, b: V3, t: number): V3 => add(a, scale(sub(b, a), t));

export function rotX(v: V3, a: number): V3 {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [v[0], v[1] * c - v[2] * s, v[1] * s + v[2] * c];
}
export function rotY(v: V3, a: number): V3 {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [v[0] * c + v[2] * s, v[1], -v[0] * s + v[2] * c];
}
export function rotZ(v: V3, a: number): V3 {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [v[0] * c - v[1] * s, v[0] * s + v[1] * c, v[2]];
}

/** A joint frame: maps a point in the child frame to the parent frame. */
type Frame = (p: V3) => V3;
const joint =
  (parent: Frame, offset: V3, rx: number, rz = 0): Frame =>
  (p) =>
    parent(add(offset, rotX(rotZ(p, rz), rx)));

/** Forward kinematics: every segment in the body frame (pelvis at the origin, facing +z). */
export function forwardKinematics(j: Joints): Segment[] {
  const body: Frame = (p) => p;
  const segs: Segment[] = [];
  const seg = (name: Segment["name"], f: Frame, a: V3, b: V3) => {
    const A = f(a);
    const B = f(b);
    segs.push({ name, a: A, b: B, com: lerp3(A, B, COM_FRAC[name]), m: MASS[name] * BODY_MASS, r: RADIUS[name] });
  };
  const spine = joint(body, [0, DIM.spineY, 0], j.spine);
  seg("trunk", spine, [0, -0.06, 0], [0, DIM.trunk, 0]);
  const neck = joint(spine, [0, DIM.trunk, 0], j.neck);
  seg("head", neck, [0, 0, 0], [0, DIM.head, 0]);
  for (const sx of [1, -1]) {
    const sh = joint(spine, [sx * DIM.shoulderX, DIM.trunk - DIM.shoulderDrop, 0], -j.shoulderFlex, sx * j.shoulderAbd);
    seg("upperArm", sh, [0, 0, 0], [0, -DIM.upperArm, 0]);
    const el = joint(sh, [0, -DIM.upperArm, 0], -j.elbow);
    seg("forearm", el, [0, 0, 0], [0, -DIM.forearm, 0]);
    seg("hand", el, [0, -DIM.forearm, 0], [0, -DIM.forearm - DIM.hand, 0]);
    const hip = joint(body, [sx * DIM.hipX, DIM.hipY, 0], -j.hipFlex, sx * j.hipAbd);
    seg("thigh", hip, [0, 0, 0], [0, -DIM.thigh, 0]);
    const knee = joint(hip, [0, -DIM.thigh, 0], j.knee);
    seg("shank", knee, [0, 0, 0], [0, -DIM.shank, 0]);
    const ankle = joint(knee, [0, -DIM.shank, 0], j.ankle);
    seg("foot", ankle, [0, -DIM.footDrop, DIM.footBack], [0, -DIM.footDrop, DIM.footFront]);
  }
  return segs;
}

export type MassProps = {
  /** Whole-body centre of mass in the body frame. */
  com: V3;
  /** Inertia tensor about the CoM, body frame, row-major 3×3 (kg·m²). */
  I: number[];
};

export function massProperties(segs: Segment[]): MassProps {
  const M = segs.reduce((s, x) => s + x.m, 0);
  const com = scale(
    segs.reduce<V3>((acc, s) => add(acc, scale(s.com, s.m)), [0, 0, 0]),
    1 / M,
  );
  const I = [0, 0, 0, 0, 0, 0, 0, 0, 0];
  for (const s of segs) {
    const axis = sub(s.b, s.a);
    const L = Math.hypot(...axis) || 1e-6;
    const u = scale(axis, 1 / L);
    // Solid cylinder about its own centre: parallel component m r²/2, perpendicular m(3r²+L²)/12.
    const iPar = (s.m * s.r * s.r) / 2;
    const iPerp = (s.m * (3 * s.r * s.r + L * L)) / 12;
    const d = sub(s.com, com);
    const dd = dot(d, d);
    for (let r = 0; r < 3; r++)
      for (let c = 0; c < 3; c++) {
        const e = r === c ? 1 : 0;
        I[r * 3 + c]! += iPerp * (e - u[r]! * u[c]!) + iPar * u[r]! * u[c]! + s.m * (dd * e - d[r]! * d[c]!);
      }
  }
  return { com, I };
}

/** Moment of inertia about a body-frame unit axis through the CoM. */
export function inertiaAbout(I: number[], a: V3) {
  let v = 0;
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) v += a[r]! * I[r * 3 + c]! * a[c]!;
  return v;
}

/** World-space orientation used everywhere: somersault θ about world x, twist φ about the body's long axis. */
export function orientPoint(p: V3, somersault: number, twist: number): V3 {
  return rotX(rotY(p, twist), somersault);
}

/** Height of the CoM above the lowest point of the body (surface included) for an orientation. */
export function comAboveLowest(segs: Segment[], com: V3, somersault: number, twist: number) {
  const comY = orientPoint(com, somersault, twist)[1];
  let low = Infinity;
  for (const s of segs) for (const p of [s.a, s.b]) low = Math.min(low, orientPoint(p, somersault, twist)[1] - s.r);
  return comY - low;
}
