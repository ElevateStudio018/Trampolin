import type { Metadata } from "next";
import Link from "next/link";
import { Card, Container, EmptyState, LinkButton, PageHeader } from "@/components/ui";
import { cn } from "@/lib/cn";
import { getActor } from "@/server/auth/current";
import { listBookmarks, listFeed } from "@/server/community/service";
import { searchEntries } from "@/server/kb/entries";
import { listMyVideos } from "@/server/video/service";
import { Composer } from "./composer";
import { PostCard } from "./post-card";

export const metadata: Metadata = { title: "Community" };

export default async function CommunityPage({ searchParams }: { searchParams: Promise<{ before?: string; tab?: string }> }) {
  const sp = await searchParams;
  const actor = await getActor();
  const tab = sp.tab === "bookmarks" && actor ? "bookmarks" : "feed";
  const feed = tab === "bookmarks" ? { items: await listBookmarks(actor), nextCursor: null } : await listFeed(actor, { before: sp.before });
  const [videos, entryList] = actor
    ? await Promise.all([listMyVideos(actor), searchEntries({ sort: "name", pageSize: 100 }, actor)])
    : [[], { items: [] }];

  return (
    <Container className="max-w-3xl">
      <PageHeader
        eyebrow="Community"
        title="Community"
        description={actor ? "Posts are visible to signed-in members unless you make them public." : "You're seeing public posts. Sign in to see members-only posts and join in."}
      />
      {actor ? (
        <>
          <Card className="mt-6 p-4">
            <Composer
              videos={videos.filter((v) => v.video.status === "ready" && v.video.visibility !== "private").map((v) => ({ id: v.video.id, title: v.video.title }))}
              entries={entryList.items.map((e) => ({ id: e.id, name: e.canonicalName }))}
            />
          </Card>
          <nav className="mt-6 flex gap-1" aria-label="Feed">
            {[
              ["feed", "Latest"],
              ["bookmarks", "Bookmarks"],
            ].map(([k, label]) => (
              <Link
                key={k}
                href={k === "feed" ? "/community" : "/community?tab=bookmarks"}
                aria-current={tab === k ? "page" : undefined}
                className={cn("rounded-full px-3 py-1.5 text-sm", tab === k ? "bg-ink text-bg" : "bg-surface-2 text-ink-2 hover:bg-line")}
              >
                {label}
              </Link>
            ))}
          </nav>
        </>
      ) : (
        <div className="mt-6 flex gap-2">
          <LinkButton href="/login?next=/community">Sign in</LinkButton>
          <LinkButton href="/signup" variant="secondary">
            Join
          </LinkButton>
        </div>
      )}
      <div className="mt-4 flex flex-col gap-3">
        {feed.items.length === 0 ? (
          <EmptyState title={tab === "bookmarks" ? "No bookmarks yet" : "No posts yet"}>{tab === "bookmarks" ? "Bookmark posts to find them here." : "Be the first to share something."}</EmptyState>
        ) : (
          feed.items.map((p) => <PostCard key={p.id} post={p} signedIn={!!actor} />)
        )}
      </div>
      {feed.nextCursor && (
        <div className="mt-6 flex justify-center">
          <LinkButton href={`/community?before=${encodeURIComponent(feed.nextCursor)}`} variant="secondary">
            Older posts
          </LinkButton>
        </div>
      )}
    </Container>
  );
}
