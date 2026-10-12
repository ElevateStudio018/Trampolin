import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { DIM } from "./body";
import type { Frame, Timeline } from "./motion";

/**
 * Three.js renderer for skill timelines: an articulated mannequin on a competition-size
 * trampoline. Framework-agnostic so the Next.js app and the static demo share it.
 */

export type CameraPreset = "phone" | "side" | "wide" | "front" | "three-quarter";

export type PlayerOptions = {
  onTime?: (t: number, frame: Frame) => void;
  onEnd?: () => void;
  colors?: Partial<typeof DEFAULT_COLORS>;
};

const DEFAULT_COLORS = { suit: "#1f3fbf", skin: "#d9a184", hair: "#3b2618", frame: "#1d3a8a", pad: "#e8590c", mat: "#2f62c9", bed: "#16181d", floor: "#d9d6cc", trail: "#e8590c" };

// FIG trampoline bed: roughly 4.3 m × 2.1 m inside a 5.05 m × 2.91 m frame, 1.155 m high.
const BED_LEN = 4.3;
const BED_WID = 2.1;
const FRAME_LEN = 5.05;
const FRAME_WID = 2.91;
const BED_Y = 1.155;

type Limb = { joint: THREE.Group };


const HALL = { w: 34, d: 40, h: 13 };

function canvasTexture(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, repeat?: [number, number]) {
  const cv = document.createElement("canvas");
  cv.width = w;
  cv.height = h;
  const g = cv.getContext("2d");
  if (!g) return null;
  draw(g);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  if (repeat) {
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(...repeat);
  }
  return tex;
}

/** Light wooden sports floor with court lines. */
function floorTexture() {
  return canvasTexture(1024, 1024, (g) => {
    const plank = 1024 / 16;
    for (let i = 0; i < 16; i++) {
      const tone = 196 + ((i * 37) % 23) - 11;
      g.fillStyle = `rgb(${tone}, ${Math.round(tone * 0.78)}, ${Math.round(tone * 0.52)})`;
      g.fillRect(0, i * plank, 1024, plank);
      g.fillStyle = "rgba(90, 60, 30, 0.18)";
      g.fillRect(0, i * plank, 1024, 1.5);
      for (let k = 0; k < 3; k++) g.fillRect(((i * 211 + k * 347) % 1024), i * plank, 1.5, plank);
    }
    g.strokeStyle = "rgba(30, 80, 170, 0.85)";
    g.lineWidth = 5;
    g.strokeRect(120, 90, 784, 844);
    g.beginPath();
    g.moveTo(120, 512);
    g.lineTo(904, 512);
    g.stroke();
    g.beginPath();
    g.arc(512, 512, 90, 0, Math.PI * 2);
    g.stroke();
  });
}

/** Hall ceiling: dark roof with steel beams. */
function ceilingTexture() {
  return canvasTexture(
    512,
    512,
    (g) => {
      g.fillStyle = "#5d6168";
      g.fillRect(0, 0, 512, 512);
      g.fillStyle = "#43474d";
      for (let x = 0; x < 512; x += 128) g.fillRect(x, 0, 14, 512);
      g.fillStyle = "rgba(255,255,255,0.05)";
      for (let y = 0; y < 512; y += 16) g.fillRect(0, y, 512, 2);
    },
    [3, 3],
  );
}

/** Painted block wall: darker lower band, light upper wall. */
function wallTexture() {
  return canvasTexture(
    512,
    512,
    (g) => {
    g.fillStyle = "#ece9e2";
    g.fillRect(0, 0, 512, 512);
    g.fillStyle = "#7d8fa6";
    g.fillRect(0, 430, 512, 82);
    g.strokeStyle = "rgba(0,0,0,0.06)";
    g.lineWidth = 2;
    for (let y = 0; y < 512; y += 32) {
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(512, y);
      g.stroke();
      for (let x = (y / 32) % 2 ? 0 : 32; x < 512; x += 64) {
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x, y + 32);
        g.stroke();
      }
    }
    },
    [6, 1],
  );
}

/** Bed markings drawn into the texture so they sink with the bed: the centre cross and the target zone. */
function bedTexture(bed: string) {
  const W = 256;
  const H = Math.round((W * BED_LEN) / BED_WID);
  const cv = document.createElement("canvas");
  cv.width = W;
  cv.height = H;
  const g = cv.getContext("2d");
  if (!g) return null;
  g.fillStyle = bed;
  g.fillRect(0, 0, W, H);
  const px = W / BED_WID;
  g.strokeStyle = "#c63b1f";
  g.lineWidth = 0.05 * px;
  g.strokeRect(W / 2 - 0.54 * px, H / 2 - 1.075 * px, 1.08 * px, 2.15 * px);
  g.beginPath();
  g.moveTo(W / 2 - 0.3 * px, H / 2);
  g.lineTo(W / 2 + 0.3 * px, H / 2);
  g.moveTo(W / 2, H / 2 - 0.3 * px);
  g.lineTo(W / 2, H / 2 + 0.3 * px);
  g.stroke();
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

export class SkillPlayer {
  readonly canvas: HTMLCanvasElement;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(38, 16 / 9, 0.1, 100);
  private root = new THREE.Group(); // pelvis
  private com = new THREE.Vector3(0, BED_Y + 1, 0);
  private orient = new THREE.Group(); // somersault + twist
  private bedGeom: THREE.PlaneGeometry;
  private bedBase: Float32Array;
  private trail: THREE.Points;
  private trailPositions: Float32Array;
  private trailCount = 0;
  private parts: Record<string, Limb> = {};
  private timeline: Timeline | null = null;
  private time = 0;
  private playing = false;
  private speed = 1;
  private last = 0;
  private raf = 0;
  private preset: CameraPreset = "phone";
  private steady = typeof window !== "undefined" && (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false);
  private aim = new THREE.Vector3(0, BED_Y + 1, 0);
  private showTrail = true;
  private resizeObserver: ResizeObserver;
  private opts: PlayerOptions;

  constructor(private container: HTMLElement, opts: PlayerOptions = {}) {
    this.opts = opts;
    const c = { ...DEFAULT_COLORS, ...opts.colors };
    this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.canvas = this.renderer.domElement;
    this.canvas.style.display = "block";
    this.canvas.style.width = "100%";
    this.canvas.style.height = "100%";
    this.canvas.setAttribute("role", "img");
    container.appendChild(this.canvas);

    this.scene.background = new THREE.Color("#e9e6df");

    // Image-based lighting (a neutral studio room) plus a key light for shadows.
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const room = new RoomEnvironment();
    this.scene.environment = pmrem.fromScene(room, 0.04).texture;
    this.scene.environmentIntensity = 0.55;
    room.dispose();
    pmrem.dispose();
    this.scene.add(new THREE.HemisphereLight("#ffffff", "#8a8578", 0.7));
    const sun = new THREE.DirectionalLight("#fff6ea", 2.4);
    sun.position.set(6, 12, 5);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -6;
    sun.shadow.camera.right = 6;
    sun.shadow.camera.top = 8;
    sun.shadow.camera.bottom = -4;
    this.scene.add(sun);

    // Gym hall: sports floor, walls and ceiling lights, so the height of a bounce has a reference.
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(HALL.w, HALL.d), new THREE.MeshStandardMaterial({ map: floorTexture(), roughness: 0.55, metalness: 0 }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.scene.add(floor);
    const wallMat = new THREE.MeshStandardMaterial({ map: wallTexture(), roughness: 0.9, side: THREE.BackSide });
    const hall = new THREE.Mesh(new THREE.BoxGeometry(HALL.w, HALL.h, HALL.d), [wallMat, wallMat, new THREE.MeshStandardMaterial({ map: ceilingTexture(), roughness: 1, side: THREE.BackSide }), new THREE.MeshBasicMaterial({ visible: false }), wallMat, wallMat]);
    hall.position.y = HALL.h / 2 - 0.001;
    hall.receiveShadow = true;
    this.scene.add(hall);
    const lampMat = new THREE.MeshStandardMaterial({ color: "#ffffff", emissive: "#fffaf0", emissiveIntensity: 1.6 });
    for (let x = -1; x <= 1; x += 2)
      for (let z = -2; z <= 2; z++) {
        const lamp = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.06, 0.5), lampMat);
        lamp.position.set(x * 6, HALL.h - 0.05, z * 5.5);
        this.scene.add(lamp);
      }

    // Trampoline: frame, pads, legs and a deformable bed. Long axis along z (travel direction).
    const frameMat = new THREE.MeshStandardMaterial({ color: c.frame, metalness: 0.4, roughness: 0.5 });
    const padMat = new THREE.MeshStandardMaterial({ color: c.pad, roughness: 0.8 });
    const tramp = new THREE.Group();
    const railL = (len: number, w: number, d: number) => new THREE.Mesh(new THREE.BoxGeometry(w, 0.08, d), frameMat);
    for (const s of [-1, 1]) {
      const side = railL(0, 0.08, FRAME_LEN);
      side.position.set((s * FRAME_WID) / 2, BED_Y, 0);
      tramp.add(side);
      const end = railL(0, FRAME_WID, 0.08);
      end.position.set(0, BED_Y, (s * FRAME_LEN) / 2);
      tramp.add(end);
      const padSide = new THREE.Mesh(new THREE.BoxGeometry((FRAME_WID - BED_WID) / 2, 0.05, FRAME_LEN), padMat);
      padSide.position.set((s * (FRAME_WID + BED_WID)) / 4, BED_Y + 0.05, 0);
      padSide.castShadow = padSide.receiveShadow = true;
      tramp.add(padSide);
      const padEnd = new THREE.Mesh(new THREE.BoxGeometry(BED_WID, 0.05, (FRAME_LEN - BED_LEN) / 2), padMat);
      padEnd.position.set(0, BED_Y + 0.05, (s * (FRAME_LEN + BED_LEN)) / 4);
      padEnd.castShadow = padEnd.receiveShadow = true;
      tramp.add(padEnd);
    }
    for (const x of [-1, 1])
      for (const z of [-1, 1]) {
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, BED_Y, 8), frameMat);
        leg.position.set((x * FRAME_WID) / 2, BED_Y / 2, (z * FRAME_LEN) / 2 - z * 0.3);
        leg.castShadow = true;
        tramp.add(leg);
      }
    this.bedGeom = new THREE.PlaneGeometry(BED_WID, BED_LEN, 24, 40);
    this.bedGeom.rotateX(-Math.PI / 2);
    this.bedBase = Float32Array.from(this.bedGeom.attributes.position!.array as Float32Array);
    const bed = new THREE.Mesh(this.bedGeom, new THREE.MeshStandardMaterial({ map: bedTexture(c.bed), roughness: 0.95, side: THREE.DoubleSide }));
    bed.position.y = BED_Y;
    bed.receiveShadow = true;
    tramp.add(bed);
    // End-deck safety mats on the floor at both ends.
    const matMat = new THREE.MeshStandardMaterial({ color: c.mat, roughness: 0.85 });
    for (const s of [-1, 1]) {
      const mat = new THREE.Mesh(new THREE.BoxGeometry(FRAME_WID + 0.6, 0.2, 2), matMat);
      mat.position.set(0, 0.1, s * (FRAME_LEN / 2 + 1.05));
      mat.castShadow = mat.receiveShadow = true;
      tramp.add(mat);
    }
    this.scene.add(tramp);

    // Mannequin
    this.buildFigure(c);
    this.scene.add(this.root);

    // Centre-of-mass trail
    this.trailPositions = new Float32Array(600 * 3);
    const tg = new THREE.BufferGeometry();
    tg.setAttribute("position", new THREE.BufferAttribute(this.trailPositions, 3));
    tg.setDrawRange(0, 0);
    this.trail = new THREE.Points(tg, new THREE.PointsMaterial({ color: c.trail, size: 0.045, transparent: true, opacity: 0.65 }));
    this.scene.add(this.trail);

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();
    this.setCamera("phone");
  }

  private buildFigure(c: typeof DEFAULT_COLORS) {
    // Proportions come from DIM in body.ts, so what is drawn is what the physics computes.
    const leotard = new THREE.MeshPhysicalMaterial({ color: c.suit, roughness: 0.38, metalness: 0.05, sheen: 1, sheenColor: new THREE.Color(c.suit).lerp(new THREE.Color("#ffffff"), 0.5), sheenRoughness: 0.35, clearcoat: 0.25, clearcoatRoughness: 0.4 });
    const skin = new THREE.MeshPhysicalMaterial({ color: c.skin, roughness: 0.55, sheen: 0.4, sheenColor: new THREE.Color("#ffd9c4"), sheenRoughness: 0.6 });
    const hair = new THREE.MeshStandardMaterial({ color: c.hair, roughness: 0.65 });
    const dark = new THREE.MeshStandardMaterial({ color: "#20160f", roughness: 0.3 });
    const shoe = new THREE.MeshStandardMaterial({ color: "#f4f1ea", roughness: 0.8 });
    const mesh = (g: THREE.BufferGeometry, m: THREE.Material) => {
      const x = new THREE.Mesh(g, m);
      x.castShadow = true;
      x.receiveShadow = true;
      return x;
    };
    /** Tapered limb hanging down from its joint: radii given at fractions of the length, with rounded ends. */
    const limb = (len: number, radii: [number, number][], m: THREE.Material, depth = 1) => {
      const pts: THREE.Vector2[] = [];
      const r0 = radii[0]![1];
      const r1 = radii[radii.length - 1]![1];
      for (let i = 0; i <= 5; i++) {
        const a = (i / 5) * (Math.PI / 2);
        pts.push(new THREE.Vector2(r1 * Math.sin(a), -len - r1 * 0.8 * Math.cos(a)));
      }
      for (let i = radii.length - 2; i >= 1; i--) pts.push(new THREE.Vector2(radii[i]![1], -radii[i]![0] * len));
      for (let i = 0; i <= 5; i++) {
        const a = ((5 - i) / 5) * (Math.PI / 2);
        pts.push(new THREE.Vector2(r0 * Math.sin(a), r0 * 0.8 * Math.cos(a)));
      }
      const g = new THREE.LatheGeometry(pts, 28);
      g.scale(1, 1, depth);
      return mesh(g, m);
    };
    const lathe = (profile: [number, number][], m: THREE.Material, depth: number) => {
      const g = new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), 36);
      g.scale(1, 1, depth);
      return mesh(g, m);
    };
    const joint = (name: string, parent: THREE.Object3D, x: number, y: number, z = 0) => {
      const g = new THREE.Group();
      g.position.set(x, y, z);
      parent.add(g);
      this.parts[name] = { joint: g };
      return g;
    };
    this.root.add(this.orient);

    // Pelvis (leotard) in the body frame.
    this.orient.add(
      lathe([[0, -0.165], [0.07, -0.16], [0.125, -0.12], [0.145, -0.05], [0.14, 0.0], [0.122, 0.05], [0, 0.07]], leotard, 0.72),
    );
    // Trunk: waist, rib cage and shoulders.
    const spine = joint("spine", this.orient, 0, DIM.spineY);
    spine.add(
      lathe([[0, -0.07], [0.12, -0.06], [0.112, 0.04], [0.118, 0.14], [0.135, 0.25], [0.148, 0.34], [0.152, 0.41], [0.14, 0.455], [0.1, 0.49], [0.05, 0.505], [0, 0.51]], leotard, 0.66),
    );
    // Neck and head.
    const neck = joint("neck", spine, 0, DIM.trunk);
    const neckMesh = mesh(new THREE.CylinderGeometry(0.043, 0.05, 0.1, 18), skin);
    neckMesh.position.y = 0.03;
    neck.add(neckMesh);
    const head = mesh(new THREE.SphereGeometry(0.1, 32, 24), skin);
    head.scale.set(0.86, 1.08, 1);
    head.position.set(0, 0.155, 0.01);
    neck.add(head);
    const jaw = mesh(new THREE.SphereGeometry(0.07, 24, 16), skin);
    jaw.scale.set(0.95, 0.8, 1);
    jaw.position.set(0, 0.105, 0.035);
    neck.add(jaw);
    const nose = mesh(new THREE.SphereGeometry(0.016, 12, 8), skin);
    nose.scale.set(0.8, 1.2, 1);
    nose.position.set(0, 0.145, 0.105);
    neck.add(nose);
    for (const sx of [1, -1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.011, 12, 8), dark);
      eye.position.set(sx * 0.032, 0.17, 0.088);
      neck.add(eye);
      const ear = mesh(new THREE.SphereGeometry(0.02, 12, 8), skin);
      ear.scale.set(0.5, 1, 0.8);
      ear.position.set(sx * 0.086, 0.15, -0.005);
      neck.add(ear);
    }
    const cap = mesh(new THREE.SphereGeometry(0.106, 32, 16, 0, Math.PI * 2, 0, Math.PI * 0.56), hair);
    cap.scale.set(0.9, 1.08, 1.04);
    cap.rotation.x = -0.45;
    cap.position.set(0, 0.162, -0.004);
    neck.add(cap);
    const bun = mesh(new THREE.SphereGeometry(0.042, 18, 14), hair);
    bun.position.set(0, 0.225, -0.085);
    neck.add(bun);

    for (const [side, sx] of [["L", 1], ["R", -1]] as const) {
      const sh = joint(`shoulder${side}`, spine, sx * DIM.shoulderX, DIM.trunk - DIM.shoulderDrop);
      const delt = mesh(new THREE.SphereGeometry(0.052, 18, 14), leotard);
      delt.scale.set(1, 0.95, 1);
      delt.position.y = -0.01;
      sh.add(delt);
      sh.add(limb(DIM.upperArm, [[0, 0.047], [0.3, 0.045], [0.75, 0.037], [1, 0.034]], skin));
      const el = joint(`elbow${side}`, sh, 0, -DIM.upperArm);
      el.add(limb(DIM.forearm, [[0, 0.035], [0.25, 0.038], [0.75, 0.029], [1, 0.024]], skin));
      const hand = limb(DIM.hand * 0.7, [[0, 0.024], [0.4, 0.03], [1, 0.022]], skin, 0.45);
      hand.rotation.y = Math.PI / 2; // flat side of the hand faces the body
      hand.position.y = -DIM.forearm - 0.01;
      el.add(hand);

      const hip = joint(`hip${side}`, this.orient, sx * DIM.hipX, DIM.hipY);
      hip.add(limb(DIM.thigh, [[0, 0.074], [0.2, 0.072], [0.6, 0.058], [1, 0.046]], skin));
      const knee = joint(`knee${side}`, hip, 0, -DIM.thigh);
      knee.add(limb(DIM.shank, [[0, 0.046], [0.22, 0.052], [0.55, 0.04], [0.9, 0.028], [1, 0.027]], skin));
      const ankle = joint(`ankle${side}`, knee, 0, -DIM.shank);
      const footLen = DIM.footFront - DIM.footBack;
      const foot = mesh(new THREE.CapsuleGeometry(0.034, footLen - 0.068, 6, 16), shoe);
      foot.rotation.x = Math.PI / 2;
      foot.scale.set(1.2, 1, 0.75);
      foot.position.set(0, -DIM.footDrop + 0.01, (DIM.footFront + DIM.footBack) / 2);
      ankle.add(foot);
      const heel = mesh(new THREE.SphereGeometry(0.033, 14, 10), shoe);
      heel.position.set(0, -0.035, -0.015);
      ankle.add(heel);
    }
  }

  private applyFrame(f: Frame) {
    const j = f.joints;
    const p = this.parts;
    // Orientation: somersault about the lateral (x) axis, twist about the body's long axis.
    const qs = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), f.somersault);
    const qt = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), f.twist);
    this.orient.quaternion.copy(qs.multiply(qt));
    this.root.position.set(f.pelvis[0], BED_Y + f.pelvis[1], f.pelvis[2]);
    this.com.set(f.com[0], BED_Y + f.com[1], f.com[2]);
    p.spine!.joint.rotation.set(j.spine, 0, 0);
    p.neck!.joint.rotation.set(j.neck, 0, 0);
    for (const [side, sx] of [["L", 1], ["R", -1]] as const) {
      p[`shoulder${side}`]!.joint.rotation.set(-j.shoulderFlex, 0, sx * j.shoulderAbd);
      p[`elbow${side}`]!.joint.rotation.set(-j.elbow, 0, 0);
      p[`hip${side}`]!.joint.rotation.set(-j.hipFlex, 0, sx * j.hipAbd);
      p[`knee${side}`]!.joint.rotation.set(j.knee, 0, 0);
      p[`ankle${side}`]!.joint.rotation.set(j.ankle, 0, 0);
    }
    // Bed: the simulated centre depression spread over the bed (a fundamental-mode shape).
    const pos = this.bedGeom.attributes.position!;
    const arr = pos.array as Float32Array;
    for (let i = 0; i < pos.count; i++) {
      const x = this.bedBase[i * 3]!;
      const z = this.bedBase[i * 3 + 2]!;
      const fx = Math.cos((Math.PI * x) / BED_WID);
      const fz = Math.cos((Math.PI * z) / BED_LEN);
      const r = Math.hypot(x / 0.35, z / 0.45);
      const local = f.bedDepth > 0 ? Math.exp(-r * r * 0.5) : 0;
      const shape = Math.max(0, fx) ** 1.2 * Math.max(0, fz) ** 1.2;
      arr[i * 3 + 1] = -f.bedDepth * (0.75 * shape + 0.25 * local * shape);
    }
    pos.needsUpdate = true;
    this.bedGeom.computeVertexNormals();
  }

  private pushTrail() {
    if (!this.showTrail) return;
    const i = this.trailCount % 600;
    this.trailPositions[i * 3] = this.com.x;
    this.trailPositions[i * 3 + 1] = this.com.y;
    this.trailPositions[i * 3 + 2] = this.com.z;
    this.trailCount++;
    const geom = this.trail.geometry;
    geom.setDrawRange(0, Math.min(this.trailCount, 600));
    geom.attributes.position!.needsUpdate = true;
  }

  load(timeline: Timeline, label?: string) {
    this.timeline = timeline;
    this.canvas.setAttribute("aria-label", label ?? `3D animation: ${timeline.spec.name}`);
    this.clearTrail();
    this.seek(0);
  }

  clearTrail() {
    this.trailCount = 0;
    this.trail.geometry.setDrawRange(0, 0);
  }

  setTrail(on: boolean) {
    this.showTrail = on;
    this.trail.visible = on;
  }

  setSpeed(s: number) {
    this.speed = s;
  }

  get duration() {
    return this.timeline?.duration ?? 0;
  }

  get isPlaying() {
    return this.playing;
  }

  seek(t: number, snapCamera = !this.playing) {
    if (!this.timeline) return;
    this.time = Math.max(0, Math.min(this.timeline.duration, t));
    const f = this.timeline.sample(this.time);
    this.applyFrame(f);
    this.updateCamera(snapCamera);
    this.render();
    this.opts.onTime?.(this.time, f);
  }

  play() {
    if (!this.timeline || this.playing) return;
    if (this.time >= this.timeline.duration - 1e-3) {
      this.time = 0;
      this.clearTrail();
    }
    this.playing = true;
    this.last = performance.now();
    const tick = (now: number) => {
      if (!this.playing || !this.timeline) return;
      const dt = Math.min(0.05, (now - this.last) / 1000);
      this.last = now;
      this.time += dt * this.speed;
      if (this.time >= this.timeline.duration) {
        this.time = this.timeline.duration;
        this.seek(this.time);
        this.playing = false;
        this.opts.onEnd?.();
        return;
      }
      this.seek(this.time);
      this.pushTrail();
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  pause() {
    this.playing = false;
    cancelAnimationFrame(this.raf);
  }

  setCamera(preset: CameraPreset) {
    this.preset = preset;
    this.updateCamera(true);
    this.render();
  }

  private camY = BED_Y + 1.6;
  private camDist = 7.2;

  private updateCamera(snap = false) {
    // The follow camera keeps the bed and the athlete in frame: it aims between them and
    // backs off as the athlete rises, so the height of the bounce stays visible.
    const bodyY = this.com.y;
    const rise = Math.max(0, bodyY - (BED_Y + 1.2));
    const desired = BED_Y + 1.2 + rise * 0.55;
    const desiredDist = 7.2 + rise * 0.75;
    this.camY = snap ? desired : this.camY + (desired - this.camY) * 0.18;
    this.camDist = snap ? desiredDist : this.camDist + (desiredDist - this.camDist) * 0.18;
    const y = this.camY;
    const d = this.camDist;
    let fov = 38;
    if (this.preset === "phone") {
      // Zoomed so about 6 m of height is in view at the athlete's distance, like a phone held at 2–3×.
      const dist = this.camera.position.distanceTo(this.aim);
      fov = (2 * Math.atan(3.1 / Math.max(dist, 1)) * 180) / Math.PI;
      if (!snap) fov = this.camera.fov + (fov - this.camera.fov) * 0.2;
    }
    if (Math.abs(this.camera.fov - fov) > 1e-3) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
    if (this.preset === "phone") {
      // A spectator filming with a phone beside the trampoline: fixed spot at eye height,
      // panning after the athlete with a little lag and a slight hand-held sway.
      const target = new THREE.Vector3(this.com.x, Math.max(BED_Y + 0.6, this.com.y - 0.1), this.com.z);
      if (snap) this.aim.copy(target);
      else this.aim.lerp(target, 0.22);
      const t = this.time;
      const sway = this.steady ? 0 : 1;
      this.camera.position.set(9.2 + sway * 0.012 * Math.sin(t * 1.7), 1.6 + sway * 0.01 * Math.sin(t * 2.3 + 1), 4.8 + sway * 0.012 * Math.sin(t * 1.1 + 2));
      this.camera.lookAt(this.aim.x + sway * 0.03 * Math.sin(t * 2.9), this.aim.y + sway * 0.025 * Math.sin(t * 3.7 + 0.5), this.aim.z);
    } else if (this.preset === "side") {
      this.camera.position.set(d, y + 0.35, 0.3);
      this.camera.lookAt(0, y, 0);
    } else if (this.preset === "front") {
      this.camera.position.set(0.3, y + 0.5, d + 0.8);
      this.camera.lookAt(0, y, 0);
    } else if (this.preset === "three-quarter") {
      this.camera.position.set(d * 0.78, y + 1.6, d * 0.78);
      this.camera.lookAt(0, y - 0.2, 0);
    } else {
      this.camera.position.set(14, BED_Y + 3, 0.3);
      this.camera.lookAt(0, BED_Y + 2.6, 0);
    }
  }

  private resize() {
    const w = Math.max(1, this.container.clientWidth);
    const h = Math.max(1, this.container.clientHeight);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.render();
  }

  private render() {
    this.renderer.render(this.scene, this.camera);
  }

  /** Records one full playback of the loaded timeline as WebM. Resolves with the file. */
  async record(speed = 1): Promise<Blob> {
    if (!this.timeline) throw new Error("Nothing loaded");
    if (typeof MediaRecorder === "undefined" || !this.canvas.captureStream) throw new Error("This browser can't record video from the animation.");
    const mime = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"].find((m) => MediaRecorder.isTypeSupported(m));
    if (!mime) throw new Error("This browser can't record WebM video.");
    const stream = this.canvas.captureStream(60);
    const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 6_000_000 });
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    const done = new Promise<Blob>((resolve) => (rec.onstop = () => resolve(new Blob(chunks, { type: "video/webm" }))));
    this.pause();
    this.clearTrail();
    this.seek(0);
    const prevSpeed = this.speed;
    const prevEnd = this.opts.onEnd;
    this.speed = speed;
    rec.start();
    await new Promise<void>((resolve) => {
      this.opts.onEnd = () => {
        setTimeout(resolve, 300);
      };
      this.play();
    });
    this.opts.onEnd = prevEnd;
    this.speed = prevSpeed;
    rec.stop();
    stream.getTracks().forEach((t) => t.stop());
    return done;
  }

  dispose() {
    this.pause();
    this.resizeObserver.disconnect();
    this.renderer.dispose();
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose?.();
      const mat = m.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
      else mat?.dispose?.();
    });
    this.canvas.remove();
  }
}
