import { expect, test } from "@playwright/test";
import { signIn } from "./helpers";
import { STAFF } from "./fixtures";

const PUBLIC_PAGES = ["/", "/tricks", "/tricks/miller", "/tricks/corkscrew", "/explore", "/about", "/community", "/videos", "/login", "/signup"];
const STAFF_PAGES = ["/collection", "/progress", "/assistant", "/settings", "/studio", "/studio/research", "/studio/review", "/studio/moderation"];

async function check(page: import("@playwright/test").Page, path: string, name: string) {
  await page.goto(path);
  await page.waitForLoadState("networkidle");
  // No horizontal scrolling at any viewport.
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, `${path} overflows horizontally by ${overflow}px`).toBeLessThanOrEqual(1);
  await page.screenshot({ path: `test-results/screens/${name}${path.replace(/\W+/g, "_")}.png`, fullPage: true });
}

test("public pages render without horizontal overflow", async ({ page }, info) => {
  for (const p of PUBLIC_PAGES) await check(page, p, info.project.name);
});

test("signed-in pages render without horizontal overflow", async ({ page }, info) => {
  await signIn(page, STAFF.admin.email, STAFF.admin.password);
  for (const p of STAFF_PAGES) await check(page, p, info.project.name);
});
