import type { Metadata } from "next";
import { Card, Container, PageHeader } from "@/components/ui";
import { requirePageRole } from "@/server/auth/current";
import { listCategories } from "@/server/kb/entries";
import { EntryForm } from "../entry-form";

export const metadata: Metadata = { title: "New entry" };

export default async function NewEntryPage() {
  const actor = await requirePageRole("reviewer", "/studio/entries/new");
  const categories = await listCategories(actor);
  return (
    <Container className="max-w-3xl">
      <PageHeader eyebrow="Studio" title="New entry" description="New entries start as drafts. Add sourced claims, then publish." />
      <Card className="mt-6 p-5">
        <EntryForm
          categories={categories}
          initial={{ canonicalName: "", summary: "", body: "", kind: "skill", categorySlug: "", figNotation: "", quarterRotations: "", halfTwists: "", position: "", evidenceStatus: "limited_evidence", tags: "", aliases: "" }}
        />
      </Card>
    </Container>
  );
}
