import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Card, Container, EmptyState, LinkButton, PageHeader, SectionTitle, StatusBadge, formatBytes, formatDate } from "@/components/ui";
import { getActor } from "@/server/auth/current";
import { listMyVideos, listSharedVideos } from "@/server/video/service";

export const metadata: Metadata = { title: "Videos" };

function duration(ms: number | null) {
  if (!ms) return null;
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export default async function VideosPage() {
  const actor = await getActor();
  const [mine, shared] = await Promise.all([actor ? listMyVideos(actor) : Promise.resolve([]), listSharedVideos(actor)]);
  return (
    <Container>
      <PageHeader
        eyebrow="Video library"
        title="Videos"
        description="Store your training clips privately or share them with members. Automated skill recognition is in development and not yet available."
        actions={actor ? <LinkButton href="/videos/upload">Upload video</LinkButton> : <LinkButton href="/login?next=/videos">Sign in to upload</LinkButton>}
      />
      {actor && (
        <section className="mt-8" aria-labelledby="mine">
          <SectionTitle id="mine">My videos</SectionTitle>
          {mine.length === 0 ? (
            <EmptyState title="No videos yet" action={<LinkButton href="/videos/upload">Upload your first video</LinkButton>}>
              Uploads are private unless you choose otherwise.
            </EmptyState>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {mine.map(({ video: v, entryName }) => (
                <li key={v.id}>
                  <Link href={`/videos/${v.id}`} className="block h-full">
                    <Card className="flex h-full flex-col gap-2 p-4 hover:border-line-strong">
                      <div className="flex items-start justify-between gap-2">
                        <span className="font-medium">{v.title}</span>
                        <StatusBadge status={v.status} />
                      </div>
                      <p className="text-xs text-muted">
                        {formatDate(v.createdAt)} · {formatBytes(v.sizeBytes)}
                        {duration(v.durationMs) && ` · ${duration(v.durationMs)}`}
                      </p>
                      <div className="mt-auto flex flex-wrap gap-1.5">
                        <Badge tone={v.visibility === "private" ? "neutral" : "info"}>{v.visibility === "private" ? "Only me" : v.visibility}</Badge>
                        {entryName && <Badge tone="accent">{entryName}</Badge>}
                        {v.hiddenByModeration && <Badge tone="danger">hidden by moderators</Badge>}
                      </div>
                    </Card>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
      <section className="mt-10" aria-labelledby="shared">
        <SectionTitle id="shared">{actor ? "Shared by members" : "Public videos"}</SectionTitle>
        {shared.length === 0 ? (
          <p className="text-sm text-muted">Nothing shared yet.</p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {shared.map((v) => (
              <li key={v.id}>
                <Link href={`/videos/${v.id}`} className="block h-full">
                  <Card className="h-full p-4 hover:border-line-strong">
                    <p className="font-medium">{v.title}</p>
                    <p className="text-xs text-muted">
                      @{v.ownerHandle} · {formatDate(v.createdAt)}
                      {v.entryName && ` · ${v.entryName}`}
                    </p>
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </Container>
  );
}
