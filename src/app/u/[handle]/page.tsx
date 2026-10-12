import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, COLLECTION_META, Card, Container, EmptyState, SectionTitle, formatDate } from "@/components/ui";
import { getActor } from "@/server/auth/current";
import { getPublicProfile } from "@/server/me/profile";
import { listFeed } from "@/server/community/service";
import { ReportButton } from "@/app/community/report";

export const metadata: Metadata = { title: "Profile" };

export default async function ProfilePage({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  const actor = await getActor();
  const profile = await getPublicProfile(decodeURIComponent(handle), actor);
  if (!profile) notFound();
  const feed = await listFeed(actor, { authorId: profile.userId, limit: 10 });
  const landed = profile.collection?.filter((c) => c.status === "landed") ?? [];
  const working = profile.collection?.filter((c) => c.status === "working_on") ?? [];
  return (
    <Container className="max-w-4xl">
      <header className="flex flex-col gap-4 border-b border-line pb-6 pt-10 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <span aria-hidden className="grid size-16 place-items-center rounded-full bg-accent-soft text-2xl font-semibold text-accent">
            {profile.displayName.slice(0, 1).toUpperCase()}
          </span>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{profile.displayName}</h1>
            <p className="text-sm text-muted">
              @{profile.handle}
              {profile.homeClub && ` · ${profile.homeClub}`} · joined {formatDate(profile.joinedAt)}
            </p>
          </div>
        </div>
        {actor && actor.id !== profile.userId && <ReportButton targetType="profile" targetId={profile.userId} />}
      </header>
      {profile.bio && <p className="mt-4 max-w-2xl whitespace-pre-line text-ink-2">{profile.bio}</p>}
      <div className="mt-8 grid gap-8 md:grid-cols-2">
        <section>
          <SectionTitle>Collection</SectionTitle>
          {profile.collection === null ? (
            <p className="text-sm text-muted">This collection is private.</p>
          ) : profile.collection.length === 0 ? (
            <p className="text-sm text-muted">Nothing saved yet.</p>
          ) : (
            <div className="flex flex-col gap-4">
              {[{ label: COLLECTION_META.landed!.label, items: landed, tone: "ok" as const }, { label: COLLECTION_META.working_on!.label, items: working, tone: "accent" as const }].map(
                (g) =>
                  g.items.length > 0 && (
                    <div key={g.label}>
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">{g.label}</p>
                      <ul className="flex flex-wrap gap-1.5">
                        {g.items.map((c) => (
                          <li key={c.slug}>
                            <Link href={`/tricks/${c.slug}`}>
                              <Badge tone={g.tone}>{c.name}</Badge>
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ),
              )}
            </div>
          )}
        </section>
        <section>
          <SectionTitle>Videos</SectionTitle>
          {profile.videos.length === 0 ? (
            <p className="text-sm text-muted">No shared videos.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {profile.videos.map((v) => (
                <li key={v.id}>
                  <Link href={`/videos/${v.id}`} className="text-sm text-accent hover:underline">
                    ▶ {v.title}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
      <section className="mt-10">
        <SectionTitle>Posts</SectionTitle>
        {feed.items.length === 0 ? (
          <EmptyState title="No posts" />
        ) : (
          <ul className="flex flex-col gap-3">
            {feed.items.map((p) => (
              <li key={p.id}>
                <Card className="p-4">
                  <Link href={`/community/${p.id}`} className="whitespace-pre-line text-[15px] hover:text-accent">
                    {p.body}
                  </Link>
                  <p className="mt-2 text-xs text-muted">{formatDate(p.createdAt)} · {p.likes} likes · {p.commentCount} comments</p>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>
    </Container>
  );
}
