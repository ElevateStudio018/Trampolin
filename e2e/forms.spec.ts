import { expect, test } from "@playwright/test";
import { signIn, signOut, signUp, uid } from "./helpers";
import { STAFF } from "./fixtures";

test("settings: profile and privacy persist, password change works, export downloads", async ({ page }) => {
  const handle = `set_${uid()}`;
  await signUp(page, handle);
  await page.goto("/settings");
  await page.getByLabel("Display name").fill("Renamed Tester");
  await page.getByLabel("Home club").fill("E2E Flyers");
  await page.getByLabel("Who can see my collection").selectOption("public");
  await page.getByRole("button", { name: "Save settings" }).click();
  await expect(page.getByText("Settings saved.")).toBeVisible();
  // Regression: selects must not snap back to their old value after saving.
  await expect(page.getByLabel("Who can see my collection")).toHaveValue("public");
  await page.reload();
  await expect(page.getByLabel("Display name")).toHaveValue("Renamed Tester");
  await expect(page.getByLabel("Who can see my collection")).toHaveValue("public");

  // Export returns the user's own data as JSON.
  const res = await page.request.get("/api/me/export");
  expect(res.status()).toBe(200);
  const data = await res.json();
  expect(data.profile.homeClub).toBe("E2E Flyers");
  expect(JSON.stringify(data)).not.toMatch(/passwordHash|scrypt/);

  // Password change: wrong current password is rejected, the right one works.
  await page.getByLabel("Current password").fill("not my password");
  await page.getByLabel("New password", { exact: true }).fill("a different long password");
  await page.getByLabel("Repeat new password").fill("a different long password");
  await page.getByRole("button", { name: "Change password" }).click();
  await expect(page.getByText("Current password is incorrect")).toBeVisible();
  await page.getByLabel("Current password").fill("a long test password");
  await page.getByLabel("New password", { exact: true }).fill("a different long password");
  await page.getByLabel("Repeat new password").fill("a different long password");
  await page.getByRole("button", { name: "Change password" }).click();
  await expect(page.getByText("Password changed.")).toBeVisible();
  // This browser stays signed in.
  await page.reload();
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
  await signOut(page);
  await signIn(page, `${handle}@e2e.test`, "a different long password");
});

test("entry editor: create, add a sourced claim without losing unsaved edits, save, publish", async ({ page }) => {
  await signIn(page, STAFF.reviewer.email, STAFF.reviewer.password);
  const name = `E2E Skill ${uid()}`;
  await page.goto("/studio/entries/new");
  await page.getByLabel("Canonical name").fill(name);
  await page.getByLabel("Summary", { exact: true }).fill("A test skill created by the end-to-end suite.");
  await page.getByRole("button", { name: "Create draft entry" }).click();
  await expect(page).toHaveURL(/\/studio\/entries\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();

  // Publishing without a sourced claim is refused.
  await page.getByRole("button", { name: "Publish" }).click();
  await expect(page.getByText("Add at least one claim backed by a source before publishing.")).toBeVisible();

  // Unsaved edit in the entry form survives adding a claim.
  await page.getByLabel("Summary", { exact: true }).fill("Edited summary that has not been saved yet.");
  await page.getByLabel("Statement").fill("The test skill is defined by the example glossary.");
  await page.getByText("New source", { exact: true }).click();
  await page.getByLabel("URL").fill(`https://example.org/e2e-${uid()}`);
  await page.getByLabel("Title", { exact: true }).fill("Example glossary for e2e");
  await page.getByLabel("Excerpt").fill("The test skill is defined here.");
  await page.getByRole("button", { name: "Add claim" }).click();
  await expect(page.getByText("Claim added.")).toBeVisible();
  await expect(page.locator("li", { hasText: "The test skill is defined by the example glossary." }).first()).toBeVisible();
  await expect(page.getByLabel("Summary", { exact: true })).toHaveValue("Edited summary that has not been saved yet.");

  // The edit can still be saved (no false conflict), then published.
  await page.getByLabel("Change summary").fill("Clarified summary");
  await page.getByRole("button", { name: "Save revision" }).click();
  await expect(page.getByText("Saved as a new revision.")).toBeVisible();
  await page.getByRole("button", { name: "Publish" }).click();
  await expect(page.getByRole("link", { name: "View public page →" })).toBeVisible();
  await page.getByRole("link", { name: "View public page →" }).click();
  await expect(page.getByText("Edited summary that has not been saved yet.")).toBeVisible();
  await expect(page.getByText("Clarified summary")).toBeVisible();
});

test("admin promotes a member to reviewer", async ({ page, browser }) => {
  const handle = `promo_${uid()}`;
  const ctx = await browser.newContext();
  const member = await ctx.newPage();
  await signUp(member, handle);
  await member.goto("/studio");
  await expect(member).toHaveURL(/\/forbidden/);

  await signIn(page, STAFF.admin.email, STAFF.admin.password);
  await page.goto(`/studio/users?q=${handle}`);
  const row = page.locator("tr", { hasText: `@${handle}` });
  await row.getByLabel("Role").selectOption("reviewer");
  await row.getByRole("button", { name: "Set" }).click();
  await expect(row.getByLabel("Role")).toHaveValue("reviewer");

  await member.goto("/studio");
  await expect(member.getByRole("heading", { name: "Overview" })).toBeVisible();
  await ctx.close();
});

test("pages are served with a nonce-based CSP and scripts still run", async ({ page }) => {
  const violations: string[] = [];
  page.on("console", (m) => {
    if (/Content Security Policy|Refused to (execute|load)/i.test(m.text())) violations.push(m.text());
  });
  const res = await page.goto("/tricks");
  const csp = res?.headers()["content-security-policy"] ?? "";
  expect(csp).toMatch(/script-src 'self' 'nonce-[^']+' 'strict-dynamic'/);
  expect(csp).toContain("frame-ancestors 'none'");
  // Client-side navigation needs hydrated JS.
  await page.getByRole("link", { name: "Barani", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Barani" })).toBeVisible();
  await page.getByText("Show excerpt").first().click();
  await expect(page.locator("q").first()).toBeVisible();
  expect(violations).toEqual([]);
});
