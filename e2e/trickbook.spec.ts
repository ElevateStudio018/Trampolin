import { expect, test } from "@playwright/test";
import { signIn, signOut, signUp, uid } from "./helpers";
import { STAFF } from "./fixtures";

test("visitor searches with a misspelling and reads a sourced entry", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("searchbox", { name: "Search the Trick Book" }).fill("rudi");
  await page.getByRole("button", { name: "Search" }).click();
  await expect(page).toHaveURL(/\/tricks\?q=rudi/);
  await page.getByRole("link", { name: "Rudolph" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Rudolph" })).toBeVisible();
  await expect(page.getByText("Limited evidence").first()).toBeVisible();
  await page.getByText("Show excerpt").first().click();
  await expect(page.locator("q").first()).toContainText("one and a half twists");
  await expect(page.getByRole("link", { name: "Trampolining terms" })).toHaveAttribute("href", "https://en.wikipedia.org/wiki/Trampolining_terms");
});

test("alias URLs redirect and empty searches explain themselves", async ({ page }) => {
  await page.goto("/tricks/rudy");
  await expect(page).toHaveURL(/\/tricks\/rudolph$/);
  await page.goto("/tricks?q=zzzqqq");
  await expect(page.getByText("Nothing matches “zzzqqq”")).toBeVisible();
  const res = await page.goto("/tricks/does-not-exist");
  expect(res?.status()).toBe(404);
});

test("filters by category and conflicting evidence", async ({ page }) => {
  await page.goto("/tricks");
  await page.getByLabel("Evidence").selectOption("conflicting");
  await page.getByRole("button", { name: "Search" }).click();
  await expect(page.getByText("2 results")).toBeVisible();
  await expect(page.getByRole("link", { name: "Adolph" })).toBeVisible();
});

test("member saves an entry, it persists after reload, and stays private", async ({ page, browser }) => {
  const handle = `m_${uid()}`;
  await signUp(page, handle);
  await page.goto("/tricks/barani");
  await page.getByRole("button", { name: "Working on" }).click();
  await expect(page.getByRole("button", { name: "✓ Working on" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("button", { name: "✓ Working on" })).toBeVisible();

  // Private note on the entry.
  await page.getByLabel("Title", { exact: true }).fill("Felt the half twist");
  await page.getByRole("button", { name: "Save note" }).click();
  await expect(page.getByText("Saved to your private history.")).toBeVisible();
  await page.goto("/progress");
  await expect(page.getByText("Felt the half twist")).toBeVisible();

  await page.goto("/collection");
  await expect(page.getByRole("link", { name: "Barani" })).toBeVisible();

  // Another member cannot see the private collection on the profile.
  const ctx = await browser.newContext();
  const other = await ctx.newPage();
  await signUp(other, `o_${uid()}`);
  await other.goto(`/u/${handle}`);
  await expect(other.getByText("This collection is private.")).toBeVisible();
  await other.goto("/progress");
  await expect(other.getByText("Felt the half twist")).toHaveCount(0);
  await ctx.close();
  await signOut(page);
});

test("assistant answers with citations in retrieval-only mode and refuses coaching", async ({ page }) => {
  await signUp(page, `a_${uid()}`);
  await page.goto("/assistant");
  await expect(page.getByText("Retrieval-only mode")).toBeVisible();
  await page.getByLabel("Your question").fill("What's the difference between a ball out and a cody?");
  await page.getByRole("button", { name: "Ask" }).click();
  await expect(page.getByRole("heading", { name: "Citations" })).toBeVisible();
  await expect(page.getByRole("article", { name: "Answer" }).getByRole("link", { name: "Cody" }).first()).toBeVisible();

  await page.getByLabel("Your question").fill("How do I do a rudy step by step?");
  await page.getByRole("button", { name: "Ask" }).click();
  await expect(page.getByText("I don't give step-by-step instructions")).toBeVisible();
});

test("reviewer researches a draft entry from pasted text and approves it", async ({ page }) => {
  await signIn(page, STAFF.reviewer.email, STAFF.reviewer.password);
  await page.goto("/studio/research");
  await page.getByLabel("Existing entry").selectOption({ label: "Back somersault" });
  await page.getByText("Paste text from a page the server can't fetch").click();
  await page.getByLabel("Page URL").fill("https://example.org/glossary");
  await page.getByLabel("Page title").fill("Example glossary");
  await page.getByLabel("Text", { exact: true }).fill("Glossary. A back somersault is a full backward rotation from feet to feet on the trampoline. Opening hours are 9 to 5.");
  await page.getByRole("button", { name: "Start research" }).click();
  await expect(page.getByText(/Research job queued|already queued/)).toBeVisible();
  await page.getByRole("button", { name: "Process queue now" }).click();
  await expect(page.getByRole("link", { name: "View draft →" }).first()).toBeVisible({ timeout: 20_000 });
  await page.getByRole("link", { name: "View draft →" }).first().click();
  await expect(page.getByText("A back somersault is a full backward rotation").first()).toBeVisible();
  await expect(page.getByText("Opening hours")).toHaveCount(0);
  await page.getByRole("button", { name: "Approve selected" }).click();
  await expect(page.getByText("Decision: approved")).toBeVisible();

  // Still a draft: approval imports claims but does not publish without explicit consent.
  await signOut(page);
  const res = await page.goto("/tricks/back-somersault");
  expect(res?.status()).toBe(404);
});

test("community post can be reported and hidden by an admin", async ({ page, browser }) => {
  const authorCtx = await browser.newContext();
  const author = await authorCtx.newPage();
  await signUp(author, `p_${uid()}`);
  await author.goto("/community");
  const body = `Post to moderate ${uid()}`;
  await author.getByLabel("Post").fill(body);
  await author.getByRole("button", { name: "Post", exact: true }).click();
  await expect(author.getByText(body)).toBeVisible();

  await signUp(page, `r_${uid()}`);
  await page.goto("/community");
  await page.getByRole("link", { name: body }).click();
  await page.getByRole("button", { name: "Report" }).first().click();
  await page.getByRole("button", { name: "Send report" }).click();
  await expect(page.getByText("A moderator will review this.")).toBeVisible();
  await signOut(page);

  await signIn(page, STAFF.admin.email, STAFF.admin.password);
  await page.goto("/studio/moderation");
  const card = page.locator("li", { hasText: body });
  await card.getByRole("button", { name: "Hide content" }).click();
  await expect(page.locator("li", { hasText: body })).toHaveCount(0);
  await signOut(page);

  await signUp(page, `v_${uid()}`);
  await page.goto("/community");
  await expect(page.getByText(body)).toHaveCount(0);
  await authorCtx.close();
});

test("studio is closed to members", async ({ page }) => {
  await signUp(page, `s_${uid()}`);
  await page.goto("/studio");
  await expect(page).toHaveURL(/\/forbidden/);
});
