import { expect, test } from "@playwright/test";

test.use({ launchOptions: { args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] } });

test("entry page shows a 3D animation with its phases", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await page.goto("/tricks/full-in-full-out");
  await expect(page.locator(".anim-viewport canvas")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("button", { name: /First somersault · full twist/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Second somersault · full twist/ })).toBeVisible();
  await expect(page.getByText("It shows what the skill is, not how to learn it")).toBeVisible();
  // Jumping to a phase updates the caption.
  await page.getByRole("button", { name: /Second somersault · full twist/ }).click();
  await expect(page.locator(".anim-caption")).toContainText("Second somersault");
  // The canvas actually renders something (not a blank frame).
  const varied = await page.locator(".anim-viewport canvas").evaluate((c: HTMLCanvasElement) => {
    const d = c.getContext("webgl2") ?? c.getContext("webgl");
    const px = new Uint8Array(4 * 64);
    d!.readPixels(0, Math.floor(c.height / 2), 64, 1, d!.RGBA, d!.UNSIGNED_BYTE, px);
    return new Set(Array.from(px)).size;
  });
  expect(varied).toBeGreaterThan(1);
  expect(errors.filter((e) => !/favicon/.test(e))).toEqual([]);
});

test("entries without a motion model have no animation", async ({ page }) => {
  await page.goto("/tricks/trampoline-scoring");
  await expect(page.getByRole("heading", { level: 1, name: "Trampoline scoring" })).toBeVisible();
  await expect(page.locator(".anim-viewport")).toHaveCount(0);
});

test("studio animates FIG notation and combinations, and records video", async ({ page }) => {
  await page.goto("/animate");
  await expect(page.locator(".anim-viewport canvas")).toBeVisible({ timeout: 15_000 });
  await page.getByRole("tab", { name: "FIG notation" }).click();
  await page.getByLabel("Notation").fill("824/");
  await page.getByRole("button", { name: "Animate" }).click();
  await expect(page.getByRole("button", { name: /Second somersault · 2 full twists/ })).toBeVisible();
  await page.getByLabel("Notation").fill("82/");
  await page.getByRole("button", { name: "Animate" }).click();
  await expect(page.getByText(/give 2 twist digits/)).toBeVisible();

  await page.getByRole("tab", { name: "Combination" }).click();
  await page.getByRole("button", { name: "Back landing · ball out" }).click();
  await expect(page.getByRole("button", { name: /Ball out: 1¼ forward somersault/ })).toBeVisible();
  // Only skills that start where the combination currently lands are offered.
  const offered = await page.getByLabel("Add", { exact: true }).locator("option").allTextContents();
  expect(offered).toContain("Barani");
  expect(offered).not.toContain("Cody");

  await page.getByRole("tab", { name: "Skill" }).click();
  await page.getByLabel("Skill", { exact: true }).selectOption({ label: "Tuck jump" });
  await page.getByRole("button", { name: "Save video" }).click();
  const link = page.getByRole("link", { name: /download tuck-jump\.webm/ });
  await expect(link).toBeVisible({ timeout: 20_000 });
  expect(await link.getAttribute("href")).toMatch(/^blob:/);
});
