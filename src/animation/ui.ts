import { ALL_SPECS, COMBOS, SKILL_SPECS } from "./catalog";
import { buildSequence, buildTimeline, parseFig, type SkillSpec, type Timeline } from "./motion";
import { SkillPlayer, type CameraPreset } from "./player";

/**
 * DOM controls around SkillPlayer. Plain DOM so both the Next.js app and the static
 * GitHub Pages demo mount the same component. Styles: `.anim-*` classes in each app.
 */

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export const DISCLAIMER =
  "Schematic animation computed from the skill's rotation, twists and body shape. It shows what the skill is, not how to learn it: somersaults and twists must be learned with a qualified coach, proper matting and spotting.";

export const PHYSICS_NOTE =
  "Model: a 55 kg, 1.65 m athlete built from 14 body segments (de Leva 1996 mass fractions). In the air the centre of mass follows a parabola under g = 9.81 m/s² and angular momentum is conserved, so the rotation speeds up when the body is compact and slows when it opens. The bed is a spring that sinks under the athlete and returns the energy. The body shape over time is prescribed, and air resistance, twist–somersault coupling and travel across the bed are not modelled. Flight times are typical values, not measurements.";

export type Animator = { setTimeline(tl: Timeline, note?: string): void; destroy(): void };

export function mountAnimator(host: HTMLElement, tl: Timeline, note?: string): Animator {
  const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  host.classList.add("anim");
  host.innerHTML = `
    <div class="anim-stage"><div class="anim-viewport"></div><div class="anim-caption" aria-live="polite"></div></div>
    <div class="anim-controls">
      <button type="button" class="anim-btn anim-play" aria-label="Play">▶</button>
      <div class="anim-scrub"><input type="range" min="0" max="1000" value="0" aria-label="Position in the animation" /><div class="anim-marks" aria-hidden="true"></div></div>
      <span class="anim-time">0.0 s</span>
    </div>
    <div class="anim-options">
      <label>Speed <select class="anim-speed"><option value="0.25">¼×</option><option value="0.5">½×</option><option value="1" selected>1×</option></select></label>
      <label>Camera <select class="anim-cam"><option value="side">Side (follow)</option><option value="wide">Side (whole bed)</option><option value="front">Front</option><option value="three-quarter">¾ view</option></select></label>
      <label class="anim-check"><input type="checkbox" class="anim-trail" checked /> Path</label>
      <button type="button" class="anim-btn anim-rec">Save video</button>
      <span class="anim-rec-status" role="status"></span>
    </div>
    <ol class="anim-phases"></ol>
    <details class="anim-physics"><summary>Physics in this animation</summary><div class="anim-physics-body"></div></details>
    <p class="anim-note"></p>
    <p class="anim-disclaimer">${esc(DISCLAIMER)}</p>`;
  const $ = <T extends HTMLElement>(sel: string) => host.querySelector(sel) as T;
  const playBtn = $<HTMLButtonElement>(".anim-play");
  const range = $<HTMLInputElement>(".anim-scrub input");
  const timeEl = $<HTMLSpanElement>(".anim-time");
  const caption = $<HTMLDivElement>(".anim-caption");
  const phasesEl = $<HTMLOListElement>(".anim-phases");
  const marks = $<HTMLDivElement>(".anim-marks");
  const recBtn = $<HTMLButtonElement>(".anim-rec");
  const recStatus = $<HTMLSpanElement>(".anim-rec-status");
  let current = tl;
  let lastPhase = -1;
  let scrubbing = false;
  let downloadUrl: string | null = null;

  const player = new SkillPlayer($(".anim-viewport"), {
    onTime: (t, f) => {
      if (!scrubbing) range.value = String(Math.round((t / current.duration) * 1000));
      timeEl.textContent = `${t.toFixed(1)} s`;
      if (f.phase !== lastPhase) {
        lastPhase = f.phase;
        const ph = current.phases[f.phase];
        caption.innerHTML = ph ? `<b>${esc(ph.title)}</b> ${esc(ph.detail)}` : "";
        phasesEl.querySelectorAll("li").forEach((li, i) => li.toggleAttribute("aria-current", i === f.phase));
      }
    },
    onEnd: () => setPlaying(false),
  });

  function setPlaying(on: boolean) {
    playBtn.textContent = on ? "❚❚" : "▶";
    playBtn.setAttribute("aria-label", on ? "Pause" : "Play");
  }

  function renderPhases() {
    phasesEl.innerHTML = current.phases
      .map((p, i) => `<li><button type="button" data-i="${i}"><span class="anim-ph-t">${p.start.toFixed(1)} s</span><b>${esc(p.title)}</b><span>${esc(p.detail)}</span></button></li>`)
      .join("");
    marks.innerHTML = current.phases.map((p) => `<span style="left:${(p.start / current.duration) * 100}%"></span>`).join("");
  }

  function renderPhysics() {
    const rows = current.physics
      .map(
        (p) => `<tr><th scope="row">${esc(p.skill)}</th><td>${p.flightTime.toFixed(2)} s</td><td>${p.takeoffSpeed.toFixed(1)} m/s</td><td>${p.apexHeight.toFixed(1)} m</td><td>${Math.round(p.bedDepth * 100)} cm</td><td>${p.angularMomentum ? p.angularMomentum.toFixed(0) : "–"}</td><td>${p.peakSomersaultRate ? p.peakSomersaultRate.toFixed(2) : "–"}</td><td>${p.peakTwistRate ? p.peakTwistRate.toFixed(2) : "–"}</td></tr>`,
      )
      .join("");
    $<HTMLDivElement>(".anim-physics-body").innerHTML = `
      <div class="anim-physics-scroll"><table>
        <thead><tr><th scope="col">Skill</th><th scope="col">Flight time</th><th scope="col">Take-off speed</th><th scope="col">Highest CoM</th><th scope="col">Bed depression</th><th scope="col">Angular momentum (kg·m²/s)</th><th scope="col">Peak somersault (rev/s)</th><th scope="col">Peak twist (rev/s)</th></tr></thead>
        <tbody>${rows}</tbody>
      </table></div>
      <p>${esc(PHYSICS_NOTE)}</p>`;
  }

  function setTimeline(next: Timeline, nextNote?: string) {
    player.pause();
    setPlaying(false);
    current = next;
    lastPhase = -1;
    renderPhases();
    renderPhysics();
    $<HTMLParagraphElement>(".anim-note").textContent = nextNote ?? next.spec.note ?? "";
    player.load(next, `3D animation of ${next.spec.name}`);
    if (!reduceMotion) {
      player.play();
      setPlaying(true);
    }
  }

  playBtn.onclick = () => {
    if (player.isPlaying) {
      player.pause();
      setPlaying(false);
    } else {
      player.play();
      setPlaying(true);
    }
  };
  range.oninput = () => {
    scrubbing = true;
    player.pause();
    setPlaying(false);
    player.seek((Number(range.value) / 1000) * current.duration);
  };
  range.onchange = () => (scrubbing = false);
  $<HTMLSelectElement>(".anim-speed").onchange = (e) => player.setSpeed(Number((e.target as HTMLSelectElement).value));
  $<HTMLSelectElement>(".anim-cam").onchange = (e) => player.setCamera((e.target as HTMLSelectElement).value as CameraPreset);
  $<HTMLInputElement>(".anim-trail").onchange = (e) => player.setTrail((e.target as HTMLInputElement).checked);
  phasesEl.onclick = (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>("button[data-i]");
    if (!b) return;
    player.pause();
    setPlaying(false);
    player.seek(current.phases[Number(b.dataset.i)]!.start + 0.01);
  };
  recBtn.onclick = async () => {
    recBtn.disabled = true;
    recStatus.textContent = "Recording one play-through…";
    try {
      const speed = Number($<HTMLSelectElement>(".anim-speed").value);
      const blob = await player.record(speed);
      if (downloadUrl) URL.revokeObjectURL(downloadUrl);
      downloadUrl = URL.createObjectURL(blob);
      const name = `${current.spec.id.replace(/[^a-z0-9+-]+/gi, "-")}${speed !== 1 ? `-${speed}x` : ""}.webm`;
      recStatus.innerHTML = `Ready: <a href="${downloadUrl}" download="${esc(name)}">download ${esc(name)}</a> (${(blob.size / 1024 / 1024).toFixed(1)} MB)`;
    } catch (err) {
      recStatus.textContent = err instanceof Error ? err.message : "Recording failed.";
    } finally {
      recBtn.disabled = false;
      setPlaying(false);
    }
  };

  setTimeline(tl, note);
  return {
    setTimeline,
    destroy() {
      player.dispose();
      if (downloadUrl) URL.revokeObjectURL(downloadUrl);
      host.innerHTML = "";
    },
  };
}

/** Animation for one Trick Book entry. Returns null when the entry has no motion spec. */
export function mountEntryAnimation(host: HTMLElement, slug: string): Animator | null {
  const spec = SKILL_SPECS[slug];
  if (!spec) return null;
  return mountAnimator(host, buildTimeline(spec));
}

/**
 * Full animation studio: pick a Trick Book skill, type FIG notation (e.g. 822< for a
 * fliffis with a full twist in each somersault), or chain skills into a combination.
 */
export function mountStudio(host: HTMLElement, opts: { linkFor?: (slug: string) => string } = {}): Animator {
  const skills = Object.entries(SKILL_SPECS);
  const combo: string[] = [];
  host.innerHTML = `
    <div class="anim-studio">
      <div class="anim-tabs" role="tablist" aria-label="What to animate">
        <button role="tab" type="button" data-tab="skill" aria-selected="true">Skill</button>
        <button role="tab" type="button" data-tab="fig" aria-selected="false">FIG notation</button>
        <button role="tab" type="button" data-tab="combo" aria-selected="false">Combination</button>
      </div>
      <div class="anim-panel" data-panel="skill">
        <label for="anim-skill">Skill</label>
        <select id="anim-skill">${skills.map(([slug, s]) => `<option value="${slug}">${esc(s.name)}</option>`).join("")}</select>
        <span class="anim-link"></span>
      </div>
      <div class="anim-panel" data-panel="fig" hidden>
        <form class="anim-fig">
          <label for="anim-fig-input">Notation</label>
          <input id="anim-fig-input" value="822o" autocomplete="off" spellcheck="false" />
          <label for="anim-fig-dir">Direction</label>
          <select id="anim-fig-dir"><option value="-1">Backward</option><option value="1">Forward</option></select>
          <button type="submit" class="anim-btn">Animate</button>
        </form>
        <p class="anim-help">Quarter rotations, then half twists per somersault, then <code>/</code> straight, <code>&lt;</code> pike or <code>o</code> tuck. Examples:
          ${["41/", "43/", "800o", "801o", "822o", "824/", "811<"].map((n) => `<button type="button" class="anim-chip" data-fig="${n}">${n}</button>`).join(" ")}</p>
        <p class="anim-error" role="alert"></p>
      </div>
      <div class="anim-panel" data-panel="combo" hidden>
        <p class="anim-help">Each skill must start where the previous one landed. Ready-made:
          ${COMBOS.map((c) => `<button type="button" class="anim-chip" data-combo="${c.id}">${esc(c.name)}</button>`).join(" ")}</p>
        <div class="anim-combo-row">
          <ol class="anim-combo-list"></ol>
          <label for="anim-add">Add</label><select id="anim-add"></select>
          <button type="button" class="anim-btn anim-add-btn">Add</button>
          <button type="button" class="anim-btn anim-clear">Clear</button>
        </div>
        <p class="anim-error" role="alert"></p>
      </div>
      <div class="anim-host"></div>
    </div>`;
  const q = <T extends HTMLElement>(s: string) => host.querySelector(s) as T;
  const animator = mountAnimator(q(".anim-host"), buildTimeline(SKILL_SPECS["full-in-full-out"] ?? skills[0]![1]));
  const skillSel = q<HTMLSelectElement>("#anim-skill");
  skillSel.value = "full-in-full-out";
  const linkEl = q<HTMLSpanElement>(".anim-link");

  const showSkill = () => {
    const spec = SKILL_SPECS[skillSel.value];
    if (!spec) return;
    animator.setTimeline(buildTimeline(spec));
    linkEl.innerHTML = opts.linkFor ? `<a href="${opts.linkFor(skillSel.value)}">Read the sources for ${esc(spec.name)} →</a>` : "";
  };
  skillSel.onchange = showSkill;
  showSkill();

  // Tabs
  host.querySelectorAll<HTMLButtonElement>("[data-tab]").forEach((tab) => {
    tab.onclick = () => {
      host.querySelectorAll<HTMLButtonElement>("[data-tab]").forEach((t) => t.setAttribute("aria-selected", String(t === tab)));
      host.querySelectorAll<HTMLElement>("[data-panel]").forEach((p) => (p.hidden = p.dataset.panel !== tab.dataset.tab));
      if (tab.dataset.tab === "skill") showSkill();
      if (tab.dataset.tab === "fig") showFig();
      if (tab.dataset.tab === "combo") showCombo();
    };
  });

  // FIG notation
  const figInput = q<HTMLInputElement>("#anim-fig-input");
  const figDir = q<HTMLSelectElement>("#anim-fig-dir");
  const figErr = q<HTMLParagraphElement>('[data-panel="fig"] .anim-error');
  const showFig = () => {
    const spec = parseFig(figInput.value, Number(figDir.value) as 1 | -1);
    if ("error" in spec) {
      figErr.textContent = spec.error;
      return;
    }
    figErr.textContent = "";
    const shapeNote = spec.twists.some((t) => t > 0) ? "Twists are shown with the body opened from the shape, which is how twisting doubles are commonly drawn." : "";
    animator.setTimeline(buildTimeline(spec), `Notation ${figInput.value.trim()}: ${spec.quarters} quarter rotations, half twists per somersault ${spec.twists.join("-")}, ${spec.shape}. ${shapeNote}`);
  };
  q<HTMLFormElement>(".anim-fig").onsubmit = (e) => {
    e.preventDefault();
    showFig();
  };
  host.querySelectorAll<HTMLButtonElement>("[data-fig]").forEach((b) => {
    b.onclick = () => {
      figInput.value = b.dataset.fig!;
      showFig();
    };
  });

  // Combination builder
  const comboList = q<HTMLOListElement>(".anim-combo-list");
  const addSel = q<HTMLSelectElement>("#anim-add");
  const comboErr = q<HTMLParagraphElement>('[data-panel="combo"] .anim-error');
  const refreshAdd = () => {
    const from = combo.length ? ALL_SPECS[combo[combo.length - 1]!]!.end : "feet";
    const options = Object.entries(ALL_SPECS).filter(([, s]) => s.start === from);
    addSel.innerHTML = options.map(([id, s]) => `<option value="${id}">${esc(s.name)}</option>`).join("");
    comboList.innerHTML = combo.length
      ? combo.map((id, i) => `<li>${esc(ALL_SPECS[id]!.name)} <button type="button" class="anim-x" data-rm="${i}" aria-label="Remove ${esc(ALL_SPECS[id]!.name)}">✕</button></li>`).join("")
      : `<li class="anim-empty">Start from the feet: add a first skill.</li>`;
  };
  const showCombo = () => {
    refreshAdd();
    if (!combo.length) return;
    const tl = buildSequence(combo.map((id) => ALL_SPECS[id]!) as SkillSpec[]);
    if ("error" in tl) {
      comboErr.textContent = tl.error;
      return;
    }
    comboErr.textContent = "";
    animator.setTimeline(tl, "Combination: each skill starts from the landing of the previous one.");
  };
  q<HTMLButtonElement>(".anim-add-btn").onclick = () => {
    if (!addSel.value || combo.length >= 10) return;
    combo.push(addSel.value);
    showCombo();
  };
  q<HTMLButtonElement>(".anim-clear").onclick = () => {
    combo.length = 0;
    showCombo();
  };
  comboList.onclick = (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-rm]");
    if (!b) return;
    combo.splice(Number(b.dataset.rm)); // removing a skill also removes the ones that depended on its landing
    showCombo();
  };
  host.querySelectorAll<HTMLButtonElement>("[data-combo]").forEach((b) => {
    b.onclick = () => {
      combo.length = 0;
      combo.push(...COMBOS.find((c) => c.id === b.dataset.combo)!.skills);
      showCombo();
    };
  });
  refreshAdd();
  return animator;
}
