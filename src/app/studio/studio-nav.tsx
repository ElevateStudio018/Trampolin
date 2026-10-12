"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

export function StudioNav({ items }: { items: { href: string; label: string }[] }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Studio" className="flex gap-1">
      {items.map((i) => {
        const active = i.href === "/studio" ? pathname === "/studio" : pathname.startsWith(i.href);
        return (
          <Link
            key={i.href}
            href={i.href}
            aria-current={active ? "page" : undefined}
            className={cn("whitespace-nowrap rounded-[var(--radius-control)] px-3 py-1.5 text-sm", active ? "bg-surface-2 font-medium text-ink" : "text-muted hover:text-ink")}
          >
            {i.label}
          </Link>
        );
      })}
    </nav>
  );
}
