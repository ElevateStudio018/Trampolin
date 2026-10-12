import type { Metadata } from "next";
import { Card, Container, PageHeader } from "@/components/ui";
import { requireActor } from "@/server/auth/current";
import { SuggestForm } from "../entry-client";

export const metadata: Metadata = { title: "Suggest a skill" };

export default async function SuggestPage({ searchParams }: { searchParams: Promise<{ name?: string }> }) {
  const { name } = await searchParams;
  await requireActor("/tricks/suggest");
  return (
    <Container className="max-w-2xl">
      <PageHeader eyebrow="Trick Book" title="Suggest a missing skill or term" description="Suggestions go to the review queue. Nothing is published until a reviewer has checked it against a source." />
      <Card className="mt-6 p-5">
        <SuggestForm topic={typeof name === "string" ? name.slice(0, 80) : ""} />
      </Card>
    </Container>
  );
}
