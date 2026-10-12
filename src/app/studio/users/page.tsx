import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Container, PageHeader, formatDate } from "@/components/ui";
import { requirePageRole } from "@/server/auth/current";
import { listUsers } from "@/server/community/service";
import { RoleForm, SuspendButton } from "../moderation/forms";

export const metadata: Metadata = { title: "Users" };

export default async function UsersPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const actor = await requirePageRole("admin", "/studio/users");
  const { q = "" } = await searchParams;
  const users = await listUsers(actor, typeof q === "string" ? q.slice(0, 80) : "");
  return (
    <Container>
      <PageHeader eyebrow="Studio" title="Users" description="Roles: members use the app; reviewers edit the Trick Book and review drafts; admins also moderate and manage users." />
      <form className="mt-6" role="search">
        <label htmlFor="uq" className="sr-only">Search users</label>
        <input id="uq" name="q" defaultValue={q} placeholder="Search email or handle" className="h-9 w-full max-w-sm rounded-[var(--radius-control)] border border-line-strong bg-surface px-3 text-sm" />
      </form>
      <div className="mt-4 overflow-x-auto rounded-[var(--radius-card)] border border-line bg-surface">
        <table className="w-full text-sm">
          <thead className="text-left text-muted">
            <tr>
              {["User", "Email", "Joined", "Role", ""].map((h, i) => (
                <th key={i} className="px-4 py-2 font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-t border-line">
                <td className="px-4 py-2">
                  <Link href={`/u/${u.handle}`} className="font-medium hover:text-accent">
                    {u.displayName}
                  </Link>{" "}
                  <span className="text-muted">@{u.handle}</span> {u.suspendedAt && <Badge tone="danger">suspended</Badge>}
                </td>
                <td className="px-4 py-2 text-muted">{u.email}</td>
                <td className="px-4 py-2 text-muted">{formatDate(u.createdAt)}</td>
                <td className="px-4 py-2">{u.id === actor.id ? <Badge tone="accent">{u.role} (you)</Badge> : <RoleForm userId={u.id} role={u.role} />}</td>
                <td className="px-4 py-2">{u.id !== actor.id && <SuspendButton userId={u.id} suspended={!!u.suspendedAt} />}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Container>
  );
}
