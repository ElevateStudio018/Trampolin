import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionButton } from "@/components/forms";
import { Badge, Container, formatDate } from "@/components/ui";
import { hasRole } from "@/server/actor";
import { getActor } from "@/server/auth/current";
import { getPost } from "@/server/community/service";
import { CommentForm } from "./comment-form";
import { deleteCommentAction, deletePostAction } from "../actions";
import { PostCard } from "../post-card";
import { ReportButton } from "../report";

export const metadata: Metadata = { title: "Post" };

export default async function PostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await getActor();
  const post = await getPost(actor, id);
  if (!post) notFound();
  const canDelete = actor && (actor.id === post.authorId || hasRole(actor, "admin"));
  return (
    <Container className="max-w-3xl py-8">
      <Link href="/community" className="text-sm text-muted hover:text-ink">
        ← Community
      </Link>
      <div className="mt-3">
        <PostCard post={post} signedIn={!!actor} linkToPost={false} />
      </div>
      <div className="mt-2 flex flex-wrap items-start gap-2">
        {canDelete && (
          <ActionButton action={deletePostAction} fields={{ postId: post.id }} variant="ghost" confirm="Delete this post?">
            Delete post
          </ActionButton>
        )}
        {actor && actor.id !== post.authorId && <ReportButton targetType="post" targetId={post.id} />}
      </div>
      <section className="mt-8" aria-labelledby="comments">
        <h2 id="comments" className="mb-3 font-semibold">
          Comments ({post.comments.length})
        </h2>
        <ul className="flex flex-col gap-3">
          {post.comments.map((c) => (
            <li key={c.id} className="rounded-[var(--radius-control)] border border-line bg-surface p-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <Link href={`/u/${c.authorHandle}`} className="font-medium hover:text-accent">
                  {c.authorName}
                </Link>
                <span className="text-xs text-muted">{formatDate(c.createdAt)}</span>
                {c.hidden && <Badge tone="danger">hidden</Badge>}
              </div>
              <p className="mt-1 whitespace-pre-line text-ink-2">{c.body}</p>
              <div className="mt-1 flex gap-1">
                {actor && (actor.id === c.authorId || hasRole(actor, "admin")) && (
                  <ActionButton action={deleteCommentAction} fields={{ commentId: c.id }} variant="ghost" confirm="Delete this comment?">
                    Delete
                  </ActionButton>
                )}
                {actor && actor.id !== c.authorId && <ReportButton targetType="comment" targetId={c.id} />}
              </div>
            </li>
          ))}
        </ul>
        {actor ? (
          <div className="mt-4">
            <CommentForm postId={post.id} />
          </div>
        ) : (
          <p className="mt-4 text-sm text-muted">
            <Link href={`/login?next=/community/${post.id}`} className="text-accent hover:underline">
              Sign in
            </Link>{" "}
            to comment.
          </p>
        )}
      </section>
    </Container>
  );
}
