import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Card, Container } from "@/components/ui";
import { getActor } from "@/server/auth/current";
import { SignUpForm } from "../auth-forms";

export const metadata: Metadata = { title: "Create account" };

export default async function SignUpPage() {
  if (await getActor()) redirect("/");
  return (
    <Container className="max-w-md py-12">
      <h1 className="mb-1 text-2xl font-semibold tracking-tight">Create your account</h1>
      <p className="mb-6 text-sm text-muted">Save skills to your collection, keep private training notes and store your videos.</p>
      <Card className="p-6">
        <SignUpForm />
      </Card>
    </Container>
  );
}
