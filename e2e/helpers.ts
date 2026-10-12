import { expect, type Page } from "@playwright/test";

export async function signUp(page: Page, handle: string) {
  await page.goto("/signup");
  await page.getByLabel("Display name").fill(`Tester ${handle}`);
  await page.getByLabel("Handle").fill(handle);
  await page.getByLabel("Email").fill(`${handle}@e2e.test`);
  await page.getByLabel("Password").fill("a long test password");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/collection\?welcome=1/);
}

export async function signIn(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
}

export async function signOut(page: Page) {
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByRole("link", { name: "Join" })).toBeVisible();
}

export const uid = () => Math.random().toString(36).slice(2, 8);
