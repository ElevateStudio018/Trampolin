import type { Metadata } from "next";
import { Card, Container, PageHeader } from "@/components/ui";
import { env } from "@/lib/env";
import { requireActor } from "@/server/auth/current";
import { searchEntries } from "@/server/kb/entries";
import { Uploader } from "../uploader";

export const metadata: Metadata = { title: "Upload video" };

export default async function UploadPage() {
  const actor = await requireActor("/videos/upload");
  const list = await searchEntries({ sort: "name", pageSize: 100 }, actor);
  return (
    <Container className="max-w-2xl">
      <PageHeader eyebrow="Videos" title="Upload a video" description="Videos are private by default and stored on this server. Only you can delete them." />
      <Card className="mt-6 p-5">
        <Uploader maxBytes={env().VIDEO_MAX_BYTES} entries={list.items.map((e) => ({ id: e.id, name: e.canonicalName }))} />
      </Card>
    </Container>
  );
}
