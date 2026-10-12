import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Card, Container } from "@/components/ui";
import { getActor } from "@/server/auth/current";
import { SignInForm } from "../auth-forms";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next = "/" } = await searchParams;
  if (await getActor()) redirect("/");
  return (
    <Container className="max-w-md py-12">
      <h1 className="mb-1 text-2xl font-semibold tracking-tight">Sign in</h1>
      <p className="mb-6 text-sm text-muted">Pick up your collection, notes and videos.</p>
      <Card className="p-6">
        <SignInForm next={typeof next === "string" ? next : "/"} />
      </Card>
    </Container>
  );
}
