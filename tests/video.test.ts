import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";
import { runOne } from "@/server/jobs/runner";
import { storage } from "@/server/storage";
import { deleteVideo, getVideo, requestAnalysis, sniffVideoType, storeUpload, updateVideo, videoForStreaming } from "@/server/video/service";
import { addProgressLog } from "@/server/me/collection";
import { deleteAccount } from "@/server/me/profile";
import { makeUser } from "./helpers";

let mp4: Buffer;

function streamOf(buf: Buffer, chunk = 64 * 1024): ReadableStream<Uint8Array> {
  let i = 0;
  return new ReadableStream({
    pull(c) {
      if (i >= buf.length) return c.close();
      c.enqueue(new Uint8Array(buf.subarray(i, i + chunk)));
      i += chunk;
    },
  });
}

beforeAll(() => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "tb-video-"));
  const file = path.join(dir, "clip.mp4");
  execFileSync("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "testsrc=duration=1:size=320x240:rate=25", "-pix_fmt", "yuv420p", "-c:v", "libx264", file]);
  mp4 = readFileSync(file);
});

async function upload(owner: Parameters<typeof storeUpload>[0], buf = mp4, visibility: "private" | "members" | "public" = "private") {
  const v = await storeUpload(owner, streamOf(buf), "clip.mp4", { title: "Test clip", visibility });
  while (await runOne(["video.probe"])) {}
  return v;
}

describe("video upload", () => {
  it("sniffs containers from magic bytes", () => {
    expect(sniffVideoType(mp4.subarray(0, 16))).toBe("video/mp4");
    expect(sniffVideoType(new Uint8Array([0x1a, 0x45, 0xdf, 0xa3]))).toBe("video/webm");
    expect(sniffVideoType(new TextEncoder().encode("<html><body>hi</body></html>"))).toBeNull();
  });

  it("stores a valid video and extracts real metadata with ffprobe", async () => {
    const owner = await makeUser();
    const v = await upload(owner);
    const got = await getVideo(owner, v.id);
    expect(got!.video.status).toBe("ready");
    expect(got!.video.width).toBe(320);
    expect(got!.video.height).toBe(240);
    expect(got!.video.durationMs).toBeGreaterThan(900);
    expect(got!.video.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(existsSync(storage().pathFor(got!.video.storageKey))).toBe(true);
  });

  it("rejects non-video files and leaves nothing behind", async () => {
    const owner = await makeUser();
    await expect(storeUpload(owner, streamOf(Buffer.from("#!/bin/sh\necho not a video\n".repeat(10))), "evil.mp4", { title: "x" })).rejects.toBeInstanceOf(ValidationError);
    await expect(storeUpload(owner, streamOf(Buffer.alloc(0)), "empty.mp4", { title: "x" })).rejects.toBeInstanceOf(ValidationError);
  });

  it("rejects files over the size limit", async () => {
    const owner = await makeUser();
    const big = Buffer.concat([mp4.subarray(0, 16), Buffer.alloc(6 * 1024 * 1024)]);
    await expect(storeUpload(owner, streamOf(big), "big.mp4", { title: "Big" })).rejects.toThrow(/limit/);
  });

  it("marks a file that looks like MP4 but is corrupt as failed", async () => {
    const owner = await makeUser();
    const fake = Buffer.concat([mp4.subarray(0, 16), Buffer.alloc(2048, 7)]);
    const v = await upload(owner, fake);
    const got = await getVideo(owner, v.id);
    expect(got!.video.status).toBe("failed");
    expect(got!.video.statusMessage).toMatch(/couldn't read/);
  });
});

describe("video access control", () => {
  it("keeps private videos private and honours visibility", async () => {
    const owner = await makeUser();
    const other = await makeUser();
    const v = await upload(owner);
    expect(await getVideo(other, v.id)).toBeNull();
    expect(await getVideo(null, v.id)).toBeNull();
    expect(await videoForStreaming(other, v.id)).toBeNull();
    await updateVideo(owner, v.id, { title: "Shared", visibility: "members" });
    expect(await getVideo(other, v.id)).not.toBeNull();
    expect(await getVideo(null, v.id)).toBeNull();
    await expect(updateVideo(other, v.id, { title: "Hijack", visibility: "public" })).rejects.toBeInstanceOf(NotFoundError);
    await expect(deleteVideo(other, v.id)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("prevents attaching someone else's video to a progress log", async () => {
    const owner = await makeUser();
    const other = await makeUser();
    const v = await upload(owner);
    await expect(addProgressLog(other, { title: "steal", occurredOn: "2026-10-01", videoId: v.id })).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("deletes the stored file with the record", async () => {
    const owner = await makeUser();
    const v = await upload(owner);
    const p = storage().pathFor(v.storageKey);
    await deleteVideo(owner, v.id);
    expect(existsSync(p)).toBe(false);
    expect(await getVideo(owner, v.id)).toBeNull();
  });
});

describe("video analysis", () => {
  it("runs the real metadata analyzer and reports skill recognition as unavailable", async () => {
    const owner = await makeUser();
    const v = await upload(owner);
    const meta = await requestAnalysis(owner, v.id, "technical-metadata");
    expect(meta.status).toBe("queued");
    while (await runOne(["video.analyze"])) {}
    const got = await getVideo(owner, v.id);
    const done = got!.analyses.find((a) => a.analyzer === "technical-metadata")!;
    expect(done.status).toBe("succeeded");
    expect((done.result as { data: { width: number } }).data.width).toBe(320);
    expect((done.result as { limitations: string[] }).limitations.length).toBeGreaterThan(0);

    const skill = await requestAnalysis(owner, v.id, "skill-recognition");
    expect(skill.status).toBe("unavailable");
    expect(skill.result).toBeNull();
    expect(skill.message).toMatch(/in development/);
  });

  it("only the owner can request analysis", async () => {
    const owner = await makeUser();
    const other = await makeUser();
    const v = await upload(owner, mp4, "public");
    await expect(requestAnalysis(other, v.id, "technical-metadata")).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("account deletion", () => {
  it("removes the account, its rows and its stored files", async () => {
    const u = await makeUser();
    const v = await upload(u);
    const p = storage().pathFor(v.storageKey);
    await expect(deleteAccount(u, "wrong password")).rejects.toThrow(/incorrect/);
    await deleteAccount(u, u.password);
    expect(existsSync(p)).toBe(false);
    expect(await getVideo(null, v.id)).toBeNull();
  });
});
