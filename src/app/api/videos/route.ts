import { after } from "next/server";
import { AppError, ValidationError, publicMessage } from "@/lib/errors";
import { getActor } from "@/server/auth/current";
import { isSameOrigin } from "@/server/csrf";
import { drain } from "@/server/jobs/runner";
import { storeUpload } from "@/server/video/service";

/**
 * Raw-body upload: the file is the request body; metadata travels in query parameters.
 * Streaming the body avoids buffering large videos in memory.
 */
export async function POST(req: Request) {
  if (!isSameOrigin(req)) return Response.json({ error: "Cross-origin request rejected" }, { status: 403 });
  const actor = await getActor();
  if (!actor) return Response.json({ error: "Please sign in" }, { status: 401 });
  if (!req.body) return Response.json({ error: "No file received" }, { status: 400 });
  const u = new URL(req.url);
  try {
    const video = await storeUpload(actor, req.body, u.searchParams.get("filename") ?? "", {
      title: u.searchParams.get("title") ?? "",
      description: u.searchParams.get("description") ?? "",
      visibility: (u.searchParams.get("visibility") ?? "private") as "private",
      entryId: u.searchParams.get("entryId") || null,
      trainingConsent: u.searchParams.get("trainingConsent") === "1",
    });
    // Process the probe right away in-process; a separate worker picks it up otherwise.
    after(() => drain(60_000, ["video.probe"]).catch((e) => console.error("[upload] probe", e)));
    return Response.json({ id: video.id }, { status: 201 });
  } catch (err) {
    if (!(err instanceof AppError)) console.error("[upload]", err);
    const status = err instanceof AppError ? err.status : 500;
    return Response.json({ error: publicMessage(err), fieldErrors: err instanceof ValidationError ? err.fieldErrors : undefined }, { status });
  }
}
