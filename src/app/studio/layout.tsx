import Link from "next/link";
import { Container } from "@/components/ui";
import { hasRole } from "@/server/actor";
import { requirePageRole } from "@/server/auth/current";
import { StudioNav } from "./studio-nav";

export default async function StudioLayout({ children }: { children: React.ReactNode }) {
  const actor = await requirePageRole("reviewer", "/studio");
  const items = [
    { href: "/studio", label: "Overview" },
    { href: "/studio/review", label: "Review queue" },
    { href: "/studio/research", label: "Research agent" },
    { href: "/studio/entries/new", label: "New entry" },
    { href: "/studio/sources", label: "Sources" },
    ...(hasRole(actor, "admin")
      ? [
          { href: "/studio/moderation", label: "Moderation" },
          { href: "/studio/users", label: "Users" },
        ]
      : []),
  ];
  return (
    <div>
      <div className="border-b border-line bg-surface">
        <Container className="flex items-center gap-4 overflow-x-auto py-2">
          <Link href="/studio" className="shrink-0 text-xs font-semibold uppercase tracking-[0.12em] text-pad">
            Studio
          </Link>
          <StudioNav items={items} />
        </Container>
      </div>
      {children}
    </div>
  );
}
