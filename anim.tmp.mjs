import { chromium } from "@playwright/test";
const B = "http://localhost:8088/Trampolin/";
const b = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
await p.emulateMedia({ reducedMotion: "reduce" });
for (const [slug, fr] of [["back-somersault-x", null], ["barani", [0.2, 0.32, 0.42, 0.52, 0.62, 0.75]], ["half-out", [0.18, 0.28, 0.38, 0.48, 0.6, 0.72]], ["ball-out", [0.05, 0.2, 0.35, 0.5, 0.62, 0.8]], ["pike-jump", [0.1, 0.3, 0.45, 0.55, 0.7, 0.9]]]) {
  if (!fr) continue;
  await p.goto(B + "#/tricks/" + slug);
  await p.locator(".anim-viewport canvas").waitFor({ timeout: 15000 });
  for (const f of fr) {
    await p.locator(".anim-scrub input").evaluate((el, v) => { el.value = String(v); el.dispatchEvent(new Event("input", { bubbles: true })); }, Math.round(f * 1000));
    await p.waitForTimeout(120);
    await p.locator(".anim-stage").screenshot({ path: `/tmp/claude-0/pages/a-${slug}-${Math.round(f * 100)}.png` });
  }
}
await b.close();
