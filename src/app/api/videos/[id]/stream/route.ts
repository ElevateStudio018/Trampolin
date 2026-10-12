import { Readable } from "node:stream";
import { getActor } from "@/server/auth/current";
import { storage } from "@/server/storage";
import { videoForStreaming } from "@/server/video/service";

/** Authorised, range-capable video streaming. Private files are never served from a public path. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await getActor();
  const video = await videoForStreaming(actor, id);
  if (!video) return new Response("Not found", { status: 404 });
  const size = await storage().size(video.storageKey).catch(() => -1);
  if (size < 0) return new Response("Not found", { status: 404 });
  const headers: Record<string, string> = {
    "Content-Type": video.mimeType,
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, no-store",
    "Content-Disposition": "inline",
    "X-Content-Type-Options": "nosniff",
  };
  const range = req.headers.get("range");
  const m = range ? /^bytes=(\d*)-(\d*)$/.exec(range) : null;
  if (m) {
    let start = m[1] ? Number(m[1]) : size - Number(m[2]);
    let end = m[1] && m[2] ? Number(m[2]) : size - 1;
    if (!m[1]) end = size - 1;
    start = Math.max(0, start);
    end = Math.min(end, size - 1);
    if (start > end || start >= size) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
    const stream = Readable.toWeb(storage().createReadStream(video.storageKey, { start, end })) as ReadableStream;
    return new Response(stream, { status: 206, headers: { ...headers, "Content-Range": `bytes ${start}-${end}/${size}`, "Content-Length": String(end - start + 1) } });
  }
  const stream = Readable.toWeb(storage().createReadStream(video.storageKey)) as ReadableStream;
  return new Response(stream, { headers: { ...headers, "Content-Length": String(size) } });
}
