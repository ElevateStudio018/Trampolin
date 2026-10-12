import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Card, Container, PageHeader, SectionTitle, buttonClass, formatDate } from "@/components/ui";
import { requireActor } from "@/server/auth/current";
import { getOwnProfile } from "@/server/me/profile";
import { ChangePasswordForm, DeleteAccountForm, ProfileForm } from "./forms";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const actor = await requireActor("/settings");
  const { profile, email, role, createdAt } = await getOwnProfile(actor);
  return (
    <Container className="max-w-3xl">
      <PageHeader
        eyebrow="Account"
        title="Profile & privacy"
        description={
          <>
            Signed in as {email} · member since {formatDate(createdAt)} {role !== "member" && <Badge tone="accent">{role}</Badge>}
          </>
        }
        actions={
          <Link href={`/u/${profile.handle}`} className={buttonClass("secondary")}>
            View public profile
          </Link>
        }
      />
      <div className="mt-6 flex flex-col gap-8">
        <Card className="p-5">
          <ProfileForm profile={profile} />
        </Card>
        <section>
          <SectionTitle>Password</SectionTitle>
          <Card className="p-5">
            <ChangePasswordForm />
          </Card>
        </section>
        <section>
          <SectionTitle>Your data</SectionTitle>
          <Card className="flex flex-col gap-3 p-5 text-sm sm:flex-row sm:items-center sm:justify-between">
            <p className="text-ink-2">Download everything we store about you as JSON: profile, collection, notes, video metadata, posts and assistant questions.</p>
            <a href="/api/me/export" className={buttonClass("secondary", "md", "shrink-0")} download>
              Export my data
            </a>
          </Card>
        </section>
        <section>
          <SectionTitle>Delete account</SectionTitle>
          <Card className="border-danger/30 p-5">
            <p className="mb-4 text-sm text-ink-2">
              Permanently deletes your account, collection, notes, uploaded video files, posts and comments. This can&apos;t be undone.
            </p>
            <DeleteAccountForm />
          </Card>
        </section>
      </div>
    </Container>
  );
}
