import Link from "next/link";
import { ActionButton } from "@/components/forms";
import { Badge, Card, formatDate } from "@/components/ui";
import type { FeedPost } from "@/server/community/service";
import { bookmarkAction, likeAction } from "./actions";

export function PostCard({ post, signedIn, linkToPost = true }: { post: FeedPost; signedIn: boolean; linkToPost?: boolean }) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 text-sm">
        <span aria-hidden className="grid size-8 place-items-center rounded-full bg-surface-2 text-xs font-semibold">
          {post.authorName.slice(0, 1).toUpperCase()}
        </span>
        <Link href={`/u/${post.authorHandle}`} className="font-medium hover:text-accent">
          {post.authorName}
        </Link>
        <span className="text-muted">@{post.authorHandle} · {formatDate(post.createdAt)}</span>
        {post.visibility === "public" && <Badge>public</Badge>}
        {post.hidden && <Badge tone="danger">hidden by moderators</Badge>}
      </div>
      <p className="mt-3 whitespace-pre-line text-[15px] leading-relaxed">
        {linkToPost ? (
          <Link href={`/community/${post.id}`} className="hover:text-accent">
            {post.body}
          </Link>
        ) : (
          post.body
        )}
      </p>
      {(post.entryName || (post.videoId && post.videoVisible)) && (
        <div className="mt-3 flex flex-wrap gap-2 text-sm">
          {post.entryName && (
            <Link href={`/tricks/${post.entrySlug}`} className="rounded-full bg-accent-soft px-2.5 py-1 text-accent">
              {post.entryName}
            </Link>
          )}
          {post.videoId && post.videoVisible && (
            <Link href={`/videos/${post.videoId}`} className="rounded-full bg-pad-soft px-2.5 py-1 text-pad">
              ▶ {post.videoTitle}
            </Link>
          )}
        </div>
      )}
      <div className="mt-3 flex items-center gap-1 text-sm">
        {signedIn ? (
          <>
            <ActionButton action={likeAction} fields={{ postId: post.id }} variant="ghost" ariaPressed={post.likedByMe} ariaLabel={post.likedByMe ? "Unlike" : "Like"}>
              {post.likedByMe ? "♥" : "♡"} {post.likes}
            </ActionButton>
            <ActionButton action={bookmarkAction} fields={{ postId: post.id }} variant="ghost" ariaPressed={post.bookmarkedByMe}>
              {post.bookmarkedByMe ? "Bookmarked" : "Bookmark"}
            </ActionButton>
          </>
        ) : (
          <span className="px-3 text-muted">♡ {post.likes}</span>
        )}
        <Link href={`/community/${post.id}`} className="px-3 text-muted hover:text-ink">
          {post.commentCount} comments
        </Link>
      </div>
    </Card>
  );
}
