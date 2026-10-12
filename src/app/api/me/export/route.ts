import { getActor } from "@/server/auth/current";
import { exportMyData } from "@/server/me/profile";

export async function GET() {
  const actor = await getActor();
  if (!actor) return Response.json({ error: "Please sign in" }, { status: 401 });
  const data = await exportMyData(actor);
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="trampolin-export-${actor.handle}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
