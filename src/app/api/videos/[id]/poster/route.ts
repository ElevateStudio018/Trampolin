import { Readable } from "node:stream";
import { getActor } from "@/server/auth/current";
import { storage } from "@/server/storage";
import { videoForStreaming } from "@/server/video/service";

/** Poster image, with the same visibility check as the video itself. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const video = await videoForStreaming(await getActor(), id);
  if (!video?.posterKey) return new Response("Not found", { status: 404 });
  const size = await storage().size(video.posterKey).catch(() => -1);
  if (size < 0) return new Response("Not found", { status: 404 });
  return new Response(Readable.toWeb(storage().createReadStream(video.posterKey)) as ReadableStream, {
    headers: { "Content-Type": "image/jpeg", "Content-Length": String(size), "Cache-Control": "private, max-age=300", "X-Content-Type-Options": "nosniff" },
  });
}
