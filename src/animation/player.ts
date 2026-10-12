import * as THREE from "three";
import type { Frame, Timeline } from "./motion";

/**
 * Three.js renderer for skill timelines: an articulated mannequin on a competition-size
 * trampoline. Framework-agnostic so the Next.js app and the static demo share it.
 */

export type CameraPreset = "side" | "wide" | "front" | "three-quarter";

export type PlayerOptions = {
  onTime?: (t: number, frame: Frame) => void;
  onEnd?: () => void;
  colors?: { suit: string; limb: string; skin: string; frame: string; pad: string; bed: string; floor: string; trail: string };
};

const DEFAULT_COLORS = { suit: "#2346d9", limb: "#3a5ce8", skin: "#e9d8c8", frame: "#1d3a8a", pad: "#e8590c", bed: "#16181d", floor: "#d9d6cc", trail: "#e8590c" };

// FIG trampoline bed: roughly 4.3 m × 2.1 m inside a 5.05 m × 2.91 m frame, 1.155 m high.
const BED_LEN = 4.3;
const BED_WID = 2.1;
const FRAME_LEN = 5.05;
const FRAME_WID = 2.91;
const BED_Y = 1.155;

type Limb = { joint: THREE.Group };

export class SkillPlayer {
  readonly canvas: HTMLCanvasElement;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(38, 16 / 9, 0.1, 100);
  private root = new THREE.Group(); // pelvis, positioned at CoM height
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
  private preset: CameraPreset = "side";
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

    this.scene.background = new THREE.Color(c.floor).lerp(new THREE.Color("#ffffff"), 0.55);
    this.scene.fog = new THREE.Fog(this.scene.background, 18, 40);

    // Lights
    this.scene.add(new THREE.HemisphereLight("#ffffff", "#8a8578", 1.6));
    const sun = new THREE.DirectionalLight("#ffffff", 2.2);
    sun.position.set(6, 12, 5);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -6;
    sun.shadow.camera.right = 6;
    sun.shadow.camera.top = 8;
    sun.shadow.camera.bottom = -4;
    this.scene.add(sun);

    // Floor
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.MeshStandardMaterial({ color: c.floor, roughness: 1 }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.scene.add(floor);
    const grid = new THREE.GridHelper(40, 40, "#bdb8aa", "#cfcabd");
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = 0.5;
    grid.position.y = 0.002;
    this.scene.add(grid);

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
    const bed = new THREE.Mesh(this.bedGeom, new THREE.MeshStandardMaterial({ color: c.bed, roughness: 0.95, side: THREE.DoubleSide }));
    bed.position.y = BED_Y;
    bed.receiveShadow = true;
    tramp.add(bed);
    // Centre cross (target zone marking)
    const markMat = new THREE.MeshBasicMaterial({ color: "#c63b1f" });
    const m1 = new THREE.Mesh(new THREE.PlaneGeometry(0.03, 0.6), markMat);
    const m2 = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.03), markMat);
    for (const m of [m1, m2]) {
      m.rotation.x = -Math.PI / 2;
      m.position.y = BED_Y + 0.004;
      tramp.add(m);
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
    this.setCamera("side");
  }

  private buildFigure(c: typeof DEFAULT_COLORS) {
    const suit = new THREE.MeshStandardMaterial({ color: c.suit, roughness: 0.55 });
    const limb = new THREE.MeshStandardMaterial({ color: c.limb, roughness: 0.6 });
    const skin = new THREE.MeshStandardMaterial({ color: c.skin, roughness: 0.7 });
    const capsule = (r: number, len: number, mat: THREE.Material, down = true) => {
      const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 6, 12), mat);
      m.position.y = down ? -len / 2 - r * 0.2 : len / 2 + r * 0.2;
      m.castShadow = true;
      return m;
    };
    const joint = (name: string, parent: THREE.Object3D, x: number, y: number, z = 0) => {
      const g = new THREE.Group();
      g.position.set(x, y, z);
      parent.add(g);
      this.parts[name] = { joint: g };
      return g;
    };
    this.root.add(this.orient);
    const pelvis = new THREE.Mesh(new THREE.SphereGeometry(0.15, 16, 12), suit);
    pelvis.scale.set(1.15, 0.8, 0.8);
    pelvis.castShadow = true;
    this.orient.add(pelvis);
    const spine = joint("spine", this.orient, 0, 0.05);
    spine.add(capsule(0.14, 0.38, suit, false));
    const neck = joint("neck", spine, 0, 0.6);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.11, 20, 16), skin);
    head.position.y = 0.12;
    head.castShadow = true;
    neck.add(head);
    // A small "nose" marker so facing direction is readable.
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.06, 8), skin);
    nose.rotation.x = Math.PI / 2;
    nose.position.set(0, 0.12, 0.11);
    neck.add(nose);
    for (const [side, sx] of [["L", 1], ["R", -1]] as const) {
      const sh = joint(`shoulder${side}`, spine, sx * 0.2, 0.52);
      sh.add(capsule(0.05, 0.24, limb));
      const el = joint(`elbow${side}`, sh, 0, -0.33);
      el.add(capsule(0.045, 0.22, skin));
      const hip = joint(`hip${side}`, this.orient, sx * 0.1, -0.05);
      hip.add(capsule(0.075, 0.36, limb));
      const knee = joint(`knee${side}`, hip, 0, -0.45);
      knee.add(capsule(0.06, 0.36, limb));
      const foot = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.05, 0.2), skin);
      foot.position.set(0, -0.47, 0.05);
      foot.castShadow = true;
      knee.add(foot);
    }
  }

  private applyFrame(f: Frame) {
    const j = f.joints;
    const p = this.parts;
    // Orientation: somersault about the lateral (x) axis, twist about the body's long axis.
    const qs = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), f.somersault);
    const qt = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), f.twist);
    this.orient.quaternion.copy(qs.multiply(qt));
    this.root.position.set(0, BED_Y + f.height, 0);
    p.spine!.joint.rotation.set(j.spine, 0, 0);
    p.neck!.joint.rotation.set(j.neck, 0, 0);
    for (const [side, sx] of [["L", 1], ["R", -1]] as const) {
      p[`shoulder${side}`]!.joint.rotation.set(-j.shoulderFlex, 0, sx * j.shoulderAbd);
      p[`elbow${side}`]!.joint.rotation.set(-j.elbow, 0, 0);
      p[`hip${side}`]!.joint.rotation.set(-j.hipFlex, 0, sx * j.hipAbd);
      p[`knee${side}`]!.joint.rotation.set(j.knee, 0, 0);
    }
    // Bed: smooth depression under the athlete.
    const pos = this.bedGeom.attributes.position!;
    const arr = pos.array as Float32Array;
    for (let i = 0; i < pos.count; i++) {
      const x = this.bedBase[i * 3]!;
      const z = this.bedBase[i * 3 + 2]!;
      const fx = Math.cos((Math.PI * x) / BED_WID);
      const fz = Math.cos((Math.PI * z) / BED_LEN);
      arr[i * 3 + 1] = -f.bedDepth * Math.max(0, fx) ** 1.2 * Math.max(0, fz) ** 1.2;
    }
    pos.needsUpdate = true;
    this.bedGeom.computeVertexNormals();
  }

  private pushTrail() {
    if (!this.showTrail) return;
    const i = this.trailCount % 600;
    this.trailPositions[i * 3] = this.root.position.x;
    this.trailPositions[i * 3 + 1] = this.root.position.y;
    this.trailPositions[i * 3 + 2] = this.root.position.z;
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

  private updateCamera(snap = false) {
    // Tracking presets follow the athlete's height smoothly, so the body stays large in frame.
    const bodyY = this.root.position.y;
    const desired = Math.max(BED_Y + 1.2, bodyY + 0.1);
    this.camY = snap ? desired : this.camY + (desired - this.camY) * 0.18;
    const y = this.camY;
    if (this.preset === "side") {
      this.camera.position.set(7.2, y + 0.35, 0.3);
      this.camera.lookAt(0, y, 0);
    } else if (this.preset === "front") {
      this.camera.position.set(0.3, y + 0.5, 8);
      this.camera.lookAt(0, y, 0);
    } else if (this.preset === "three-quarter") {
      this.camera.position.set(5.6, y + 1.6, 5.6);
      this.camera.lookAt(0, y - 0.2, 0);
    } else {
      this.camera.position.set(11.5, BED_Y + 2.4, 0.3);
      this.camera.lookAt(0, BED_Y + 2.1, 0);
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
