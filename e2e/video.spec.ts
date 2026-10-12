import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { signUp, uid } from "./helpers";

test("upload a video, see real metadata, keep it private, then delete it", async ({ page, browser }) => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "e2e-video-"));
  const file = path.join(dir, "jump.mp4");
  execFileSync("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "testsrc=duration=2:size=640x360:rate=25", "-pix_fmt", "yuv420p", "-c:v", "libx264", file]);
  const bad = path.join(dir, "notes.mp4");
  execFileSync("sh", ["-c", `printf 'just some text pretending to be a video file' > ${bad}`]);

  await signUp(page, `vid_${uid()}`);
  await page.goto("/videos/upload");
  await page.locator("#file").setInputFiles(bad);
  await page.getByLabel("Title", { exact: true }).fill("Not a video");
  await page.getByRole("button", { name: "Upload video" }).click();
  await expect(page.getByText(/Unsupported file type/)).toBeVisible();

  await page.locator("#file").setInputFiles(file);
  await page.getByLabel("Title", { exact: true }).fill("Tuck jump test");
  await page.getByRole("button", { name: "Upload video" }).click();
  await expect(page).toHaveURL(/\/videos\/[0-9a-f-]{36}$/);
  await expect(page.getByText("Ready").first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("640×360")).toBeVisible();
  const url = page.url();

  // Skill recognition is honestly unavailable.
  await expect(page.getByText("No skill-recognition model is connected")).toBeVisible();

  // Streaming works for the owner with range requests.
  const id = url.split("/").pop()!;
  const stream = await page.request.get(`/api/videos/${id}/stream`, { headers: { Range: "bytes=0-99" } });
  expect(stream.status()).toBe(206);
  expect((await stream.body()).length).toBe(100);

  // Another member gets a 404 for both the page and the file.
  const ctx = await browser.newContext();
  const other = await ctx.newPage();
  await signUp(other, `ov_${uid()}`);
  expect((await other.goto(url))?.status()).toBe(404);
  expect((await other.request.get(`/api/videos/${id}/stream`)).status()).toBe(404);
  await ctx.close();

  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Delete video" }).click();
  await expect(page).toHaveURL(/\/videos$/);
  expect((await page.request.get(`/api/videos/${id}/stream`)).status()).toBe(404);
});

test("cross-origin uploads are rejected", async ({ request }) => {
  const res = await request.post("/api/videos?title=x", { headers: { Origin: "https://evil.example" }, data: Buffer.from("x") });
  expect(res.status()).toBe(403);
});
